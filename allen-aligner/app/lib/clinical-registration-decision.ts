import type { Database } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { syncRegistrationDecision } from "@/app/lib/clinical-registration/registration-approval";

export type ClinicalDecisionActor = {
  id: string;
  name: string;
  email?: string;
  source: "CLINICAL_ADMIN" | "OWNER_COMMAND_CENTER";
  role: "ADMIN" | "OWNER";
};

export async function decideClinicalRegistration(
  tx: Database,
  input: {
    accountId: string;
    requestId: string;
    decision: "APPROVE" | "REJECT";
    reason: string;
  },
  actor: ClinicalDecisionActor,
) {
  const [account] = await tx.query(
    `SELECT w.id,w.role,w."employeeId",w."clinicalRole",w."clinicalRequest",w."isActive",
            w."mustChangePassword",w."passwordHash",e.status,e."fullName"
            ,e.email
       FROM "WorkAccount" w
       JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE w.id=$1
      FOR UPDATE OF w`,
    [input.accountId],
  );

  if (!account) throw new PortalError(404, "Employee account not found.");
  if (account.id === actor.id || (actor.email && account.email && String(account.email).toLowerCase() === actor.email.toLowerCase())) {
    throw new PortalError(403, "Self-approval is not permitted.");
  }

  const pending = account.clinicalRequest;
  if (!pending || pending.status !== "PENDING" || pending.id !== input.requestId) {
    throw new PortalError(409, "Registration changed or has already been decided. Refresh the dashboard.");
  }
  if (!['REVIEWER', 'LEAD'].includes(pending.role) || (account.role === "CLINICAL_ONLY" && pending.role !== "REVIEWER")) {
    throw new PortalError(403, "Requested clinical role is not permitted for this account.");
  }
  if (account.clinicalRole) throw new PortalError(409, "Clinical permission already exists.");
  const [storedPassword] = account.employeeId
    ? await tx.query(`SELECT "passwordHash" FROM "ClinicalRegistrationRequest" WHERE id=$1::uuid`, [input.requestId])
    : [];
  const activatingWithRegistrationPassword = Boolean(storedPassword?.passwordHash);
  if (input.decision === "APPROVE" && account.status !== "ACTIVE") {
    throw new PortalError(409, "Account must be active, identity verified, and the password-change requirement completed.");
  }
  if (input.decision === "APPROVE" && !activatingWithRegistrationPassword && (!account.isActive || account.mustChangePassword || !account.passwordHash)) {
    throw new PortalError(409, "Account must be active, identity verified, and the password-change requirement completed.");
  }

  const updated = {
    ...pending,
    status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED",
    decidedAt: new Date().toISOString(),
    decidedBy: actor.id,
    decidedByRole: actor.role,
    decisionSource: actor.source,
    decisionReason: input.reason,
  };
  await tx.query(
    `UPDATE "WorkAccount" SET "clinicalRequest"=$2::jsonb,"clinicalRole"=$3 WHERE id=$1`,
    [account.id, JSON.stringify(updated), input.decision === "APPROVE" ? pending.role : null],
  );
  await syncRegistrationDecision(tx, {
    accountId: account.id,
    employeeId: account.employeeId ?? null,
    requestId: input.requestId,
    decision: input.decision,
    reason: input.reason,
    clinicalRole: input.decision === "APPROVE" ? pending.role : null,
  }, actor);
  await tx.query(
    `INSERT INTO "ClinicalReviewAudit"("actorId","actorName",action,detail)
     VALUES($1,$2,$3,$4::jsonb)`,
    [actor.id, actor.name, "CLINICAL_REGISTRATION_DECISION", JSON.stringify({
      accountId: account.id,
      requestId: input.requestId,
      decision: input.decision,
      source: actor.source,
      before: pending,
      after: updated,
    })],
  );
  return updated;
}
