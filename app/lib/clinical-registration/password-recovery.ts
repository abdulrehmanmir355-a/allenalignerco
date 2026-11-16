import "server-only";
import { hash } from "bcryptjs";
import { db } from "@/app/lib/database";
import { PortalError } from "@/app/lib/portal-http";
import { clinicalRegistrationPolicy, passwordProblems } from "./policy";
import { registrationMessages } from "./messages";
import { appBaseUrl, deliverClinicalEmail } from "./email";
import { approvedClinicalRole, securityEvent } from "./access-control";
import { newToken, tokenHash } from "./tokens";
import type { Database } from "@/app/lib/database";

/** Saves the password and restores a clinical role only when registration is already approved. */
async function finishPasswordChange(
  tx: Database,
  account: { id: string; employeeId: string | null; clinicalRole: string | null },
  passwordHash: string,
  activate: boolean,
) {
  const saved = await approvedClinicalRole(tx, account.employeeId, account.clinicalRole);
  const active = activate || Boolean(saved.role);
  await tx.query(
    `UPDATE "WorkAccount"
        SET "passwordHash"=$2,"isActive"=CASE WHEN $4 THEN true ELSE "isActive" END,
            "mustChangePassword"=CASE WHEN $4 THEN false ELSE "mustChangePassword" END,
            "clinicalRole"=COALESCE("clinicalRole",$3)
      WHERE id=$1`,
    [account.id, passwordHash, saved.role, active],
  );
  await tx.query(`DELETE FROM "WorkSession" WHERE "accountId"=$1`, [account.id]);
  return saved;
}

export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const generic = { message: registrationMessages.resetGeneric };
  const [account] = await db.query(
    `SELECT w.id,w."employeeId",w."passwordHash",w."isActive",e.email
       FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId"
      WHERE lower(trim(e.email))=lower(trim($1)) AND e.status='ACTIVE' AND w."passwordHash" IS NOT NULL
      LIMIT 1`,
    [normalized],
  );
  if (!account) {
    await securityEvent(db, "clinical.password_reset.unknown", null, null, { requested: true });
    return generic;
  }
  const token = newToken();
  const expires = new Date(Date.now() + clinicalRegistrationPolicy.resetHours * 3600000);
  await db.transaction(async tx => {
    await tx.query(`UPDATE "ClinicalPasswordReset" SET "usedAt"=clock_timestamp() WHERE "accountId"=$1 AND "usedAt" IS NULL`, [account.id]);
    await tx.query(
      `INSERT INTO "ClinicalPasswordReset"("accountId","tokenHash","expiresAt") VALUES($1,$2,$3)`,
      [account.id, tokenHash(token), expires],
    );
    const link = `${appBaseUrl()}/clinical/reset-password?token=${token}`;
    await deliverClinicalEmail({
      to: account.email,
      kind: "clinical-password-reset",
      subject: "Allen Aligner password reset",
      text: `A password reset was requested for your official employee account.\n\nOpen this link within ${clinicalRegistrationPolicy.resetHours} hour: ${link}\n\nIf you did not request this, ignore this message. Resetting a password does not approve or activate clinical access.`,
    }, tx);
    await securityEvent(tx, "clinical.password_reset.issued", account.employeeId, account.id, { purpose: "PASSWORD_RESET", channel: "EMAIL_LINK", expiresAt: expires.toISOString() });
  });
  return generic;
}

