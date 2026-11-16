import { z } from "zod";
import { hash } from "bcryptjs";
import { ownerDb } from "@/app/lib/owner-database";
import { ownerDigest } from "@/app/lib/owner-auth";
import { sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.object({ ownerId: z.string().trim().regex(/^AA-OWN-[A-Fa-f0-9]{10}$/), token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(72), confirmPassword: z.string().max(72) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) throw new PortalError(400, "Enter the Owner ID, reset code, and a password of at least 12 characters.");
    if (parsed.data.password !== parsed.data.confirmPassword) throw new PortalError(400, "Passwords do not match.");
    const ownerId = parsed.data.ownerId.toUpperCase();
    if (!await throttle("owner-reset-complete:" + ownerDigest(ownerId), 8)) throw new PortalError(429, "Too many attempts. Try again later.");
    const passwordHash = await hash(parsed.data.password, 12), tokenHash = ownerDigest(parsed.data.token);
    await ownerDb.transaction(async client => {
      const rows = await client.query(`SELECT r.id,r."ownerId" FROM "OwnerPasswordReset" r JOIN "OwnerAccount" a ON a.id=r."ownerId"
        WHERE r."tokenHash"=$1 AND upper(a."ownerId")=$2 AND r."usedAt" IS NULL AND r."expiresAt">clock_timestamp() AND a."isActive"=TRUE FOR UPDATE OF r,a`, [tokenHash, ownerId]);
      if (!rows.rowCount) throw new PortalError(400, "Reset code is invalid, expired, or already used.");
      await client.query('UPDATE "OwnerAccount" SET "passwordHash"=$2 WHERE id=$1', [rows.rows[0].ownerId, passwordHash]);
      await client.query('UPDATE "OwnerPasswordReset" SET "usedAt"=clock_timestamp() WHERE "ownerId"=$1 AND "usedAt" IS NULL', [rows.rows[0].ownerId]);
      await client.query('DELETE FROM "OwnerSession" WHERE "ownerId"=$1', [rows.rows[0].ownerId]);
      await client.query('INSERT INTO "OwnerAudit"("actorId","actorEmail",action,detail) SELECT a.id,a.email,$2,$3::jsonb FROM "OwnerAccount" a WHERE a.id=$1', [rows.rows[0].ownerId, "OWNER_PASSWORD_RESET_COMPLETED", JSON.stringify({ resetId: rows.rows[0].id })]);
    });
    return Response.json({ success: true, message: "Password reset. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
