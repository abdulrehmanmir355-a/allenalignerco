import "server-only";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "./database";
import { audit } from "./hr-management";
import type { ClinicUser } from "./clinic-auth";
import { PortalError } from "./portal-http";
const text=(max=150)=>z.string().trim().min(1).max(max);
export const clinicSchemas={
 profile:z.object({name:text(200),address:z.string().trim().max(500),phone:z.string().trim().max(40),email:z.union([z.email().max(254),z.literal('')])}),
 staff:z.object({fullName:text(),email:z.email().max(254),designation:text(120)}),
 users:z.object({fullName:text(),email:z.email().max(254),password:z.string().min(12).max(72).refine(p=>Buffer.byteLength(p)<=72),role:z.enum(['CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER']),canAccessPatients:z.enum(['true','false'])}),
 appointments:z.object({patientId:text(100),doctorId:text(100),startsAt:z.iso.datetime({offset:true}),notes:z.string().max(1000)}),
 cases:z.object({id:text(100),doctorId:text(100)}),
};
export type ClinicSection=keyof typeof clinicSchemas|'dashboard'|'patients'|'documents'|'settings';
export function clinicPermission(u:ClinicUser,s:ClinicSection,write=false){
 if(['patients','appointments','cases'].includes(s)&&!u.canAccessPatients)throw new PortalError(403,'Patient access permission required.');
 if(s==='users'&&u.role!=='CLINIC_ADMIN')throw new PortalError(403,'Clinic administrator required.');
 if(write&&(u.role==='CLINIC_VIEWER'||(['profile','staff','users','cases'].includes(s)&&u.role!=='CLINIC_ADMIN')))throw new PortalError(403,'Permission denied.');
}
export async function clinicRows(s:ClinicSection,u:ClinicUser){clinicPermission(u,s);const queries:Record<ClinicSection,string>={
 dashboard:`SELECT c.name,(SELECT COUNT(*)::int FROM "ClinicStaff" WHERE "clinicId"=c.id) AS staff,(SELECT COUNT(*)::int FROM "Doctor" WHERE "clinicId"=c.id) AS doctors FROM "Clinic" c WHERE c.id=$1`,
 profile:'SELECT c.name,p.address,p.phone,p.email FROM "Clinic" c LEFT JOIN "ClinicProfile" p ON p."clinicId"=c.id WHERE c.id=$1',
 staff:'SELECT id,"fullName",email,designation,"isActive" FROM "ClinicStaff" WHERE "clinicId"=$1 ORDER BY "fullName" LIMIT 500',
 users:'SELECT id,"fullName",email,role,"canAccessPatients","isActive" FROM "ClinicUser" WHERE "clinicId"=$1 ORDER BY "fullName" LIMIT 500',
 patients:'SELECT id,"patientCode","fullName","dateOfBirth",phone,email FROM "Patient" WHERE "clinicId"=$1 AND "archivedAt" IS NULL ORDER BY "fullName" LIMIT 500',
 appointments:'SELECT a.id,p."fullName" AS patient,d."fullName" AS doctor,a."startsAt",a.status,a.notes FROM "ClinicAppointment" a JOIN "Patient" p ON p.id=a."patientId" JOIN "Doctor" d ON d.id=a."doctorId" WHERE a."clinicId"=$1 ORDER BY a."startsAt" DESC LIMIT 500',
 cases:'SELECT c.id,c."patientReference",d."fullName" AS doctor,c.status,c."updatedAt" FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" WHERE c."clinicId"=$1 ORDER BY c."updatedAt" DESC LIMIT 500',
 documents:'SELECT id,name,mime,"createdAt" FROM "ClinicDocument" WHERE "clinicId"=$1 ORDER BY "createdAt" DESC LIMIT 500',
 settings:'SELECT name FROM "Clinic" WHERE id=$1'
 };return db.query(queries[s],[u.clinicId]);}
