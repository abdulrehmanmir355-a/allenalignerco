import "server-only";
import type { Database } from "@/app/lib/database";
import { db } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { clinicalRegistrationPolicy, type RequestedClinicalRole } from "./policy";
import { registrationMessages } from "./messages";
import { deliverClinicalEmail, appBaseUrl } from "./email";
import { securityEvent } from "./access-control";
import { newToken, tokenHash } from "./tokens";

export type HrActor = { id: string; role: string; email?: string };

function assertHrManager(actor: HrActor) {
  if (!["HR_ADMIN", "HR_OFFICER"].includes(actor.role)) throw new PortalError(403, "HR Admin or Officer permission is required.");
}

export async function searchAuthorizedEmployees(actor: HrActor, query: string, database: Database = db) {
  if (!["HR_ADMIN", "HR_OFFICER", "HR_VIEWER"].includes(actor.role)) throw new PortalError(403, "HR access is required.");
  const term = query.trim();
  if (term.length < 2) return [];
  return database.query(
    `SELECT e."permanentId",e."fullName",e.email,e.department,e.designation,e.status,
            w."isActive" AS "accountActive",w."clinicalRole"
       FROM "Employee" e
       JOIN "WorkAccount" w ON w."employeeId"=e.id
      WHERE e.status='ACTIVE'
        AND ($2::uuid IS NULL OR $3='HR_ADMIN' OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$2))
        AND (
          UPPER(e."permanentId") LIKE UPPER($1)
          OR UPPER(e.email) LIKE UPPER($1)
          OR UPPER(e."fullName") LIKE UPPER($1)
        )
      ORDER BY e."permanentId"
      LIMIT 25`,
    [`%${term}%`, actor.role === "HR_ADMIN" ? null : actor.id, actor.role],
  );
}

export async function listClinicalInvitations(actor: HrActor, database: Database = db) {
  if (!["HR_ADMIN", "HR_OFFICER", "HR_VIEWER"].includes(actor.role)) throw new PortalError(403, "HR access is required.");
  const scope = actor.role === "HR_ADMIN" ? null : actor.id;
  const audit = await database.query(
    `SELECT s.id,s.action,s.detail,s."createdAt",e."permanentId"
       FROM "ClinicalSecurityEvent" s
       LEFT JOIN "Employee" e ON e.id::text=s."employeeId"
      WHERE s.action IN ('clinical.invitation.issued','clinical.invitation.revoked','clinical.password_code.issued','clinical.password_code.completed','clinical.registration.invitation_accepted')
        AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=s."employeeId" AND g."userId"=$1))
      ORDER BY s.id DESC LIMIT 50`,
    [scope],
  );
  const invitations = await database.query(
    `SELECT i.id,e."permanentId",e."fullName",i.email,i.department,i."jobTitle",i.role,i.status,i."expiresAt",i."createdAt",i."usedAt",i."revokedAt",h.email AS "issuedBy"
       FROM "ClinicalAccessInvitation" i
       JOIN "Employee" e ON e.id=i."employeeId"
       JOIN "HRUser" h ON h.id=i."issuedBy"
      WHERE ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$1))
      ORDER BY i."createdAt" DESC
      LIMIT 100`,
    [scope],
  );
  return { actor: { role: actor.role }, invitations, audit };
}

async function lockEmployee(tx: Database, permanentId: string, actor: HrActor) {
  const [employee] = await tx.query(
    `SELECT e.id,e."permanentId",e."fullName",e.email,e.department,e.designation,e.status,w.id AS "accountId",w."clinicalRole"
       FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id
      WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1))
      FOR UPDATE OF e,w`,
    [permanentId],
  );
  if (!employee?.email || employee.status !== "ACTIVE") throw new PortalError(404, "Active authorized employee not found.");
  if (actor.role !== "HR_ADMIN") {
    const grant = await tx.query(`SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2 LIMIT 1`, [actor.id, employee.id]);
    if (!grant.length) throw new PortalError(404, "Employee not found or outside your HR scope.");
  }
    if (employee.clinicalRole) throw new PortalError(409, registrationMessages.alreadyClinical);
    const [open] = await tx.query(
      `SELECT status FROM "ClinicalRegistrationRequest" WHERE "employeeId"=$1 AND status IN ('PENDING_APPROVAL','PENDING_VERIFICATION') LIMIT 1`,
      [employee.id],
    );
    if (open) throw new PortalError(409, "Resolve the pending registration before issuing an invitation.");
    return employee;
}

