import {randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {db} from '@/app/lib/database';
import {digest,sameOrigin,throttle} from '@/app/lib/portal-auth';
import {failure,jsonBody,PortalError} from '@/app/lib/portal-http';
import {activateReviewer,reviewerCredentials} from '@/app/lib/reviewer-access';
import {assertClinicalRegistrationAllowsAccess,latestRegistrationStatus} from '@/app/lib/clinical-registration/access-control';
export async function POST(r:Request){try{
 if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');
 const body=await jsonBody(r),email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!await throttle('clinical-access:'+digest(email),10))throw new PortalError(429,'Too many attempts. Try again later.');
 if(body.action==='activate'){const {action,...input}=body;void action;return Response.json(await activateReviewer(input),{headers:{'Cache-Control':'no-store'}});}
 if(body.action!=='login')throw new PortalError(400,'Choose login or activation.');
 const {action,...input}=body;void action;const a=await reviewerCredentials(input);
 const [access]=await db.query(`SELECT "clinicalRole","employeeId" FROM "WorkAccount" WHERE id=$1 AND "isActive"`,[a.id]);
 if(!access?.clinicalRole)throw new PortalError(403,'Clinical access has not been approved. No session was created.');
 assertClinicalRegistrationAllowsAccess(await latestRegistrationStatus(access.employeeId??null));
 const token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+8*3600000),jar=await cookies();
 await db.transaction(async tx=>{
  const [active]=await tx.query(`SELECT w.id FROM "WorkAccount" w JOIN "ClinicalIdentity" i ON i."accountId"=w.id WHERE w.id=$1 AND w."passwordHash"=$2 AND w."isActive" AND i.status='ACTIVE' FOR SHARE OF w`,[a.id,a.passwordHash]);
  if(!active)throw new PortalError(401,'Account unavailable.');
  const previous=jar.get('allen_work_session')?.value;if(previous)await tx.query(`DELETE FROM "WorkSession" WHERE "tokenHash"=$1`,[digest(previous)]);
  await tx.query(`INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,$3)`,[digest(token),a.id,expires]);
 });
 jar.set('allen_work_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});
 return Response.json({message:'Signed in.'},{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
