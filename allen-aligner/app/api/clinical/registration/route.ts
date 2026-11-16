import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/app/lib/database';
import {workSessionActor} from '@/app/lib/work-auth';
import {clinicalActor} from '@/app/lib/clinical-auth';
import {decideClinicalRegistration} from '@/app/lib/clinical-registration-decision';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('request'),role:z.enum(['REVIEWER','LEAD']),reason:z.string().trim().min(10).max(2000)}).strict(),
 z.object({action:z.literal('decide'),accountId:z.string().uuid(),requestId:z.string().uuid(),decision:z.enum(['APPROVE','REJECT']),reason:z.string().trim().min(10).max(2000)}).strict(),
]);
export async function GET(r:Request){try{
 const a=await workSessionActor(r);
 const [row]=await db.query(`SELECT w."clinicalRole",w."clinicalRequest",e."fullName",e."permanentId" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1`,[a.id]);
 return Response.json({...row,mustChangePassword:a.mustChangePassword},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
export async function POST(r:Request){try{
 const parsed=schema.safeParse(await jsonBody(r));if(!parsed.success)throw new PortalError(400,'Select a clinical role and provide the required written information.');const b=parsed.data;
 if(b.action==='decide'){
  const administrator=await clinicalActor(r);
  if(administrator.role!=='ADMIN')throw new PortalError(403,'Clinical administrator approval required.');
  await db.transaction(tx=>decideClinicalRegistration(tx,b,{id:administrator.id,name:administrator.name,role:'ADMIN',source:'CLINICAL_ADMIN'}));
  return Response.json({message:'Registration decision recorded.'},{headers:{'Cache-Control':'no-store'}});
 }
 const a=await workSessionActor(r);
 if(a.mustChangePassword)throw new PortalError(403,'Use an active employee account and complete the employee password change first.');
 await db.transaction(async tx=>{
  const target=a.id;
  const [account]=await tx.query(`SELECT w.id,w.role,w."clinicalRole",w."clinicalRequest",w."isActive",w."mustChangePassword",e.status,e."fullName" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1 FOR UPDATE OF w`,[target]);
  if(!account)throw new PortalError(404,'Employee account not found.');
  if(!account.isActive||account.status!=='ACTIVE'||account.mustChangePassword)throw new PortalError(403,'Use an active employee account and complete the employee password change first.');
  const request={id:randomUUID(),role:b.role,reason:b.reason,status:'PENDING',requestedAt:new Date().toISOString()};
   if(account.role==='CLINICAL_ONLY'&&b.role!=='REVIEWER')throw new PortalError(403,'This invitation is for Clinical Reviewer access only.');
   if(account.clinicalRole)throw new PortalError(409,'Clinical access already exists. Contact your administrator for role changes.');
   if(account.clinicalRequest?.status==='PENDING')throw new PortalError(409,'Your registration is already awaiting approval.');
   await tx.query('UPDATE "WorkAccount" SET "clinicalRequest"=$2::jsonb WHERE id=$1',[target,JSON.stringify(request)]);
  await tx.query(`INSERT INTO "ClinicalReviewAudit"("actorId","actorName",action,detail) VALUES($1,$2,$3,$4::jsonb)`,[a.id,account.fullName,'CLINICAL_REGISTRATION',JSON.stringify({accountId:target,before:account.clinicalRequest,after:request})]);
 });return Response.json({message:b.action==='request'?'Registration received. Clinical administrator approval is required before case access.':'Registration decision recorded.'},{status:b.action==='request'?202:200,headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
