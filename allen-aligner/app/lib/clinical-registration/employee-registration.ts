import "server-only";
import { hash } from "bcryptjs";
import type { Database } from "@/app/lib/database";
import { db } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { clinicalRegistrationPolicy, passwordProblems, type RequestedClinicalRole } from "./policy";
import { registrationMessages } from "./messages";
import { assertActiveEmployee, assertOfficialEmail, assertProfile, authorizedEmployee } from "./employee-verification";
import { securityEvent } from "./access-control";
import { tokenMatches } from "./tokens";

export type RegistrationInput = {
  employeeId: string;
  email: string;
  fullName?: string;
  department?: string;
  jobTitle?: string;
  employeeStatus?: string;
  invitationCode?: string;
  password?: string;
  confirmPassword?: string;
  role?: RequestedClinicalRole;
  reason?: string;
};

function databaseFailure(error: unknown): never {
  if (error instanceof PortalError) throw error;
  console.error("Clinical registration database error", error instanceof Error ? error.name : "Error");
  throw new PortalError(503, registrationMessages.database);
}

async function openRequest(tx: Database, employeeId: string) {
  const [row] = await tx.query(
    `SELECT id,status,"invitationId","requestedRole" FROM "ClinicalRegistrationRequest"
      WHERE "employeeId"=$1 AND status IN ('INVITED','PENDING_VERIFICATION','PENDING_APPROVAL')
      ORDER BY "requestedAt" DESC LIMIT 1 FOR UPDATE`,
    [employeeId],
  );
  return row as { id: string; status: string; invitationId: string | null; requestedRole: string } | undefined;
}

function snapshot(employee: { fullName: string; email: string; department: string; designation: string; status: string }) {
  return {
    fullName: employee.fullName,
    email: employee.email.trim().toLowerCase(),
    department: employee.department,
    jobTitle: employee.designation,
    employeeStatus: employee.status,
  };
}

async function writePendingMirror(tx: Database, accountId: string, request: Record<string, unknown>) {
  await tx.query(`UPDATE "WorkAccount" SET "clinicalRequest"=$2::jsonb WHERE id=$1 AND "clinicalRole" IS NULL`, [accountId, JSON.stringify(request)]);
}

export async function submitClinicalRegistration(input: RegistrationInput, database: Database = db) {
  try {
    return await database.transaction(async tx => {
      const employee = await authorizedEmployee(tx, input.employeeId);
      assertOfficialEmail(employee, input.email);
      assertProfile(employee, input);
      assertActiveEmployee(employee);
      const profile = snapshot(employee);
      const code = (input.invitationCode || "").trim().toLowerCase();
      if (code) return acceptInvitation(tx, employee, profile, input, code);
      if (employee.clinicalRole) throw new PortalError(409, registrationMessages.alreadyClinical);
      if (!clinicalRegistrationPolicy.standardRequiresApproval) throw new PortalError(403, "Direct registration cannot bypass approval.");
      return submitForApproval(tx, employee, profile, input);
    });
  } catch (error) {
    databaseFailure(error);
  }
}

