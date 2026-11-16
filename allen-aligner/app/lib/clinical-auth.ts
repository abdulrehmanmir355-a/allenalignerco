import 'server-only';
import { workSessionActor } from './work-auth';
import { db, type Database } from './database';
import { PortalError } from './portal-http';
import { assertClinicalRegistrationAllowsAccess, latestRegistrationStatus } from './clinical-registration/access-control';
export type ClinicalActor={id:string;name:string;employeeId?:string|null;role:'REVIEWER'|'LEAD'|'ADMIN'};
export async function clinicalActor(request?:Request):Promise<ClinicalActor>{
 const actor=await workSessionActor(request);
 if(actor.mustChangePassword)throw new PortalError(403,'An activated clinical account with a personal password is required.');
 const [row]=await db.query(`SELECT a.id,a."employeeId",a."clinicalRole" AS role,e."fullName" AS name FROM "WorkAccount" a JOIN "ClinicalIdentity" e ON e."accountId"=a.id WHERE a.id=$1 AND a."isActive" AND e.status='ACTIVE' AND a."clinicalRole" IS NOT NULL`,[actor.id]);
 if(!row)throw new PortalError(403,'Internal Clinical Review access is required. Clinic Team access does not grant this permission.');
 assertClinicalRegistrationAllowsAccess(await latestRegistrationStatus(row.employeeId??null));
 return row as ClinicalActor;
}
export function manageClinical(a:ClinicalActor){if(!['LEAD','ADMIN'].includes(a.role))throw new PortalError(403,'Clinical Lead or authorized administrator required.');}
export async function clinicalCase(a:ClinicalActor,id:string,tx:Database=db,lock=false,allowCaseAssignment=false){
 const [c]=await tx.query(`SELECT c.id,c."clinicId",c."patientReference",c."patientId",c."doctorId",c.status,c.revision,c.notes,c.category,c."createdAt",d."fullName" AS "doctorName",cl.name AS "clinicName",
 (SELECT e."fullName" FROM "ClinicalCaseAssignment" ca JOIN "ClinicalIdentity" e ON e."accountId"=ca."assignedTo" WHERE ca."caseId"=c.id) AS "assignedToName",
 (SELECT w."clinicalRole" FROM "ClinicalCaseAssignment" ca JOIN "WorkAccount" w ON w.id=ca."assignedTo" WHERE ca."caseId"=c.id) AS "assignedToRole",
 (SELECT min("createdAt") FROM "CaseEvent" WHERE "caseId"=c.id AND label ILIKE 'Case submitted%') AS "submittedAt"
 FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
 WHERE c.id=$1 AND c.status<>'DRAFT' AND ($2<>'REVIEWER' OR EXISTS(SELECT 1 FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" WHERE p."caseId"=c.id AND r."assignedTo"=$3::uuid) OR ($4::boolean AND EXISTS(SELECT 1 FROM "ClinicalCaseAssignment" ca WHERE ca."caseId"=c.id AND ca."assignedTo"=$3::uuid))) ${lock?'FOR UPDATE OF c':''}`,[id,a.role,a.id,allowCaseAssignment]);
 if(!c)throw new PortalError(404,'Assigned case not found.');return c;
}
