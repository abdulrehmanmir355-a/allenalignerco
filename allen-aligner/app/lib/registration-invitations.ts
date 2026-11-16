import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { db, type Database } from './database';
import { PortalError } from './portal-http';
import { closeInvitations, identityEvent } from './identity-service';

export type InvitationAdmin = { id: string; role: string };
const employeeId = z.string().trim().regex(/^AA-EMP-\d{6,12}$/);
const management = z.object({
  action: z.enum(['invite', 'resend', 'revoke']), employeeId,
  invitationId: z.uuid().optional(), reason: z.string().trim().min(5).max(1000),
  method: z.enum(['MANUAL', 'PRINTED', 'DIGITAL']).default('MANUAL'),
}).strict();
export const registrationInput = z.object({
  action: z.literal('register'), employeeId,
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72),
  confirmPassword: z.string().max(72),
}).strict();

export function invitationAdmin(actor: InvitationAdmin | null): asserts actor is InvitationAdmin {
  if (!actor) throw new PortalError(401, 'HR sign-in required.');
  if (!actor.id || !['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(actor.role)) throw new PortalError(403, 'An authorized HR account is required.');
}
function invitationManager(actor: InvitationAdmin) {
  invitationAdmin(actor);
  if (!['HR_ADMIN', 'HR_OFFICER'].includes(actor.role)) throw new PortalError(403, 'Your HR account has view-only access to invitations.');
}
async function requireEmployeeScope(tx: Database, actor: InvitationAdmin, employeeId: string) {
  if (actor.role === 'HR_ADMIN') return;
  const grant = await tx.query('SELECT 1 FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2 LIMIT 1', [actor.id, employeeId]);
  if (!grant.length) throw new PortalError(404, 'Employee not found or outside your HR scope.');
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function matches(token: string, stored: unknown) {
  return typeof stored === 'string' && /^[a-f0-9]{64}$/.test(stored) &&
    timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(stored, 'hex'));
}
async function audit(tx: Database, actorId: string, action: string, accountId: string, detail: unknown) {
  await tx.query('INSERT INTO "WorkAudit"("actorId",action,"recordId",detail) VALUES($1::text,$2,$3::uuid,$4::jsonb)',
    [actorId, action, accountId, JSON.stringify(detail)]);
}

export async function manageInvitation(body: unknown, actor: InvitationAdmin, database: Database = db) {
  invitationManager(actor);
  const parsed = management.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Choose an employee, action and reason (5–1,000 characters).');
  const input = parsed.data;
  return database.transaction(async tx => {
    const [account] = await tx.query(`SELECT w.id,w."employeeId",w."isActive",w."passwordHash",e.status,e.email
      FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId"
      WHERE e."permanentId"=$1 FOR UPDATE OF w,e`, [input.employeeId]);
    if (!account) throw new PortalError(404, 'Employee not found. Register the employee through HR first.');
    await requireEmployeeScope(tx, actor, String(account.employeeId));
    const [previous] = await tx.query(`SELECT id,"closedAt" FROM "EmployeeInvitation" WHERE "employeeId"=$1
      ORDER BY "issuedAt" DESC,id DESC LIMIT 1 FOR UPDATE`, [account.employeeId]);
    if (input.invitationId && previous?.id !== input.invitationId) throw new PortalError(409, 'Invitation changed. Refresh and retry.');
    if (input.action !== 'invite' && !previous) throw new PortalError(409, 'No invitation exists for this employee. Issue one first.');
    if (input.action === 'revoke') {
      if (previous.closedAt) throw new PortalError(409, 'This invitation is already closed.');
      await closeInvitations(tx, String(account.employeeId), actor.id, input.reason);
      await tx.query('UPDATE "WorkAccount" SET "registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE id=$1', [account.id]);
      await audit(tx, actor.id, 'registration.revoke', String(account.id), { employeeId: account.employeeId, invitationId: previous.id, reason: input.reason });
      return { employeeId: input.employeeId, invitationId: previous.id, message: 'Invitation revoked.' };
    }
    if (account.isActive || account.passwordHash || account.status !== 'ACTIVE') {
      throw new PortalError(409, 'Invitations are for active employees without login credentials. Use account management for password resets.');
    }
    await closeInvitations(tx, String(account.employeeId), actor.id, input.reason);
    const token = randomBytes(32).toString('hex');
    const [invitation] = await tx.query(`WITH issued AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS instant)
      INSERT INTO "EmployeeInvitation"("employeeId","issuedBy","issuedAt","expiresAt",method,remarks,"intendedEmail")
      SELECT $1,$2,instant,instant + interval '24 hours',$3,$4,$5 FROM issued
      RETURNING id,"issuedAt","expiresAt"`, [account.employeeId, actor.id, input.method, input.reason, account.email]);
    await tx.query('UPDATE "WorkAccount" SET "registrationTokenHash"=$2,"registrationExpiresAt"=$3 WHERE id=$1',
      [account.id, digest(token), invitation.expiresAt]);
    const detail = { employeeId: account.employeeId, invitationId: invitation.id, previousInvitationId: previous?.id ?? null, reason: input.reason, method: input.method, expiresAt: invitation.expiresAt };
    await identityEvent(tx, String(invitation.id), actor.id, input.action === 'resend' ? 'RESENT' : 'ISSUED', detail);
    await audit(tx, actor.id, 'registration.' + input.action, String(account.id), detail);
    return { token, employeeId: input.employeeId, invitationId: invitation.id, expiresAt: invitation.expiresAt,
      message: input.action === 'resend' ? 'Replacement invitation created. The previous code is invalid. Share the new code privately.' : 'Invitation created. Share the one-time code privately with the intended employee.' };
  });
}

export async function invitationData(actor: InvitationAdmin, requestedPage = 1, database: Database = db) {
  invitationAdmin(actor);
  const scopeId = actor.role === 'HR_ADMIN' ? null : actor.id;
  const employees = await database.query(`SELECT e."permanentId",e."fullName",e.email,w."registrationExpiresAt"
    FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id
    WHERE e.status='ACTIVE' AND NOT w."isActive" AND w."passwordHash" IS NULL
      AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$1))
    ORDER BY e."permanentId"`, [scopeId]);
  const [count] = await database.query(`SELECT count(*)::int AS total FROM "EmployeeInvitation" i JOIN "Employee" e ON e.id=i."employeeId"
    WHERE ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$1))`, [scopeId]);
  const total = Number(count.total), pageSize = 50;
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / pageSize)));
  const invitations = await database.query(`SELECT i.id,i."employeeId",e."permanentId",e."fullName",i."intendedEmail",i."issuedAt",i."expiresAt",i."closedAt",i."activatedAt",i.method,i.status AS "deliveryStatus",i.remarks,h.email AS "issuedBy",
    CASE WHEN i."activatedAt" IS NOT NULL THEN 'USED'
      WHEN i."closedAt" IS NOT NULL OR e.status<>'ACTIVE' OR w."isActive" OR w."passwordHash" IS NOT NULL THEN 'REVOKED'
      WHEN i."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'PENDING' END AS state,
    (i.id=(SELECT latest.id FROM "EmployeeInvitation" latest WHERE latest."employeeId"=i."employeeId" ORDER BY latest."issuedAt" DESC,latest.id DESC LIMIT 1)) AS "isLatest"
    FROM "EmployeeInvitation" i JOIN "Employee" e ON e.id=i."employeeId"
    JOIN "WorkAccount" w ON w."employeeId"=e.id JOIN "HRUser" h ON h.id=i."issuedBy"
    WHERE ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM "WorkHRGrant" g WHERE g."employeeId"=e.id AND g."userId"=$1))
    ORDER BY i."issuedAt" DESC,i.id DESC LIMIT $2 OFFSET $3`, [scopeId, pageSize, (page - 1) * pageSize]);
  const events = await database.query(`SELECT v.id,v."invitationId",v.action,v.detail,v."createdAt",COALESCE(h.email,v."actorId") AS actor
    FROM "EmployeeIdentityEvent" v LEFT JOIN "HRUser" h ON h.id::text=v."actorId"
    WHERE v."invitationId"=ANY($1::uuid[]) ORDER BY v.id DESC`, [invitations.map(i => i.id)]);
  return { actor: { role: actor.role }, employees, invitations, events, page, pageSize, total };
}

