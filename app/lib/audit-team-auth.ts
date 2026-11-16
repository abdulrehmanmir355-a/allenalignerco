import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { db, type Database } from './database';
import { currentHR } from './hr-auth';
import { digest } from './portal-auth';
import { PortalError } from './portal-http';

const COOKIE = 'allen_audit_session';
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordSchema = z.string().min(12).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72);
const managerBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), email: emailSchema, fullName: z.string().trim().min(2).max(150), reason: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ action: z.enum(['replace','revoke','suspend']), accountId: z.uuid(), reason: z.string().trim().min(5).max(1000) }).strict(),
]);
const registerBody = z.object({ email: emailSchema, code: z.string().trim().regex(/^[a-f0-9]{64}$/), password: passwordSchema, confirmPassword: z.string().max(72) }).strict();
const loginBody = z.object({ email: emailSchema, password: z.string().min(1).max(72) }).strict();
export type AuditActor = { id: string; email: string; role: string } | null;

function requireManager(actor: AuditActor) {
  if (!actor) throw new PortalError(401, 'HR sign-in required.');
  if (!['HR_ADMIN','HR_OFFICER'].includes(actor.role)) throw new PortalError(403, 'HR Admin or HR Officer permission is required to invite audit team members.');
}
async function accessEvent(tx: Database, actorId: string, accountId: string, action: string, detail: unknown) {
  await tx.query(`INSERT INTO "AuditTeamAccessEvent"("actorId","accountId",action,detail) VALUES($1,$2,$3,$4::jsonb)`, [actorId, accountId, action, JSON.stringify(detail ?? {})]);
}

export async function auditTeamAccessData(actor: AuditActor, database: Database = db) {
  requireManager(actor);
  const [accounts, events] = await Promise.all([
    database.query(`SELECT u.id,u."fullName",u.email,u."isActive",i."expiresAt",
      CASE WHEN u."isActive" THEN 'ACTIVE' WHEN i."revokedAt" IS NOT NULL THEN 'REVOKED' WHEN i.id IS NULL AND u."passwordHash" IS NOT NULL THEN 'SUSPENDED' WHEN i."expiresAt"<=clock_timestamp() THEN 'EXPIRED' WHEN i.id IS NOT NULL THEN 'INVITED' ELSE 'REVOKED' END AS state
      FROM "HRUser" u LEFT JOIN LATERAL (SELECT id,"expiresAt","revokedAt" FROM "AuditTeamInvitation" WHERE "hrUserId"=u.id AND "usedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1) i ON TRUE
      WHERE u.role='AUDIT_TEAM' ORDER BY u."fullName" LIMIT 300`),
    database.query(`SELECT e.id,e.action,e.detail,e."createdAt",a.email AS "actorEmail",t."fullName" AS "accountName" FROM "AuditTeamAccessEvent" e JOIN "HRUser" a ON a.id=e."actorId" JOIN "HRUser" t ON t.id=e."accountId" ORDER BY e.id DESC LIMIT 100`),
  ]);
  return { accounts, events };
}

export async function manageAuditTeamAccess(body: unknown, actor: AuditActor, database: Database = db) {
  requireManager(actor);
  const parsed = managerBody.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Provide valid audit team account details and a reason.');
  const value = parsed.data;
  return database.transaction(async tx => {
    let account: { id: string; email: string; fullName: string };
    if (value.action === 'invite') {
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, ['audit-team-email:' + value.email]);
      const [existing] = await tx.query(`SELECT id,email,"fullName",role,"isActive" FROM "HRUser" WHERE lower(email)=lower($1) FOR UPDATE`, [value.email]);
      if (existing && (existing.role !== 'AUDIT_TEAM' || existing.isActive)) throw new PortalError(409, 'That email already belongs to an active account or another access role.');
      if (existing) {
        await tx.query(`UPDATE "HRUser" SET "fullName"=$2 WHERE id=$1`, [existing.id, value.fullName]);
        account = { id: String(existing.id), email: existing.email, fullName: value.fullName };
      }
      else {
        const temporaryHash = await hash(randomBytes(32).toString('hex'), 12);
        const [created] = await tx.query(`INSERT INTO "HRUser"("fullName",email,"passwordHash",role,"isActive") VALUES($1,$2,$3,'AUDIT_TEAM',FALSE) RETURNING id,email,"fullName"`, [value.fullName, value.email, temporaryHash]);
        account = { id: String(created.id), email: created.email, fullName: created.fullName };
      }
      await tx.query(`UPDATE "AuditTeamInvitation" SET "revokedAt"=clock_timestamp() WHERE "hrUserId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`, [account.id]);
      const code = randomBytes(32).toString('hex');
      const [issued] = await tx.query(`INSERT INTO "AuditTeamInvitation"("hrUserId","codeHash","issuedBy","expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval '24 hours') RETURNING "expiresAt"`, [account.id, digest(code), actor!.id]);
      await accessEvent(tx, actor!.id, account.id, existing ? 'INVITATION_REPLACED' : 'INVITATION_ISSUED', { email: account.email, reason: value.reason, expiresAt: issued.expiresAt });
      return { message: 'Audit team invitation created. Share this one-time code privately; it expires in 24 hours.', email: account.email, code, expiresAt: issued.expiresAt };
    }
    const [found] = await tx.query(`SELECT id,email,"fullName","isActive","passwordHash" FROM "HRUser" WHERE id=$1 AND role='AUDIT_TEAM' FOR UPDATE`, [value.accountId]);
    if (!found) throw new PortalError(404, 'Audit team account not found.');
    account = { id: String(found.id), email: found.email, fullName: found.fullName };
    if (value.action === 'suspend') {
      await tx.query(`UPDATE "HRUser" SET "isActive"=FALSE WHERE id=$1`, [account.id]);
      await tx.query(`DELETE FROM "AuditTeamSession" WHERE "hrUserId"=$1`, [account.id]);
      await tx.query(`UPDATE "AuditTeamInvitation" SET "revokedAt"=clock_timestamp() WHERE "hrUserId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`, [account.id]);
      await accessEvent(tx, actor!.id, account.id, 'ACCOUNT_SUSPENDED', { reason: value.reason });
      return { message: 'Audit team access suspended and sessions ended.' };
    }
    if (value.action === 'revoke') {
      if (found.isActive) throw new PortalError(409, 'This account is active. Suspend it to remove access.');
      const [open] = await tx.query(`UPDATE "AuditTeamInvitation" SET "revokedAt"=clock_timestamp() WHERE "hrUserId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL RETURNING id`, [account.id]);
      if (!open) throw new PortalError(409, 'There is no open invitation to revoke.');
      await accessEvent(tx, actor!.id, account.id, 'INVITATION_REVOKED', { reason: value.reason });
      return { message: 'Audit team invitation revoked.' };
    }
    if (found.isActive) throw new PortalError(409, 'This account is active. Suspend it before issuing a replacement invitation.');
    await tx.query(`UPDATE "AuditTeamInvitation" SET "revokedAt"=clock_timestamp() WHERE "hrUserId"=$1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`, [account.id]);
    const code = randomBytes(32).toString('hex');
    const [issued] = await tx.query(`INSERT INTO "AuditTeamInvitation"("hrUserId","codeHash","issuedBy","expiresAt") VALUES($1,$2,$3,clock_timestamp()+interval '24 hours') RETURNING "expiresAt"`, [account.id, digest(code), actor!.id]);
    await accessEvent(tx, actor!.id, account.id, 'INVITATION_REPLACED', { reason: value.reason, expiresAt: issued.expiresAt });
    return { message: 'Replacement invitation created. The old code is invalid.', email: account.email, code, expiresAt: issued.expiresAt };
  });
}

