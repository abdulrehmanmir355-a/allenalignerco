import "server-only";
import type { Database } from "@/app/lib/database";
import { db } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { registrationMessages } from "./messages";
import type { ClinicalRegistrationStatus } from "./policy";

const blocked = new Set<ClinicalRegistrationStatus>(["INVITED", "PENDING_VERIFICATION", "PENDING_APPROVAL", "REJECTED", "SUSPENDED", "REVOKED"]);
const restorableRoles = new Set(["REVIEWER", "LEAD", "ADMIN"]);

/** Returns an already approved clinical role. Does not approve a new request. */
export async function approvedClinicalRole(database: Database, employeeId: string | null, currentRole: string | null) {
  if (currentRole) return { role: currentRole, restored: false };
  if (!employeeId) return { role: null, restored: false };
  const [request] = await database.query(
    `SELECT status,"requestedRole" FROM "ClinicalRegistrationRequest"
      WHERE "employeeId"=$1 ORDER BY "requestedAt" DESC, id DESC LIMIT 1`,
    [employeeId],
  );
  if (request?.status === "APPROVED" && restorableRoles.has(String(request.requestedRole))) {
    return { role: String(request.requestedRole), restored: true };
  }
  return { role: null, restored: false };
}

export async function latestRegistrationStatus(employeeId: string | null, database: Database = db) {
  if (!employeeId) return null;
  const [row] = await database.query(
    `SELECT status FROM "ClinicalRegistrationRequest" WHERE "employeeId"=$1 ORDER BY "requestedAt" DESC, id DESC LIMIT 1`,
    [employeeId],
  );
  return (row?.status as ClinicalRegistrationStatus | undefined) ?? null;
}

export function assertClinicalRegistrationAllowsAccess(status: ClinicalRegistrationStatus | null) {
  if (!status) return;
  if (status === "SUSPENDED") throw new PortalError(403, registrationMessages.suspended);
  if (status === "REVOKED") throw new PortalError(403, registrationMessages.revoked);
  if (status === "REJECTED") throw new PortalError(403, registrationMessages.rejectedLogin);
  if (blocked.has(status)) throw new PortalError(403, registrationMessages.pending);
}

export async function securityEvent(database: Database, action: string, employeeId: string | null, actorId: string | null, detail: Record<string, unknown>) {
  await database.query(
    `INSERT INTO "ClinicalSecurityEvent"("actorId",action,"employeeId",detail) VALUES($1,$2,$3,$4::jsonb)`,
    [actorId, action, employeeId, JSON.stringify(detail)],
  );
}
