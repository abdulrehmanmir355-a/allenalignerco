import "server-only";
import { randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/app/lib/database";
import { digest } from "@/app/lib/portal-auth";
import { PortalError } from "@/app/lib/portal-http";
import { registrationMessages } from "./messages";
import { approvedClinicalRole, latestRegistrationStatus, securityEvent } from "./access-control";

/** Creates a clinical session only after the employee is active and approved. */
export async function loginApprovedEmployee(employeeId: string, password: string) {
  const accounts = await db.query(
    `SELECT w.id,w."employeeId",w."passwordHash",w."isActive",w."mustChangePassword",w."clinicalRole",e.status AS "identityStatus",e."permanentId"
       FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId"
      WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1))
         OR UPPER(BTRIM(COALESCE(e."employeeCode",'')))=UPPER(BTRIM($1))
         OR lower(BTRIM(e.email))=lower(BTRIM($1))
      ORDER BY CASE
        WHEN UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1)) THEN 0
        WHEN UPPER(BTRIM(COALESCE(e."employeeCode",'')))=UPPER(BTRIM($1)) THEN 1
        ELSE 2 END
      LIMIT 2`,
    [employeeId],
  );
  const account = accounts.length > 1
    ? accounts.find(row => String(row.permanentId).toUpperCase() === employeeId.trim().toUpperCase())
    : accounts[0];
  if (!account?.passwordHash || !(await compare(password, String(account.passwordHash)))) {
    throw new PortalError(401, "Invalid employee ID or password.");
  }
  const status = await latestRegistrationStatus(account.employeeId);
  if (status === "PENDING_APPROVAL" || status === "PENDING_VERIFICATION" || status === "INVITED") {
    throw new PortalError(403, registrationMessages.pending);
  }
  if (status === "REJECTED") throw new PortalError(403, registrationMessages.rejectedLogin);
  if (status === "SUSPENDED") throw new PortalError(403, registrationMessages.suspended);
  if (status === "REVOKED") throw new PortalError(403, registrationMessages.revoked);
  if (!account.clinicalRole && status === "APPROVED") {
    const restored = await approvedClinicalRole(db, account.employeeId, null);
    if (restored.role) {
      await db.query(
        `UPDATE "WorkAccount" SET "clinicalRole"=COALESCE("clinicalRole",$2),"isActive"=true,"mustChangePassword"=false WHERE id=$1`,
        [account.id, restored.role],
      );
      account.clinicalRole = restored.role;
      account.isActive = true;
    }
  }
  if (!account.clinicalRole) {
    throw new PortalError(403, "Internal Clinical Review access has not been granted. Use an HR registration code, or wait for Admin or Owner approval.");
  }
  if (account.identityStatus !== "ACTIVE" || !account.isActive) {
    throw new PortalError(403, "Internal Clinical Review access has not been granted.");
  }
  if (account.mustChangePassword) throw new PortalError(403, "Change your initial password in the Employee Portal before using Internal Clinical Review.");
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 3600000);
  await db.transaction(async tx => {
    const previous = (await cookies()).get("allen_work_session")?.value;
    if (previous) await tx.query(`DELETE FROM "WorkSession" WHERE "tokenHash"=$1`, [digest(previous)]);
    await tx.query(`INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,$3)`, [digest(token), account.id, expires]);
    await securityEvent(tx, "clinical.login", account.employeeId, account.id, { permanentId: account.permanentId });
  });
  (await cookies()).set("allen_work_session", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires,
  });
  return { message: "Signed in to Internal Clinical Review." };
}