export async function activateEmployee(body: unknown, database: Database = db) {
  const parsed = registrationInput.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Check your employee ID, invitation code and password details.');
  const input = parsed.data;
  if (input.password !== input.confirmPassword) throw new PortalError(400, 'Passwords do not match.');
  return database.transaction(async tx => {
    const [account] = await tx.query(`SELECT w.*,e.status,e.email,e."permanentId" FROM "WorkAccount" w
      JOIN "Employee" e ON e.id=w."employeeId" WHERE e."permanentId"=$1 FOR UPDATE OF w,e`, [input.employeeId]);
    const invalid = () => new PortalError(400, 'Invitation is invalid, expired or already used. Contact HR.');
    if (!account || account.isActive || account.passwordHash || account.status !== 'ACTIVE' || !matches(input.token, account.registrationTokenHash)) throw invalid();
    const [invitation] = await tx.query(`SELECT id FROM "EmployeeInvitation" WHERE "employeeId"=$1
      AND "closedAt" IS NULL AND "activatedAt" IS NULL AND "expiresAt">clock_timestamp()
      AND "expiresAt"=$2 AND ("intendedEmail" IS NULL OR lower(trim("intendedEmail"))=lower(trim($3::text))) FOR UPDATE`,
      [account.employeeId, account.registrationExpiresAt, account.email]);
    if (!invitation) throw invalid();
    const passwordHash = await hash(input.password, 12);
    // Check the database clock again after password hashing, before activation.
    const used = await tx.query(`UPDATE "EmployeeInvitation" SET "activatedAt"=clock_timestamp(),"closedAt"=clock_timestamp()
      WHERE id=$1 AND "closedAt" IS NULL AND "expiresAt">clock_timestamp() RETURNING id`, [invitation.id]);
    if (!used.length) throw invalid();
    await tx.query(`UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=true,"mustChangePassword"=false,
      "registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE id=$1`, [account.id, passwordHash]);
    await identityEvent(tx, String(invitation.id), String(account.id), 'ACTIVATED', { employeeId: account.employeeId });
    await tx.query('DELETE FROM "WorkSession" WHERE "accountId"=$1', [account.id]);
    await audit(tx, String(account.id), 'registration.completed', String(account.id), { employeeId: account.employeeId, invitationId: invitation.id });
    return { employeeId: account.permanentId, message: 'Employee registration completed. Sign in with your employee ID and password.' };
  });
}
