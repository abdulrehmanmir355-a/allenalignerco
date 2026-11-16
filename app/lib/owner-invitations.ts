import "server-only";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import type { PoolClient } from "pg";
import { ownerDb } from "./owner-database";
import { ownerDigest } from "./owner-auth";
import { canIssueOwnerInvitation } from "./owner-role-policy";
import { PortalError } from "./portal-http";

export type HRIssuer = { id: string; email: string; role: string };
export function requireHRIssuer(actor: HRIssuer | null): asserts actor is HRIssuer {
  if (!actor) throw new PortalError(401, "HR sign-in required.");
  if (!actor.id || !canIssueOwnerInvitation(actor.role)) throw new PortalError(403, "An authorized HR account is required.");
}
async function audit(client: PoolClient, actorId: string, actorEmail: string, action: string, invitationId: string | null, detail: unknown) {
  await client.query('INSERT INTO "OwnerAudit"("actorId","actorEmail",action,"invitationId",detail) VALUES($1,$2,$3,$4,$5::jsonb)', [actorId, actorEmail, action, invitationId, JSON.stringify(detail)]);
}
export async function listOwnerInvitations() {
  const [invitations, events] = await Promise.all([
    ownerDb.query(`SELECT i.id,i."fullName",i.email,i."issuedByEmail",i."issuedAt",i."expiresAt",i."activatedAt",i."revokedAt",a."ownerId",
      CASE WHEN i."activatedAt" IS NOT NULL THEN 'USED' WHEN i."revokedAt" IS NOT NULL THEN 'REVOKED' WHEN i."expiresAt"<=clock_timestamp() THEN 'EXPIRED' ELSE 'PENDING' END AS state
      FROM "OwnerInvitation" i LEFT JOIN "OwnerAccount" a ON a.id=i."ownerId" ORDER BY i."issuedAt" DESC LIMIT 200`),
    ownerDb.query(`SELECT id,"actorEmail",action,"invitationId",detail,"createdAt" FROM "OwnerAudit" ORDER BY id DESC LIMIT 200`)
  ]);
  return { invitations, events };
}
export async function issueOwnerInvitation(actor: HRIssuer, fullName: string, email: string, reason: string) {
  requireHRIssuer(actor);
  const normalizedEmail = email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const tokenHash = ownerDigest(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const result = await ownerDb.transaction(async client => {
    const existing = await client.query('SELECT 1 FROM "OwnerAccount" WHERE lower(email)=lower($1) LIMIT 1', [normalizedEmail]);
    if (existing.rowCount) throw new PortalError(409, "An Owner account already exists for this email.");
    await client.query('UPDATE "OwnerInvitation" SET "revokedAt"=clock_timestamp() WHERE lower(email)=lower($1) AND "activatedAt" IS NULL AND "revokedAt" IS NULL', [normalizedEmail]);
    const inserted = await client.query(`INSERT INTO "OwnerInvitation"("fullName",email,"tokenHash","issuedById","issuedByEmail","expiresAt")
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [fullName.trim(), normalizedEmail, tokenHash, actor.id, actor.email, expiresAt]);
    const id = String(inserted.rows[0].id);
    await audit(client, actor.id, actor.email, "INVITATION_ISSUED", id, { recipientEmail: normalizedEmail, reason: reason.trim(), expiresAt });
    return { id, expiresAt };
  });
  return { ...result, token };
}
export async function revokeOwnerInvitation(actor: HRIssuer, id: string, reason: string) {
  requireHRIssuer(actor);
  return ownerDb.transaction(async client => {
    const updated = await client.query(`UPDATE "OwnerInvitation" SET "revokedAt"=clock_timestamp()
      WHERE id=$1 AND "activatedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() RETURNING email`, [id]);
    if (!updated.rowCount) throw new PortalError(409, "Invitation is no longer pending.");
    await audit(client, actor.id, actor.email, "INVITATION_REVOKED", id, { recipientEmail: updated.rows[0].email, reason: reason.trim() });
    return { success: true };
  });
}
export async function activateOwnerInvitation(input: { fullName: string; email: string; token: string; password: string; confirmPassword: string }) {
  if (input.password !== input.confirmPassword) throw new PortalError(400, "Passwords do not match.");
  const tokenHash = ownerDigest(input.token);
  const passwordHash = await hash(input.password, 12);
  return ownerDb.transaction(async client => {
    const found = await client.query(`SELECT id,"fullName",email FROM "OwnerInvitation" WHERE "tokenHash"=$1 AND lower(email)=lower($2)
      AND "activatedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() FOR UPDATE`, [tokenHash, input.email.trim()]);
    const invite = found.rows[0];
    if (!invite) throw new PortalError(400, "Invitation code is invalid, expired, or already used.");
    if (input.fullName.trim() !== invite.fullName) throw new PortalError(400, "Enter the name shown on the Owner invitation.");
    const ownerId = "AA-OWN-" + randomBytes(5).toString("hex").toUpperCase();
    const account = await client.query(`INSERT INTO "OwnerAccount"("ownerId","fullName",email,"passwordHash") VALUES($1,$2,$3,$4) RETURNING id`,
      [ownerId, invite.fullName, invite.email, passwordHash]);
    await client.query('UPDATE "OwnerInvitation" SET "activatedAt"=clock_timestamp(),"ownerId"=$2 WHERE id=$1', [invite.id, account.rows[0].id]);
    await audit(client, String(account.rows[0].id), invite.email, "OWNER_REGISTERED", String(invite.id), { ownerId });
    return { ownerId, message: "Owner registration completed. Save your Owner ID and sign in." };
  });
}
