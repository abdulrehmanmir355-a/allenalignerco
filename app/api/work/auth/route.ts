import { randomBytes } from 'node:crypto';
import { compare,hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { db } from '../../../lib/database';
import { digest,sameOrigin,throttle } from '../../../lib/portal-auth';
import { failure,jsonBody,PortalError } from '../../../lib/portal-http';
import { workActor } from '../../../lib/work-auth';
export async function POST(r:Request){try{
 if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');
 const v=z.object({employeeId:z.string().trim().min(3).max(40),password:z.string().min(1).max(72)}).parse(await jsonBody(r));
 if(!await throttle('work-login:'+digest(v.employeeId.toLowerCase()),10))throw new PortalError(429,'Too many attempts. Try later.');
 const [a]=await db.query(`SELECT a.* FROM "WorkAccount" a JOIN "Employee" e ON e.id=a."employeeId"
  WHERE (UPPER(BTRIM(e."permanentId"))=UPPER($1) OR UPPER(BTRIM(COALESCE(e."employeeCode",'')))=UPPER($1))
   AND e.status='ACTIVE' AND a."isActive"
  ORDER BY CASE WHEN UPPER(BTRIM(e."permanentId"))=UPPER($1) THEN 0 ELSE 1 END LIMIT 1`,[v.employeeId]);
 if(!a||!a.passwordHash||!await compare(v.password,String(a.passwordHash)))throw new PortalError(401,'Invalid employee ID or password.');
 const token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+8*3600000);
 await db.query('INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,$3)',[digest(token),a.id,expires]);
 (await cookies()).set('allen_work_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});
 return Response.json({success:true});
 }catch(e){return failure(e instanceof z.ZodError?new PortalError(400,'Invalid login.'):e)}}
export async function PATCH(r:Request){try{
 const a=await workActor(r);if(!a.employeeId)throw new PortalError(403,'Employee account required.');
 const v=z.object({currentPassword:z.string().max(72),newPassword:z.string().min(12).max(72)}).parse(await jsonBody(r));
 if(!await throttle('work-password:'+a.id,10))throw new PortalError(429,'Try again later.');
 const [account]=await db.query('SELECT "passwordHash" FROM "WorkAccount" WHERE id=$1',[a.id]);
 if(!await compare(v.currentPassword,String(account.passwordHash)))throw new PortalError(401,'Current password is incorrect.');
 await db.transaction(async tx=>{await tx.query('UPDATE "WorkAccount" SET "passwordHash"=$2,"mustChangePassword"=false WHERE id=$1',[a.id,await hash(v.newPassword,12)]);await tx.query('DELETE FROM "WorkSession" WHERE "accountId"=$1',[a.id]);});
 (await cookies()).delete('allen_work_session');return Response.json({message:'Password changed. Sign in again.'});
 }catch(e){return failure(e instanceof z.ZodError?new PortalError(400,'Use a password of 12–72 characters.'):e)}}
export async function DELETE(r:Request){try{if(!sameOrigin(r))throw new PortalError(403,'Invalid request origin.');const jar=await cookies(),token=jar.get('allen_work_session')?.value;if(token)await db.query('DELETE FROM "WorkSession" WHERE "tokenHash"=$1',[digest(token)]);jar.delete('allen_work_session');return Response.json({success:true});}catch(e){return failure(e)}}