async function replacePasswordFromUsedInvitation(tx: Database, employee: Awaited<ReturnType<typeof authorizedEmployee>>, code: string, input: RegistrationInput) {
  const [used] = await tx.query(
    `SELECT id,"tokenHash","expiresAt" FROM "ClinicalAccessInvitation"
      WHERE "employeeId"=$1 AND status='USED' AND "expiresAt">clock_timestamp() AND "tokenHash" IS NOT NULL
      ORDER BY "usedAt" DESC LIMIT 1 FOR UPDATE`,
    [employee.id],
  );
  if (!used || !tokenMatches(code, used.tokenHash) || !employee.clinicalRole) throw new PortalError(400, registrationMessages.invalidInvitation);
  if (!input.password || input.password !== input.confirmPassword) throw new PortalError(400, input.password ? registrationMessages.passwordMismatch : registrationMessages.passwordRules);
  const problems = passwordProblems(input.password);
  if (problems.length) throw new PortalError(400, problems[0]);
  await tx.query(
    `UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=true,"mustChangePassword"=false WHERE id=$1`,
    [employee.accountId, await hash(input.password, 12)],
  );
  await tx.query(`UPDATE "ClinicalAccessInvitation" SET "tokenHash"=NULL WHERE id=$1`, [used.id]);
  await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`, [employee.accountId]);
  await securityEvent(tx, "clinical.registration.password_saved", employee.id, employee.accountId, { invitationId: used.id, signedIn: false });
  return { status: "APPROVED", signedIn: false, message: `${registrationMessages.approved} ${registrationMessages.noSession}` };
}

async function acceptInvitation(tx: Database, employee: Awaited<ReturnType<typeof authorizedEmployee>>, profile: ReturnType<typeof snapshot>, input: RegistrationInput, code: string) {
  const [invitation] = await tx.query(
    `SELECT id,role,status,"tokenHash","expiresAt",email FROM "ClinicalAccessInvitation"
      WHERE "employeeId"=$1 AND status='INVITED' ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`,
    [employee.id],
  );
  if (!invitation) return replacePasswordFromUsedInvitation(tx, employee, code, input);
  if (!tokenMatches(code, invitation.tokenHash)) throw new PortalError(400, registrationMessages.invalidInvitation);
  if (!clinicalRegistrationPolicy.hrInvitationActivatesAccess) throw new PortalError(403, "This invitation still requires administrator approval.");
  if (!input.password || input.password !== input.confirmPassword) throw new PortalError(400, input.password ? registrationMessages.passwordMismatch : registrationMessages.passwordRules);
  const problems = passwordProblems(input.password);
  if (problems.length) throw new PortalError(400, problems[0]);
  const passwordHash = await hash(input.password, 12);
  const [stillOpen] = await tx.query(
    `UPDATE "ClinicalAccessInvitation" SET status='USED',"usedAt"=clock_timestamp()
      WHERE id=$1 AND status='INVITED' AND "expiresAt">clock_timestamp() RETURNING id`,
    [invitation.id],
  );
  if (!stillOpen) {
    await tx.query(`UPDATE "ClinicalAccessInvitation" SET status='EXPIRED' WHERE id=$1 AND status='INVITED' AND "expiresAt"<=clock_timestamp()`, [invitation.id]);
    throw new PortalError(400, registrationMessages.expired);
  }
  await tx.query(
    `UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=true,"mustChangePassword"=false WHERE id=$1`,
    [employee.accountId, passwordHash],
  );
  const request = {
    id: invitation.id,
    role: invitation.role,
    reason: input.reason || "Accepted HR clinical invitation",
    status: "APPROVED",
    requestedAt: new Date().toISOString(),
    decidedAt: new Date().toISOString(),
    decisionSource: "HR_INVITATION",
  };
  await tx.query(
    `UPDATE "WorkAccount" SET "clinicalRole"=$2,"clinicalRequest"=$3::jsonb WHERE id=$1`,
    [employee.accountId, invitation.role, JSON.stringify(request)],
  );
  await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`, [employee.accountId]);
  const open = await openRequest(tx, employee.id);
  if (open) {
    await tx.query(
      `UPDATE "ClinicalRegistrationRequest"
          SET status='APPROVED',pathway='HR_INVITATION',"requestedRole"=$2,"invitationId"=$3,"activatedAt"=clock_timestamp(),"decidedAt"=clock_timestamp(),"decisionReason"='Valid HR invitation',"passwordHash"=NULL,reason=$4
        WHERE id=$1`,
      [open.id, invitation.role, invitation.id, input.reason || "Accepted HR clinical invitation"],
    );
  } else {
    await tx.query(
      `INSERT INTO "ClinicalRegistrationRequest"
        ("employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status,"invitationId",reason,"decidedAt","decisionReason","activatedAt")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'HR_INVITATION','APPROVED',$9,$10,clock_timestamp(),'Valid HR invitation',clock_timestamp())`,
      [employee.id, employee.accountId, profile.email, profile.fullName, profile.department, profile.jobTitle, profile.employeeStatus, invitation.role, invitation.id, input.reason || "Accepted HR clinical invitation"],
    );
  }
  await securityEvent(tx, "clinical.registration.invitation_accepted", employee.id, employee.accountId, { invitationId: invitation.id, role: invitation.role, signedIn: false });
  return { status: "APPROVED", signedIn: false, message: `${registrationMessages.approved} ${registrationMessages.noSession}` };
}

