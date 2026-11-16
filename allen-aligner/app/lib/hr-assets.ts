import 'server-only';
import { z } from 'zod';
import { currentHR } from './hr-auth';
import { hrRequireEmployee } from './hr-scope';
import { db } from './database';
import { PortalError } from './portal-http';
import { sameOrigin } from './portal-auth';
export async function assetActor(r:Request){if(r.method!=='GET'&&!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');const a=await currentHR();if(!a)throw new PortalError(401,'HR login required.');if(!['HR_ADMIN','HR_OFFICER'].includes(a.role))throw new PortalError(403,'HR permission required.');return a;}
export async function assetRows(employeeId:string,a:{id:string;role:string}){await hrRequireEmployee(a,employeeId);return db.query('SELECT * FROM "HRAssetIssue" WHERE "employeeId"=$1 ORDER BY "issuedAt" DESC',[employeeId]);}
export async function assetSave(a:{id:string;role:string},body:unknown,offboardingId?:string){
 const p=z.object({employeeId:z.string().min(1).max(100),action:z.enum(['ISSUE','RETURN','NO_ASSETS']),assetId:z.uuid().optional(),assetName:z.string().trim().min(2).max(150).optional(),serialNumber:z.string().trim().max(100).optional(),confirmed:z.boolean().optional()}).safeParse(body);if(!p.success)throw new PortalError(400,'Check asset details.');const b=p.data;await hrRequireEmployee(a,b.employeeId);
 return db.transaction(async tx=>{
  if(offboardingId){const [o]=await tx.query('SELECT * FROM "EmployeeOffboarding" WHERE id=$1 AND "employeeId"=$2 FOR UPDATE',[offboardingId,b.employeeId]);if(!o||['COMPLETED','CANCELLED'].includes(o.status))throw new PortalError(409,'Offboarding is closed.');}
  const [employee]=await tx.query('SELECT status FROM "Employee" WHERE id=$1 FOR UPDATE',[b.employeeId]);if(!employee)throw new PortalError(404,'Employee not found.');
  let assetCode='';
  if(b.action==='ISSUE'){
   if(employee.status!=='ACTIVE'||!b.assetName)throw new PortalError(409,'An active employee and asset name are required.');
   const [row]=await tx.query('INSERT INTO "HRAssetIssue"("employeeId","assetName","serialNumber","issuedById") VALUES($1,$2,$3,$4) RETURNING id,"assetCode"',[b.employeeId,b.assetName,b.serialNumber||null,a.id]);assetCode=row.assetCode;
   await tx.query(`INSERT INTO "HRAssetActivity"("assetId","actorId",action) VALUES($1,$2,'ISSUED')`,[row.id,a.id]);
  }else if(b.action==='RETURN'){
   if(!b.assetId)throw new PortalError(400,'Select an asset.');
   const [row]=await tx.query(`UPDATE "HRAssetIssue" SET status='RETURNED',"returnedAt"=now(),"returnedById"=$3 WHERE id=$1 AND "employeeId"=$2 AND status='ISSUED' RETURNING "assetCode"`,[b.assetId,b.employeeId,a.id]);if(!row)throw new PortalError(409,'Asset not found or already returned.');assetCode=row.assetCode;
   await tx.query(`INSERT INTO "HRAssetActivity"("assetId","actorId",action) VALUES($1,$2,'RETURNED')`,[b.assetId,a.id]);
  }else if(!offboardingId||!b.confirmed||a.role!=='HR_ADMIN')throw new PortalError(403,'Administrator confirmation required.');
  const pending=await tx.query(`SELECT id FROM "HRAssetIssue" WHERE "employeeId"=$1 AND status='ISSUED'`,[b.employeeId]);
  if(b.action==='NO_ASSETS'&&pending.length)throw new PortalError(409,'Outstanding assets must be returned.');
  await tx.query('INSERT INTO "ManagementAudit"("actorId",scope,action,"recordId") VALUES($1,\'HR\',$2,$3)',[a.id,'asset.'+b.action,b.assetId||b.employeeId]);
  return {success:true,message:pending.length?'Asset saved. Outstanding assets remain.':'Asset saved. No outstanding registered assets.',assetCode};
 });
}
