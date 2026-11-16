import { z } from "zod";
import { randomBytes } from "node:crypto";
import { currentHR } from "@/app/lib/hr-auth";
import { db } from "@/app/lib/database";
import { canRevokeOwnerInvitation } from "@/app/lib/owner-role-policy";
import { ownerDb } from "@/app/lib/owner-database";
import { ownerDigest } from "@/app/lib/owner-auth";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.object({ ownerId: z.string().trim().regex(/^AA-OWN-[A-Fa-f0-9]{10}$/), reason: z.string().trim().min(5).max(500) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const actor = await currentHR();
    if (!actor || !canRevokeOwnerInvitation(actor.role)) throw new PortalError(403, "An HR Admin or Officer must approve this reset.");
    const hrAccount = await db.query(`SELECT id FROM "HRUser" WHERE id=$1 AND "isActive"=TRUE AND role IN ('HR_ADMIN','HR_OFFICER') LIMIT 1`, [actor.id]);
    if (!hrAccount.length) throw new PortalError(403, "An active HR Admin or Officer must approve this reset.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter a valid Owner ID and reason.");
    if (!await throttle("owner-password-reset:" + digest(actor.id), 10)) throw new PortalError(429, "Too many reset requests. Try again later.");
    const ownerId = parsed.data.ownerId.toUpperCase(), token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const created = await ownerDb.transaction(async client => {
      const rows = await client.query('SELECT id,email FROM "OwnerAccount" WHERE upper("ownerId")=$1 AND "isActive"=TRUE FOR UPDATE', [ownerId]);
      if (!rows.rowCount) throw new PortalError(404, "Active Owner account was not found.");
      await client.query('UPDATE "OwnerPasswordReset" SET "usedAt"=clock_timestamp() WHERE "ownerId"=$1 AND "usedAt" IS NULL', [rows.rows[0].id]);
      await client.query('INSERT INTO "OwnerPasswordReset"("ownerId","tokenHash","issuedById","issuedByEmail","expiresAt") VALUES($1,$2,$3,$4,$5)', [rows.rows[0].id, ownerDigest(token), actor.id, actor.email, expiresAt]);
      await client.query('INSERT INTO "OwnerAudit"("actorId","actorEmail",action,detail) VALUES($1,$2,$3,$4::jsonb)', [actor.id, actor.email, "OWNER_PASSWORD_RESET_ISSUED", JSON.stringify({ ownerId, reason: parsed.data.reason, expiresAt })]);
      return { email: rows.rows[0].email };
    });
    return Response.json({ token, email: created.email, expiresAt }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
