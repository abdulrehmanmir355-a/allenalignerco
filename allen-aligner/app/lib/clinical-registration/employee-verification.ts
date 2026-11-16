import "server-only";
import type { Database } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { registrationMessages } from "./messages";

export type AuthorizedEmployee = {
  id: string;
  permanentId: string;
  fullName: string;
  email: string;
  department: string;
  designation: string;
  status: string;
  accountId: string;
  passwordHash: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  clinicalRole: string | null;
  role: string;
};

const same = (left: unknown, right: unknown) => String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();

export async function authorizedEmployee(tx: Database, employeeId: string): Promise<AuthorizedEmployee> {
  const [row] = await tx.query(
    `SELECT e.id,e."permanentId",e."fullName",e.email,e.department,e.designation,e.status,
            w.id AS "accountId",w."passwordHash",w."isActive",w."mustChangePassword",w."clinicalRole",w.role
       FROM "Employee" e
       JOIN "WorkAccount" w ON w."employeeId"=e.id
      WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1))
      FOR UPDATE OF w,e`,
    [employeeId],
  );
  if (!row?.email) throw new PortalError(403, registrationMessages.unauthorized);
  return row as AuthorizedEmployee;
}

export function assertOfficialEmail(employee: AuthorizedEmployee, email: string) {
  if (!same(employee.email, email)) throw new PortalError(403, registrationMessages.unauthorized);
}

export function assertProfile(employee: AuthorizedEmployee, input: { fullName?: string; department?: string; jobTitle?: string; employeeStatus?: string }) {
  const checks: [string, string][] = [
    [input.fullName || "", employee.fullName],
    [input.department || "", employee.department],
    [input.jobTitle || "", employee.designation],
    [input.employeeStatus || "", employee.status],
  ];
  for (const [given, actual] of checks) {
    if (given && !same(given, actual)) throw new PortalError(400, registrationMessages.profileMismatch);
  }
}

export function assertActiveEmployee(employee: AuthorizedEmployee) {
  if (employee.status !== "ACTIVE") throw new PortalError(403, registrationMessages.inactive);
  if (employee.role === "CLINICAL_ONLY") throw new PortalError(403, registrationMessages.unauthorized);
}