export async function clinicSave(s:ClinicSection,body:unknown,u:ClinicUser){clinicPermission(u,s,true);if(!(s in clinicSchemas))throw new PortalError(400,'Read-only section.');const parsed=clinicSchemas[s as keyof typeof clinicSchemas].safeParse(body);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0].message);const v=parsed.data as Record<string,string>;
 return db.transaction(async tx=>{await tx.lockClinic(u.clinicId);let rows: Awaited<ReturnType<typeof tx.query>> = [];
 if(s==='profile'){await tx.query('UPDATE "Clinic" SET name=$2 WHERE id=$1',[u.clinicId,v.name]);rows=await tx.query('INSERT INTO "ClinicProfile" ("clinicId",address,phone,email) VALUES($1,$2,$3,$4) ON CONFLICT ("clinicId") DO UPDATE SET address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email RETURNING "clinicId" AS id',[u.clinicId,v.address,v.phone,v.email]);}
 else if(s==='staff')rows=await tx.query('INSERT INTO "ClinicStaff" ("clinicId","fullName",email,designation) VALUES($1,$2,$3,$4) RETURNING id',[u.clinicId,v.fullName,v.email.toLowerCase(),v.designation]);
 else if(s==='users')rows=await tx.query('INSERT INTO "ClinicUser" ("clinicId","fullName",email,"passwordHash",role,"canAccessPatients","isActive") VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id',[u.clinicId,v.fullName,v.email.toLowerCase(),await hash(v.password,12),v.role,v.canAccessPatients==='true']);
 else if(s==='appointments'){if(!(await tx.query('SELECT id FROM "Patient" WHERE id=$1 AND "clinicId"=$2 AND "archivedAt" IS NULL',[v.patientId,u.clinicId])).length||!(await tx.query('SELECT id FROM "Doctor" WHERE id=$1 AND "clinicId"=$2 AND "isVerified"=true',[v.doctorId,u.clinicId])).length)throw new PortalError(400,'Patient and verified doctor must belong to this clinic.');rows=await tx.query('INSERT INTO "ClinicAppointment" ("clinicId","patientId","doctorId","startsAt",notes) VALUES($1,$2,$3,$4,$5) RETURNING id',[u.clinicId,v.patientId,v.doctorId,v.startsAt,v.notes]);}
 else if(s==='cases'){if((await tx.query("SELECT id FROM \"LargeUploadSession\" WHERE \"caseId\"=$1 AND status IN ('CREATED','UPLOADING')",[v.id])).length)throw new PortalError(409,'Finish or cancel active uploads before reassignment.');if(!(await tx.query('SELECT id FROM "Doctor" WHERE id=$1 AND "clinicId"=$2 AND "isVerified"=true',[v.doctorId,u.clinicId])).length)throw new PortalError(400,'Verified clinic doctor required.');rows=await tx.query(`UPDATE "PortalCase" SET "doctorId"=$3,revision=revision+1,"updatedAt"=NOW() WHERE id=$1 AND "clinicId"=$2 AND status='DRAFT' RETURNING id`,[v.id,u.clinicId,v.doctorId]);if(rows.length)await tx.caseEvent.create({data:{caseId:v.id,label:'Draft assigned by clinic administrator'}});}
 if(!rows?.length)throw new PortalError(409,'Record unavailable or no longer editable.');await audit(tx,u.id,u.clinicId,s+'.save',String(rows[0].id));return rows[0];});
}
export async function clinicTransition(s:ClinicSection,body:unknown,u:ClinicUser){clinicPermission(u,s,true);const parsed=z.object({id:z.uuid(),status:text(30)}).safeParse(body);if(!parsed.success)throw new PortalError(400,'Invalid update.');const {id,status}=parsed.data;
 return db.transaction(async tx=>{await tx.lockClinic(u.clinicId);let rows: Awaited<ReturnType<typeof tx.query>> = [];
 if(s==='appointments'&&['COMPLETED','CANCELLED'].includes(status))rows=await tx.query(`UPDATE "ClinicAppointment" SET status=$3 WHERE id=$1 AND "clinicId"=$2 AND status='SCHEDULED' RETURNING id`,[id,u.clinicId,status]);
 else if(s==='staff'&&['ACTIVE','INACTIVE'].includes(status))rows=await tx.query('UPDATE "ClinicStaff" SET "isActive"=$3 WHERE id=$1 AND "clinicId"=$2 RETURNING id',[id,u.clinicId,status==='ACTIVE']);
 else if(s==='users'&&['ACTIVE','INACTIVE','PATIENT_ACCESS','NO_PATIENT_ACCESS','CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER'].includes(status)){if(id===u.id)throw new PortalError(409,'Your own access cannot be changed here.');const active=['ACTIVE','INACTIVE'].includes(status),role=status.startsWith('CLINIC_');rows=await tx.query('UPDATE "ClinicUser" SET '+(role?'role':active?'"isActive"':'"canAccessPatients"')+'=$3 WHERE id=$1 AND "clinicId"=$2 RETURNING id',[id,u.clinicId,role?status:['ACTIVE','PATIENT_ACCESS'].includes(status)]);await tx.query('DELETE FROM "ClinicSession" WHERE "userId"=$1',[id]);}
 else throw new PortalError(400,'Unsupported transition.');if(!rows?.length)throw new PortalError(409,'Record not found or already changed.');await audit(tx,u.id,u.clinicId,s+'.'+status,id);return rows[0];});
}
