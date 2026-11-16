import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "../../../lib/database";
import { digest, sameOrigin, throttle } from "../../../lib/portal-auth";
import { failure, jsonBody, PortalError } from "../../../lib/portal-http";
export const runtime = "nodejs";
const schema=z.object({
 fullName:z.string().trim().min(2).max(150),
 email:z.string().trim().toLowerCase().pipe(z.email().max(254)),
 password:z.string().min(12).max(72).refine(v=>Buffer.byteLength(v,"utf8")<=72,"Password must be at most 72 UTF-8 bytes."),
 confirmPassword:z.string().max(72),
}).strict().refine(v=>v.password===v.confirmPassword,{message:"Passwords do not match.",path:["confirmPassword"]});
export async function POST(request:Request) {
 try {
  if(!sameOrigin(request))throw new PortalError(403,"Invalid request origin.");
  const parsed=schema.safeParse(await jsonBody(request));
  if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message||"Check your registration details.");
  const {fullName,email,password}=parsed.data;
  if(!await throttle("hr-register:global",30)||!await throttle("hr-register:"+digest(email),5))throw new PortalError(429,"Too many attempts. Please try again in 15 minutes.");
  const passwordHash=await hash(password,12);
  // Public registration never grants active HR access or administrator privileges.
  await db.query(`INSERT INTO "HRUser" ("fullName","email","passwordHash","role","isActive") VALUES ($1,$2,$3,'HR_OFFICER',FALSE) ON CONFLICT DO NOTHING`,[fullName,email,passwordHash]);
  return Response.json({message:"Your registration request has been received. HR access requires approval. If you already have an account, use HR Login."},{status:202,headers:{"Cache-Control":"no-store"}});
 } catch(error){return failure(error);}
}
