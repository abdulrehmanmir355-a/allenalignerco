import { hrScope,hrRequireEmployee,type HRIdentity } from './hr-scope';
import { updateEmployee } from './employee-service';
import "server-only";
import { z } from "zod";
import { db, type Database } from "./database";
import { PortalError } from "./portal-http";
const text = (max=120) => z.string().trim().min(1).max(max);
const day = z.iso.date();
const id = text(100);
export const hrSchemas = {
 departments:z.object({name:text()}),designations:z.object({name:text()}),
 attendance:z.object({employeeId:id,day,status:z.enum(['PRESENT','ABSENT','REMOTE','HOLIDAY'])}),
 leave:z.object({employeeId:id,startDate:day,endDate:day,reason:text(1000)}).refine(v=>v.endDate>=v.startDate,'End date must follow start date.'),
 onboarding:z.object({employeeId:id,task:text(200)}),
 offboarding:z.object({employeeId:id,exitType:z.enum(['RESIGNATION','TERMINATION','RETIREMENT','CONTRACT_END']),lastWorkingDay:day,reason:text(1000)}),
 assets:z.object({offboardingId:id,assetName:text(150),assetCode:text(80)}),
 clearance:z.object({offboardingId:id,department:text(40),remarks:z.string().trim().max(1000)}),
 employees:z.object({id,fullName:text(200),email:z.email().max(254),department:text(),designation:text(),joinedOn:day}),
 users:z.object({id:z.uuid(),role:z.enum(['HR_ADMIN','HR_OFFICER','HR_VIEWER']),isActive:z.enum(['true','false'])}),
};
export type HRSection=keyof typeof hrSchemas | 'reports';
export async function audit(tx:Database,actorId:string,scope:string,action:string,recordId:string,employeeId:string|null=null){
 const hr=scope.toUpperCase()==='HR';
 if(hr&&!employeeId&&action.startsWith('document.')){const [document]=await tx.query('SELECT "employeeId" FROM "EmployeeDocument" WHERE id::text=$1',[recordId]);employeeId=document?String(document.employeeId):null;}
 await tx.query('INSERT INTO "ManagementAudit" ("actorId","scope","action","recordId","employeeId","hrActorId") VALUES($1,$2,$3,$4,$5,$6)',[actorId,scope,action,recordId,employeeId,hr?actorId:null]);
}
async function employmentStatus(tx:Database,user:{id:string;role:string},employeeId:string,status:string){
 const [employee]=await tx.query('SELECT "fullName",email,status FROM "Employee" WHERE id=$1 FOR UPDATE',[employeeId]);
 if(!employee)throw new PortalError(404,'Employee not found.');
 if(employee.status===status)return;
 await tx.query('INSERT INTO "EmployeeProfileHistory"("employeeId","oldFullName","newFullName","oldEmail","newEmail","oldStatus","newStatus","changedBy","changedByHrUserId") VALUES($1,$2,$2,$3,$3,$4,$5,$6,$6::uuid)',[employeeId,employee.fullName,employee.email??'',employee.status,status,user.id]);
 await tx.query('UPDATE "Employee" SET status=$2,"updatedAt"=NOW() WHERE id=$1',[employeeId,status]);
}
export async function hrRows(section:HRSection,user:HRIdentity){
 if(!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(String(user.role))||(section==='users'&&user.role!=='HR_ADMIN'))throw new PortalError(403,'HR permission required.');
 const queries:Record<HRSection,string>={
 departments:'SELECT id,name FROM "HRDepartment" ORDER BY name',designations:'SELECT id,name FROM "HRDesignation" ORDER BY name',
 employees:'SELECT id,"employeeCode","fullName",email,department,designation,"joinedOn",status FROM "Employee" ORDER BY "createdAt" DESC LIMIT 500',
 attendance:'SELECT a.*,e."fullName" FROM "HRAttendance" a JOIN "Employee" e ON e.id=a."employeeId" ORDER BY day DESC LIMIT 500',
 leave:'SELECT l.*,e."fullName" FROM "HRLeave" l JOIN "Employee" e ON e.id=l."employeeId" ORDER BY "createdAt" DESC LIMIT 500',
 onboarding:'SELECT o.*,e."fullName" FROM "HROnboarding" o JOIN "Employee" e ON e.id=o."employeeId" ORDER BY e."fullName" LIMIT 500',
 offboarding:'SELECT o.*,e."fullName" FROM "EmployeeOffboarding" o JOIN "Employee" e ON e.id=o."employeeId" ORDER BY o."createdAt" DESC LIMIT 500',
 assets:'SELECT a.*,e."fullName" FROM "OffboardingAsset" a JOIN "EmployeeOffboarding" o ON o.id=a."offboardingId" JOIN "Employee" e ON e.id=o."employeeId" LIMIT 500',
 clearance:'SELECT a.*,e."fullName" FROM "OffboardingClearance" a JOIN "EmployeeOffboarding" o ON o.id=a."offboardingId" JOIN "Employee" e ON e.id=o."employeeId" LIMIT 500',
 users:'SELECT id,email,"fullName",role,"isActive" FROM "HRUser" ORDER BY email LIMIT 500',
 reports:`SELECT department,status,COUNT(*)::int AS employees FROM "Employee" GROUP BY department,status ORDER BY department,status`
 };const scope=hrScope(user);return db.query(scope.sql+queries[section],scope.args);
}
export async function hrCreate(section:HRSection,body:unknown,user:{id:string;role:string}) {
 if(!['HR_ADMIN','HR_OFFICER'].includes(user.role)||(section==='users'&&user.role!=='HR_ADMIN'))throw new PortalError(403,'Permission denied.');
 if(section==='reports')throw new PortalError(400,'Reports are read only.');
 const parsed=hrSchemas[section].safeParse(body);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0].message);
 const v=parsed.data as Record<string,string>;
 if(section==='employees')return updateEmployee(v.id,{fullName:v.fullName,email:v.email,department:v.department,designation:v.designation,joinedOn:v.joinedOn},user);
 let targetEmployeeId=v.employeeId||null;
 if(v.employeeId)await hrRequireEmployee(user,v.employeeId);
 if(v.offboardingId){const [o]=await db.query('SELECT "employeeId" FROM "EmployeeOffboarding" WHERE id=$1',[v.offboardingId]);if(!o)throw new PortalError(404,'Record not found.');targetEmployeeId=String(o.employeeId);await hrRequireEmployee(user,targetEmployeeId);}
 return db.transaction(async tx=>{
  let rows: Awaited<ReturnType<typeof tx.query>> = [];
  if(v.employeeId){const e=await tx.query('SELECT status FROM "Employee" WHERE id=$1 FOR UPDATE',[v.employeeId]);if(!e.length||e[0].status==='INACTIVE')throw new PortalError(409,'An active employee is required.');}
  if(v.offboardingId){const o=await tx.query('SELECT status FROM "EmployeeOffboarding" WHERE id=$1 FOR UPDATE',[v.offboardingId]);if(!o.length||['COMPLETED','CANCELLED'].includes(o[0].status))throw new PortalError(409,'An open offboarding record is required.');}
  switch(section){
   case 'departments': rows=await tx.query('INSERT INTO "HRDepartment" (name) VALUES($1) RETURNING id',[v.name]);break;
   case 'designations': rows=await tx.query('INSERT INTO "HRDesignation" (name) VALUES($1) RETURNING id',[v.name]);break;
   case 'attendance': rows=await tx.query('INSERT INTO "HRAttendance" ("employeeId",day,status,"recordedBy") VALUES($1,$2,$3,$4) ON CONFLICT ("employeeId",day) DO UPDATE SET status=EXCLUDED.status,"recordedBy"=EXCLUDED."recordedBy" RETURNING id',[v.employeeId,v.day,v.status,user.id]);break;
   case 'leave': if((await tx.query(`SELECT id FROM "HRLeave" WHERE "employeeId"=$1 AND status!='REJECTED' AND "startDate"<=$3::date AND "endDate">=$2::date`,[v.employeeId,v.startDate,v.endDate])).length)throw new PortalError(409,'Overlapping leave already exists.');rows=await tx.query('INSERT INTO "HRLeave" ("employeeId","startDate","endDate",reason) VALUES($1,$2,$3,$4) RETURNING id',[v.employeeId,v.startDate,v.endDate,v.reason]);break;
   case 'onboarding': rows=await tx.query('INSERT INTO "HROnboarding" ("employeeId",task) VALUES($1,$2) RETURNING id',[v.employeeId,v.task]);break;
   case 'offboarding': if((await tx.query(`SELECT id FROM "EmployeeOffboarding" WHERE "employeeId"=$1 AND status NOT IN ('COMPLETED','CANCELLED')`,[v.employeeId])).length)throw new PortalError(409,'An open offboarding record already exists.');rows=await tx.query('INSERT INTO "EmployeeOffboarding" ("employeeId","exitType","lastWorkingDay",reason) VALUES($1,$2,$3,$4) RETURNING id',[v.employeeId,v.exitType,v.lastWorkingDay,v.reason]);await employmentStatus(tx,user,v.employeeId,'OFFBOARDING');await tx.query(`INSERT INTO "OffboardingClearance" ("offboardingId",department) VALUES($1,'HR'),($1,'IT'),($1,'Finance')`,[rows[0].id]);break;
   case 'assets': rows=await tx.query('INSERT INTO "OffboardingAsset" ("offboardingId","assetName","assetCode") VALUES($1,$2,$3) RETURNING id',[v.offboardingId,v.assetName,v.assetCode]);break;
   case 'clearance': rows=await tx.query('INSERT INTO "OffboardingClearance" ("offboardingId",department,remarks) VALUES($1,$2,$3) RETURNING id',[v.offboardingId,v.department,v.remarks]);break;
   case 'users': await tx.query('LOCK TABLE "HRUser" IN SHARE ROW EXCLUSIVE MODE');if(v.id===user.id&&(v.role!=='HR_ADMIN'||v.isActive!=='true'))throw new PortalError(409,'You cannot revoke your own administrator access.');rows=await tx.query('UPDATE "HRUser" SET role=$2,"isActive"=$3 WHERE id=$1 RETURNING id',[v.id,v.role,v.isActive==='true']);await tx.query('DELETE FROM "HRSession" WHERE "hrUserId"=$1',[v.id]);break;
  }
  if(!rows?.length)throw new PortalError(404,'Record not found.');await audit(tx,user.id,'HR',section+'.save',String(rows[0].id),targetEmployeeId);return rows[0];
 });
}
export async function hrTransition(section:HRSection,body:unknown,user:{id:string;role:string}) {
 if(!['HR_ADMIN','HR_OFFICER'].includes(user.role))throw new PortalError(403,'Permission denied.');
 const parsed=z.object({id:text(100),status:text(30)}).safeParse(body);if(!parsed.success)throw new PortalError(400,'Invalid update.');const {id,status}=parsed.data;
 const tables:Partial<Record<HRSection,string>>={leave:"HRLeave",onboarding:"HROnboarding",offboarding:"EmployeeOffboarding",assets:"OffboardingAsset",clearance:"OffboardingClearance"};const table=tables[section];if(!table)throw new PortalError(400,"Invalid transition.");const rows=await db.query(`SELECT * FROM "${table}" WHERE id=$1`,[id]);if(!rows.length)throw new PortalError(404,"Record not found.");let employeeId=rows[0].employeeId;if(rows[0].offboardingId){const [o]=await db.query('SELECT "employeeId" FROM "EmployeeOffboarding" WHERE id=$1',[rows[0].offboardingId]);employeeId=o?.employeeId;}await hrRequireEmployee(user,String(employeeId));
 return db.transaction(async tx=>{
  let rows: Awaited<ReturnType<typeof tx.query>> = [];
  if(section==='leave'&&['APPROVED','REJECTED'].includes(status))rows=await tx.query(`UPDATE "HRLeave" SET status=$2,"reviewedBy"=$3 WHERE id=$1 AND status='PENDING' RETURNING id`,[id,status,user.id]);
  else if(section==='onboarding'&&status==='COMPLETED')rows=await tx.query(`UPDATE "HROnboarding" SET status=$2,"completedBy"=$3 WHERE id=$1 AND status='PENDING' RETURNING id`,[id,status,user.id]);
  else if(section==='assets'&&status==='RETURNED') {const a=await tx.query('SELECT "offboardingId" FROM "OffboardingAsset" WHERE id=$1',[id]);if(a.length){const parent=await tx.query('SELECT status FROM "EmployeeOffboarding" WHERE id=$1 FOR UPDATE',[a[0].offboardingId]);if(!parent.length||['COMPLETED','CANCELLED'].includes(parent[0].status))throw new PortalError(409,'Offboarding is closed.');}rows=await tx.query('UPDATE "OffboardingAsset" SET returned=true,"returnedAt"=NOW() WHERE id=$1 RETURNING id',[id]);}
  else if(section==='clearance'&&['CLEARED','BLOCKED'].includes(status)){const a=await tx.query('SELECT "offboardingId" FROM "OffboardingClearance" WHERE id=$1',[id]);if(a.length){const parent=await tx.query('SELECT status FROM "EmployeeOffboarding" WHERE id=$1 FOR UPDATE',[a[0].offboardingId]);if(!parent.length||['COMPLETED','CANCELLED'].includes(parent[0].status))throw new PortalError(409,'Offboarding is closed.');}rows=await tx.query('UPDATE "OffboardingClearance" SET status=$2,"clearedBy"=$3,"clearedByHrUserId"=$3::uuid,"clearedAt"=NOW() WHERE id=$1 RETURNING id',[id,status,user.id]);}
  else if(section==='offboarding'&&['COMPLETED','CANCELLED'].includes(status)){
   const o=(await tx.query('SELECT * FROM "EmployeeOffboarding" WHERE id=$1 FOR UPDATE',[id]))[0];if(!o||['COMPLETED','CANCELLED'].includes(o.status))throw new PortalError(409,'Record is already closed.');
   if(status==='COMPLETED'){const pending=await tx.query(`SELECT id FROM "OffboardingClearance" WHERE "offboardingId"=$1 AND status!='CLEARED' UNION ALL SELECT id FROM "OffboardingAsset" WHERE "offboardingId"=$1 AND returned=false`,[id]);const registered=await tx.query('SELECT id FROM "HRAssetIssue" WHERE "employeeId"=$1 AND status=$2',[o.employeeId,'ISSUED']);if(pending.length||registered.length)throw new PortalError(409,'Complete all clearance and return all assets first.');}
   rows=await tx.query('UPDATE "EmployeeOffboarding" SET status=$2,"updatedAt"=NOW() WHERE id=$1 RETURNING id',[id,status]);await employmentStatus(tx,user,String(o.employeeId),status==='COMPLETED'?'INACTIVE':'ACTIVE');
  }else throw new PortalError(400,'Unsupported transition.');
  if(!rows?.length)throw new PortalError(409,'Record is missing or already changed.');await audit(tx,user.id,'HR',section+'.'+status,id,String(employeeId));return rows[0];
 });
}