export async function confirmPasswordReset(token: string, password: string, confirmPassword: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new PortalError(400, registrationMessages.resetInvalid);
  if (password !== confirmPassword) throw new PortalError(400, registrationMessages.passwordMismatch);
  const problems = passwordProblems(password);
  if (problems.length) throw new PortalError(400, problems[0]);
  const passwordHash = await hash(password, 12);
  return db.transaction(async tx => {
    const [match] = await tx.query(
      `SELECT id,"accountId" FROM "ClinicalPasswordReset"
        WHERE "tokenHash"=$1 AND "usedAt" IS NULL AND "expiresAt">clock_timestamp()
        FOR UPDATE`,
      [tokenHash(token)],
    );
    if (!match) throw new PortalError(400, registrationMessages.resetInvalid);
    const used = await tx.query(
      `UPDATE "ClinicalPasswordReset" SET "usedAt"=clock_timestamp() WHERE id=$1 AND "usedAt" IS NULL AND "expiresAt">clock_timestamp() RETURNING id`,
      [match.id],
    );
    if (!used.length) throw new PortalError(400, registrationMessages.resetInvalid);
    const [account] = await tx.query(`SELECT id,"employeeId","clinicalRole" FROM "WorkAccount" WHERE id=$1 FOR UPDATE`, [match.accountId]);
    if (!account) throw new PortalError(400, registrationMessages.resetInvalid);
    const saved = await finishPasswordChange(tx, { id: String(account.id), employeeId: account.employeeId ? String(account.employeeId) : null, clinicalRole: account.clinicalRole ? String(account.clinicalRole) : null }, passwordHash, false);
    await securityEvent(tx, "clinical.password_reset.completed", account?.employeeId ?? null, match.accountId, { purpose: "PASSWORD_RESET", channel: "EMAIL_LINK", clinicalRole: saved.role, restoredApprovedRole: saved.restored });
    return { message: saved.role ? registrationMessages.resetSuccess : `${registrationMessages.resetSuccess} Internal Clinical Review access is still not granted. Use an HR registration code, or wait for Admin or Owner approval.` };
  });
}

export async function redeemHrPasswordCode(employeeId: string, code: string, password: string, confirmPassword: string) {
  if (!/^AA-EMP-\d{6,12}$/.test(employeeId) || !/^[a-f0-9]{64}$/.test(code)) throw new PortalError(400, registrationMessages.resetInvalid);
  if (password !== confirmPassword) throw new PortalError(400, registrationMessages.passwordMismatch);
  const problems = passwordProblems(password);
  if (problems.length) throw new PortalError(400, problems[0]);
  const passwordHash = await hash(password, 12);
  return db.transaction(async tx => {
    const [account] = await tx.query(
      `SELECT w.id,w."employeeId",w."clinicalRole" FROM "WorkAccount" w
         JOIN "Employee" e ON e.id=w."employeeId"
        WHERE UPPER(BTRIM(e."permanentId"))=UPPER(BTRIM($1)) AND e.status='ACTIVE'
        FOR UPDATE OF w`,
      [employeeId],
    );
    const matches = account ? await tx.query(
      `SELECT id FROM "ClinicalPasswordReset"
        WHERE "accountId"=$1 AND "tokenHash"=$2 AND "usedAt" IS NULL AND "expiresAt">clock_timestamp()
        FOR UPDATE`,
      [account.id, tokenHash(code)],
    ) : [];
    const match = matches[0];
    if (!match) throw new PortalError(400, registrationMessages.resetInvalid);
    const used = await tx.query(
      `UPDATE "ClinicalPasswordReset" SET "usedAt"=clock_timestamp() WHERE id=$1 AND "usedAt" IS NULL RETURNING id`,
      [match.id],
    );
    if (!used.length) throw new PortalError(400, registrationMessages.resetInvalid);
    const saved = await finishPasswordChange(tx, { id: String(account.id), employeeId: account.employeeId ? String(account.employeeId) : null, clinicalRole: account.clinicalRole ? String(account.clinicalRole) : null }, passwordHash, true);
    await securityEvent(tx, "clinical.password_code.completed", account.employeeId, account.id, { purpose: "PASSWORD_RESET", channel: "HR_CODE", clinicalRole: saved.role, restoredApprovedRole: saved.restored });
    return {
      message: saved.role
        ? "Your password has been saved. Sign in with the password you just chose."
        : "Your password has been saved. Internal Clinical Review access has not been granted yet. Use an HR registration code, or wait for Admin or Owner approval.",
    };
  });
}
