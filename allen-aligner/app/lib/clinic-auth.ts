import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "./database";
import { digest } from "./portal-auth";
export const clinicCookie='allen_clinic_session';
export type ClinicUser={id:string;clinicId:string;fullName:string;email:string;role:string;canAccessPatients:boolean;isActive:boolean};
export async function currentClinic():Promise<ClinicUser|null>{const token=(await cookies()).get(clinicCookie)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const rows=await db.query(`SELECT u.id,u."clinicId",u."fullName",u.email,u.role,u."canAccessPatients",u."isActive" FROM "ClinicSession" s JOIN "ClinicUser" u ON u.id=s."userId" WHERE s."tokenHash"=$1 AND s."expiresAt">NOW() AND u."isActive"=true AND u."clinicId" IS NOT NULL`,[digest(token)]);return rows[0] as ClinicUser||null;}
export async function startClinicSession(id:string){const jar=await cookies(),old=jar.get(clinicCookie)?.value;if(old)await db.query('DELETE FROM "ClinicSession" WHERE "tokenHash"=$1',[digest(old)]);const token=randomBytes(32).toString('hex'),expires=new Date(Date.now()+8*60*60*1000);await db.query('INSERT INTO "ClinicSession" ("tokenHash","userId","expiresAt") VALUES($1,$2,$3)',[digest(token),id,expires]);jar.set(clinicCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',expires});}