export async function activateAuditTeam(body: unknown, database: Database = db) {
  const parsed = registerBody.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Enter the invited email, 64-character code and a password of at least 12 characters.');
  const value = parsed.data;
  if (value.password !== value.confirmPassword) throw new PortalError(400, 'Passwords do not match.');
  return database.transaction(async tx => {
    const [invite] = await tx.query(`SELECT i.id,i."expiresAt",i."usedAt",i."revokedAt",u.id AS "userId",u."isActive" FROM "AuditTeamInvitation" i JOIN "HRUser" u ON u.id=i."hrUserId" WHERE lower(u.email)=lower($1) AND i."codeHash"=$2 FOR UPDATE OF i,u`, [value.email, digest(value.code)]);
    if (!invite || invite.usedAt || invite.revokedAt || new Date(invite.expiresAt) <= new Date()) throw new PortalError(400, 'Invitation code is invalid, expired or already used. Contact HR for a new code.');
    const passwordHash = await hash(value.password, 12);
    await tx.query(`UPDATE "HRUser" SET "passwordHash"=$2,"isActive"=TRUE WHERE id=$1 AND role='AUDIT_TEAM'`, [invite.userId, passwordHash]);
    await tx.query(`UPDATE "AuditTeamInvitation" SET "usedAt"=clock_timestamp() WHERE id=$1`, [invite.id]);
    await accessEvent(tx, invite.userId, invite.userId, 'ACCOUNT_REGISTERED', {});
    return { message: 'Registration complete. Sign in through Audit Login.' };
  });
}

export async function auditTeamCredentials(body: unknown, database: Database = db) {
  const parsed = loginBody.safeParse(body);
  if (!parsed.success) throw new PortalError(400, 'Enter your email and password.');
  const { email, password } = parsed.data;
  const [user] = await database.query(`SELECT id,email,"passwordHash","isActive" FROM "HRUser" WHERE lower(email)=lower($1) AND role='AUDIT_TEAM' LIMIT 1`, [email]);
  const fallback = '$2b$12$Jzi.AT7McnvHeZFI9cm8XOB6FX9Z9tW3xz2q2A/jU1B/bQEc5zE4a';
  if (!(await compare(password, String(user?.passwordHash || fallback))) || !user?.isActive) throw new PortalError(401, 'Invalid email or password, or account unavailable.');
  return { id: String(user.id), email: String(user.email) };
}

export async function startAuditSession(userId: string) {
  const jar = await cookies();
  const old = jar.get(COOKIE)?.value;
  if (old) await db.query(`DELETE FROM "AuditTeamSession" WHERE "tokenHash"=$1`, [digest(old)]);
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.query(`INSERT INTO "AuditTeamSession"("tokenHash","hrUserId","expiresAt") SELECT $1,id,$3 FROM "HRUser" WHERE id=$2 AND role='AUDIT_TEAM' AND "isActive"`, [digest(token), userId, expires]);
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires });
}

export async function currentAuditActor(): Promise<AuditActor> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const [user] = await db.query(`SELECT u.id,u.email,u.role FROM "AuditTeamSession" s JOIN "HRUser" u ON u.id=s."hrUserId" WHERE s."tokenHash"=$1 AND s."expiresAt">clock_timestamp() AND u."isActive" AND u.role='AUDIT_TEAM' LIMIT 1`, [digest(token)]);
    if (user) return { id: String(user.id), email: String(user.email), role: String(user.role) };
  }
  return currentHR();
}

export async function endAuditSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.query(`DELETE FROM "AuditTeamSession" WHERE "tokenHash"=$1`, [digest(token)]);
  jar.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}
