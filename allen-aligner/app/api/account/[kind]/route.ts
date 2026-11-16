import { z } from "zod";
import { compare } from "bcryptjs";
import { hashNewPassword,newPasswordSchema } from "../../../lib/password-format";
import { cookies } from "next/headers";
import { currentDoctor,sameOrigin,throttle,digest } from "../../../lib/portal-auth";
import { currentHR } from "../../../lib/hr-auth";
import { currentClinic } from "../../../lib/clinic-auth";
import { db } from "../../../lib/database";
import { audit } from "../../../lib/hr-management";
import { failure,jsonBody,PortalError } from "../../../lib/portal-http";
export async function POST(request:Request,{params}:{params:Promise<{kind:string}>}){try{if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {kind}=await params;if(!['doctor','hr','clinic'].includes(kind))throw new PortalError(404,'Not found.');const user=kind==='doctor'?await currentDoctor():kind==='hr'?await currentHR():await currentClinic();if(!user)throw new PortalError(401,'Login required.');const p=z.object({currentPassword:z.string().min(1).max(72),newPassword:newPasswordSchema}).safeParse(await jsonBody(request));if(!p.success)throw new PortalError(400,'Use a new password of 12–72 UTF-8 bytes.');if(!await throttle('password:'+kind+':'+digest(String(user.id)),5))throw new PortalError(429,'Too many attempts. Try again later.');
 const config=kind==='doctor'?{table:'Doctor',sessions:'DoctorSession',foreign:'doctorId',cookie:'allen_doctor_session',login:'/doctor-login'}:kind==='hr'?{table:'HRUser',sessions:'HRSession',foreign:'hrUserId',cookie:'allen_hr_session',login:'/hr/login'}:{table:'ClinicUser',sessions:'ClinicSession',foreign:'userId',cookie:'allen_clinic_session',login:'/clinic-login'};
 await db.transaction(async tx=>{const row=(await tx.query('SELECT "passwordHash" FROM "'+config.table+'" WHERE id=$1 FOR UPDATE',[user.id]))[0];if(!row||!await compare(p.data.currentPassword,row.passwordHash))throw new PortalError(401,'Current password is incorrect.');await tx.query('UPDATE "'+config.table+'" SET "passwordHash"=$2 WHERE id=$1',[user.id,await hashNewPassword(p.data.newPassword)]);await tx.query('DELETE FROM "'+config.sessions+'" WHERE "'+config.foreign+'"=$1',[user.id]);await audit(tx,String(user.id),kind,'password.changed',String(user.id));});(await cookies()).delete(config.cookie);return Response.json({message:'Password changed. Sign in again.',redirect:config.login});}catch(e){return failure(e)}}
