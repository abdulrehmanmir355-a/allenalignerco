import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, type Database } from './database';
import { manageClinical, type ClinicalActor } from './clinical-auth';
import { PortalError } from './portal-http';

const assignmentInput = z.object({
  caseId: z.string().trim().min(1).max(100),
  assignedTo: z.uuid(),
  revision: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

export async function clinicalLeaderQueue(actor: ClinicalActor, database: Database = db) {
  manageClinical(actor);
  const [cases, team] = await Promise.all([
    database.query(`SELECT c.id AS "caseId",c."patientReference",c.status AS "caseStatus",c."createdAt",
      d."fullName" AS "doctorName",cl.name AS "clinicName",
      ca."assignedTo"::text AS "assignedTo",ca.revision AS "assignmentRevision",
      ca."assignedAt",ca.reason,e."fullName" AS "assigneeName",w."clinicalRole" AS "assigneeRole",
      (SELECT m.text FROM "CaseMessage" m WHERE m."caseId"=c.id AND m."senderRole"='DOCTOR'
        ORDER BY m."createdAt" DESC,m.id DESC LIMIT 1) AS "lastDoctorMessage",
      (SELECT count(*)::int FROM "CaseMessage" m WHERE m."caseId"=c.id AND m."senderRole"='DOCTOR') AS "doctorMessageCount"
      FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
      LEFT JOIN "ClinicalCaseAssignment" ca ON ca."caseId"=c.id
      LEFT JOIN "WorkAccount" w ON w.id=ca."assignedTo"
      LEFT JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE c.status<>'DRAFT' AND EXISTS(
        SELECT 1 FROM "CaseMessage" m WHERE m."caseId"=c.id AND m."senderRole"='DOCTOR'
      )
      ORDER BY (ca."assignedTo" IS NULL) DESC,ca."assignedAt" DESC NULLS FIRST,c."createdAt" DESC,c.id
      LIMIT 200`),
    database.query(`SELECT w.id::text AS id,w."employeeId",e."fullName",w."clinicalRole",
      (SELECT count(*)::int FROM "ClinicalCaseAssignment" ca WHERE ca."assignedTo"=w.id) AS workload
      FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      JOIN "Employee" employee ON employee.id=w."employeeId" AND employee.status='ACTIVE'
      WHERE w."clinicalRole" IN ('REVIEWER','LEAD') AND w."isActive" AND NOT w."mustChangePassword"
        AND w."employeeId" IS NOT NULL AND e.status='ACTIVE'
      ORDER BY workload,e."fullName",w.id`),
  ]);
  return { cases, team };
}

export async function assignClinicalCase(actor: ClinicalActor, input: unknown, database: Database = db) {
  manageClinical(actor);
  const parsed = assignmentInput.safeParse(input);
  if (!parsed.success) throw new PortalError(400, 'Choose an active clinical team member and record an assignment reason.');
  const body = parsed.data;

  await database.transaction(async tx => {
    const [caseRow] = await tx.query(`SELECT id FROM "PortalCase" WHERE id=$1 AND status<>'DRAFT' FOR UPDATE`, [body.caseId]);
    if (!caseRow) throw new PortalError(404, 'Submitted case not found.');
    const [current] = await tx.query(`SELECT "assignedTo"::text AS "assignedTo",revision
      FROM "ClinicalCaseAssignment" WHERE "caseId"=$1 FOR UPDATE`, [body.caseId]);
    const revision = current ? Number(current.revision) : 0;
    if (revision !== body.revision) throw new PortalError(409, 'This case assignment changed. Refresh the Leader queue.');
    if (current?.assignedTo === body.assignedTo) throw new PortalError(409, 'This case is already assigned to that team member.');
    const [doctorMessage] = await tx.query(`SELECT 1 FROM "CaseMessage" WHERE "caseId"=$1 AND "senderRole"='DOCTOR' LIMIT 1`, [body.caseId]);
    if (!doctorMessage) throw new PortalError(409, 'A doctor must start the case conversation before assignment.');
    const [member] = await tx.query(`SELECT w.id,w."employeeId" FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      JOIN "Employee" employee ON employee.id=w."employeeId" AND employee.status='ACTIVE'
      WHERE w.id=$1 AND w."clinicalRole" IN ('REVIEWER','LEAD') AND w."isActive"
        AND w."employeeId" IS NOT NULL AND NOT w."mustChangePassword" AND e.status='ACTIVE'
      FOR SHARE OF w,employee`, [body.assignedTo]);
    if (!member) throw new PortalError(400, 'Select an active qualified Reviewer or Clinical Lead.');
    await tx.query(`SELECT set_config('allen.clinical_actor',$1,true),set_config('allen.clinical_name',$2,true)`, [actor.id, actor.name]);
    if (current) {
      await tx.query(`UPDATE "ClinicalCaseAssignment" SET "assignedTo"=$2,"assignedBy"=$3,
        revision=revision+1,reason=$4 WHERE "caseId"=$1`, [body.caseId, body.assignedTo, actor.id, body.reason]);
    } else {
      await tx.query(`INSERT INTO "ClinicalCaseAssignment"("caseId","assignedTo","assignedBy",revision,reason)
        VALUES($1,$2,$3,0,$4)`, [body.caseId, body.assignedTo, actor.id, body.reason]);
    }
    await tx.query(`INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
      SELECT w.id::text,w."employeeId",current_date,'CASE_ASSIGNMENT:'||$2||':'||$3,
        'A doctor case has been assigned to you. Open Clinical Case Communication.'
      FROM "WorkAccount" w WHERE w.id=$1 AND w."employeeId" IS NOT NULL
      ON CONFLICT DO NOTHING`, [body.assignedTo, body.caseId, current ? revision + 1 : 0]);
    await tx.query(`INSERT INTO "Notification"(id,"caseId","doctorId",text)
      SELECT $2,id,"doctorId",'A clinical team member was assigned to handle your case. Open Case Communication.'
      FROM "PortalCase" WHERE id=$1`, [body.caseId, randomUUID()]);
  });
}