export async function issueClinicalInvitation(actor: HrActor, input: { employeeId: string; role: RequestedClinicalRole; reason: string }, database: Database = db) {
  assertHrManager(actor);
  if (!clinicalRegistrationPolicy.invitationRoles.includes(input.role) || input.role === "ADMIN" as string) {
    throw new PortalError(403, "HR cannot grant that clinical role.");
  }
  return database.transaction(async tx => {
    const employee = await lockEmployee(tx, input.employeeId, actor);
    await tx.query(
      `UPDATE "ClinicalAccessInvitation" SET status='REVOKED',"revokedAt"=clock_timestamp(),"revokedBy"=$2
        WHERE "employeeId"=$1 AND status='INVITED'`,
      [employee.id, actor.id],
    );
    await tx.query(
      `UPDATE "ClinicalRegistrationRequest" SET status='REVOKED',"decidedAt"=clock_timestamp(),"decidedBy"=$2,"decidedByRole"=$3,"decisionReason"='Replaced by a new HR invitation',"passwordHash"=NULL
        WHERE "employeeId"=$1 AND status='INVITED'`,
      [employee.id, actor.id, actor.role],
    );
    const token = newToken();
    const [invitation] = await tx.query(
      `INSERT INTO "ClinicalAccessInvitation"("employeeId",email,department,"jobTitle",role,"tokenHash","expiresAt","issuedBy",status,reason)
       VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+make_interval(hours => $7::int),$8,'INVITED',$9)
       RETURNING id,"expiresAt"`,
      [employee.id, employee.email, employee.department, employee.designation, input.role, tokenHash(token), clinicalRegistrationPolicy.invitationHours, actor.id, input.reason],
    );
    await tx.query(
      `INSERT INTO "ClinicalRegistrationRequest"
        ("employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status,"invitationId",reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'HR_INVITATION','INVITED',$9,$10)`,
      [employee.id, employee.accountId, employee.email, employee.fullName, employee.department, employee.designation, employee.status, input.role, invitation.id, input.reason],
    );
    const link = `${appBaseUrl()}/clinical/register?code=${token}`;
    await deliverClinicalEmail({
      to: employee.email,
      kind: "clinical-invitation",
      subject: "Allen Aligner internal clinical review invitation",
      text: `You have been invited to register for Internal Clinical Review.\n\nEmployee ID: ${employee.permanentId}\nInvitation code: ${token}\nOpen: ${link}\n\nThis code expires in ${clinicalRegistrationPolicy.invitationHours} hours and can be used once. It does not sign you in.`,
    }, tx);
    await securityEvent(tx, "clinical.invitation.issued", employee.id, actor.id, { purpose: "REGISTRATION", invitationId: invitation.id, role: input.role, expiresAt: invitation.expiresAt });
    return {
      invitationId: invitation.id,
      employeeId: employee.permanentId,
      email: employee.email,
      expiresAt: invitation.expiresAt,
      code: token,
      message: "Invitation created. The code is shown once and was queued for the official employee email. It does not sign the employee in.",
    };
  });
}