async function submitForApproval(tx: Database, employee: Awaited<ReturnType<typeof authorizedEmployee>>, profile: ReturnType<typeof snapshot>, input: RegistrationInput) {
  const open = await openRequest(tx, employee.id);
  if (open?.status === "PENDING_APPROVAL") {
    return { status: "PENDING_APPROVAL", signedIn: false, message: registrationMessages.duplicatePending };
  }
  if (open?.status === "INVITED") throw new PortalError(409, "An HR invitation is already open for this employee. Use the invitation code, or ask HR to revoke it.");
  const role = input.role || "REVIEWER";
  if (!clinicalRegistrationPolicy.invitationRoles.includes(role)) throw new PortalError(400, "Select Clinical Reviewer or Clinical Lead.");
  let passwordHash: string | null = null;
  if (!employee.passwordHash) {
    if (!input.password || input.password !== input.confirmPassword) throw new PortalError(400, input.password ? registrationMessages.passwordMismatch : registrationMessages.passwordRules);
    const problems = passwordProblems(input.password);
    if (problems.length) throw new PortalError(400, problems[0]);
    passwordHash = await hash(input.password, 12);
    await tx.query(`UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=false,"mustChangePassword"=false WHERE id=$1 AND "passwordHash" IS NULL`, [employee.accountId, passwordHash]);
  }
  const [created] = await tx.query(
    `INSERT INTO "ClinicalRegistrationRequest"
      ("employeeId","accountId",email,"fullName",department,"jobTitle","employeeStatus","requestedRole",pathway,status,"passwordHash",reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'STANDARD','PENDING_APPROVAL',$9,$10)
     RETURNING id,"requestedAt"`,
    [employee.id, employee.accountId, profile.email, profile.fullName, profile.department, profile.jobTitle, profile.employeeStatus, role, passwordHash, input.reason || ""],
  );
  await writePendingMirror(tx, employee.accountId, {
    id: created.id,
    role,
    reason: input.reason || "",
    status: "PENDING",
    requestedAt: created.requestedAt,
  });
  await securityEvent(tx, "clinical.registration.submitted", employee.id, null, { requestId: created.id, role, signedIn: false });
  return { status: "PENDING_APPROVAL", signedIn: false, message: registrationMessages.pending };
}

export async function registrationStatus(employeeId: string, email: string, database: Database = db) {
  try {
    const [employee] = await database.query(
      `SELECT e.id,e.email,w."clinicalRole" FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id
        WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1))`,
      [employeeId],
    );
    if (!employee || String(employee.email).trim().toLowerCase() !== email.trim().toLowerCase()) {
      throw new PortalError(404, registrationMessages.unauthorized);
    }
    const [row] = await database.query(
      `SELECT status,"decisionReason" FROM "ClinicalRegistrationRequest" WHERE "employeeId"=$1 ORDER BY "requestedAt" DESC LIMIT 1`,
      [employee.id],
    );
    if (employee.clinicalRole && (!row || row.status === "APPROVED")) return { status: "APPROVED", message: registrationMessages.approved };
    if (!row) return { status: "NONE", message: "No internal clinical registration is on file. Submit the registration form." };
    if (row.status === "PENDING_APPROVAL" || row.status === "PENDING_VERIFICATION" || row.status === "INVITED") return { status: row.status, message: registrationMessages.pending };
    if (row.status === "APPROVED") return { status: "APPROVED", message: registrationMessages.approved };
    if (row.status === "REJECTED") return { status: "REJECTED", message: row.decisionReason ? `${registrationMessages.rejectedLogin} ${row.decisionReason}` : registrationMessages.rejectedLogin };
    if (row.status === "SUSPENDED") return { status: "SUSPENDED", message: registrationMessages.suspended };
    return { status: row.status, message: registrationMessages.revoked };
  } catch (error) {
    databaseFailure(error);
  }
}
