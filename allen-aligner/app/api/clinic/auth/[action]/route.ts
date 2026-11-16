import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "../../../../lib/database";
import { clinicCookie, startClinicSession } from "../../../../lib/clinic-auth";
import { sameOrigin,digest,throttle } from "../../../../lib/portal-auth";
import { jsonBody, failure, PortalError } from "../../../../lib/portal-http";
const credentials=z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),password:z.string().min(1).max(72)});
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){try{
 if(!sameOrigin(request))throw new PortalError(403,'Invalid request origin.');const {action}=await params;
 if(action==='logout'){const jar=await cookies(),token=jar.get(clinicCookie)?.value;if(token)await db.query('DELETE FROM "ClinicSession" WHERE "tokenHash"=$1',[digest(token)]);jar.delete(clinicCookie);return new Response(null,{status:303,headers:{Location:'/clinic-login'}});}
 const body=await jsonBody(request),parsed=credentials.safeParse(body);if(!parsed.success)throw new PortalError(400,'Check email and password.');const {email,password}=parsed.data;
 if(!await throttle('clinic:'+action+':'+digest(email),10))throw new PortalError(429,'Too many attempts. Try again later.');
 if(action==='login'){const u=(await db.query('SELECT id,"passwordHash","isActive","clinicId" FROM "ClinicUser" WHERE LOWER(email)=$1',[email]))[0];if(!u||!await compare(password,u.passwordHash))throw new PortalError(401,'Invalid email or password.');if(!u.isActive||!u.clinicId)throw new PortalError(403,'Your clinic account requires approval.');await startClinicSession(u.id);return Response.json({redirect:'/clinic/dashboard',message:'Signed in.'});}
 if(action==='register'){const input=z.object({fullName:z.string().trim().min(2).max(150),clinicName:z.string().trim().min(2).max(200),password:z.string().min(12).max(72).refine(p=>Buffer.byteLength(p)<=72)}).safeParse(body);if(!input.success)throw new PortalError(400,'Provide your name, clinic name and a password of 12–72 bytes.');if(!await throttle('clinic:register:global',30))throw new PortalError(429,'Too many requests.');await db.query('INSERT INTO "ClinicUser" ("fullName",email,"passwordHash","requestedClinicName") VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[input.data.fullName,email,await hash(password,12),input.data.clinicName]);return Response.json({message:'Registration received. An authorized operator must verify and associate your clinic before access is granted.'},{status:202});}
 throw new PortalError(404,'Unknown action.');
 }catch(e){return failure(e)}}