export async function issuePasswordResetCode(actor: HrActor, input: { employeeId: string; reason: string }, database: Database = db) {
  assertHrManager(actor);
  return database.transaction(async tx => {
    const [employee] = await tx.query(
      `SELECT e.id,e."permanentId",e.email,e.status,w.id AS "accountId",w."passwordHash" IS NULL AS "needsPassword"
         FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id
        WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1))
        FOR UPDATE OF e,w`,
      [input.employeeId],
    );
    if (!employee?.email || employee.status !== "ACTIVE") throw new PortalError(404, "Active authorized employee not found.");
    if (actor.role !== "HR_ADMIN") {
      const grant = await tx.query(`SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2 LIMIT 1`, [actor.id, employee.id]);
      if (!grant.length) throw new PortalError(404, "Employee not found or outside your HR scope.");
    }
    const token = newToken();
    await tx.query(`UPDATE "ClinicalPasswordReset" SET "usedAt"=clock_timestamp() WHERE "accountId"=$1 AND "usedAt" IS NULL`, [employee.accountId]);
    const [reset] = await tx.query(
      `INSERT INTO "ClinicalPasswordReset"("accountId","tokenHash","expiresAt")
       VALUES($1,$2,clock_timestamp()+make_interval(hours => $3::int))
       RETURNING id,"expiresAt"`,
      [employee.accountId, tokenHash(token), clinicalRegistrationPolicy.hrPasswordCodeHours],
    );
    await deliverClinicalEmail({
      to: employee.email,
      kind: "clinical-password-code",
      subject: "Allen Aligner password code",
      text: `HR issued a one-time password code for Employee ID ${employee.permanentId}.\n\nCode: ${token}\nOpen ${appBaseUrl()}/clinical/forgot-password and enter your Employee ID, this code, and a new password you choose.\n\nThe code expires in ${clinicalRegistrationPolicy.hrPasswordCodeHours} hours. HR never receives your password. This code does not approve clinical access.`,
    }, tx);
    await securityEvent(tx, "clinical.password_code.issued", employee.id, actor.id, { purpose: "PASSWORD_RESET", resetId: reset.id, expiresAt: reset.expiresAt, needsPassword: employee.needsPassword, reason: input.reason });
    return {
      employeeId: employee.permanentId,
      email: employee.email,
      expiresAt: reset.expiresAt,
      code: token,
      message: "Password code created. It is shown once. The employee chooses the password. HR does not set or see it, and this code does not approve clinical access.",
    };
  });
}

export async function revokeClinicalInvitation(actor: HrActor, invitationId: string, reason: string, database: Database = db) {
  assertHrManager(actor);
  return database.transaction(async tx => {
    const [invitation] = await tx.query(
      `SELECT i.id,i."employeeId",i.status FROM "ClinicalAccessInvitation" i WHERE i.id=$1 FOR UPDATE`,
      [invitationId],
    );
    if (!invitation) throw new PortalError(404, "Invitation not found.");
    if (actor.role !== "HR_ADMIN") {
      const grant = await tx.query(`SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2`, [actor.id, invitation.employeeId]);
      if (!grant.length) throw new PortalError(404, "Invitation not found.");
    }
    if (invitation.status !== "INVITED") throw new PortalError(409, "Only an open invitation can be revoked.");
    await tx.query(`UPDATE "ClinicalAccessInvitation" SET status='REVOKED',"revokedAt"=clock_timestamp(),"revokedBy"=$2 WHERE id=$1`, [invitation.id, actor.id]);
    await tx.query(
      `UPDATE "ClinicalRegistrationRequest" SET status='REVOKED',"decidedAt"=clock_timestamp(),"decidedBy"=$2,"decidedByRole"=$3,"decisionReason"=$4,"passwordHash"=NULL
        WHERE "invitationId"=$1 AND status IN ('INVITED','PENDING_VERIFICATION')`,
      [invitation.id, actor.id, actor.role, reason],
    );
    await securityEvent(tx, "clinical.invitation.revoked", invitation.employeeId, actor.id, { invitationId, reason });
    return { message: "Invitation revoked." };
  });
}

export async function resendClinicalInvitation(actor: HrActor, invitationId: string, reason: string, database: Database = db) {
  assertHrManager(actor);
  const [current] = await database.query(
    `SELECT e."permanentId",i.role FROM "ClinicalAccessInvitation" i JOIN "Employee" e ON e.id=i."employeeId" WHERE i.id=$1`,
    [invitationId],
  );
  if (!current) throw new PortalError(404, "Invitation not found.");
  await revokeClinicalInvitation(actor, invitationId, reason, database);
  return issueClinicalInvitation(actor, { employeeId: current.permanentId, role: current.role, reason }, database);
}
