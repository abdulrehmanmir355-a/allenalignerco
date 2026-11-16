import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/app/lib/database";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.object({ email: z.email().max(254), token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(72), confirmPassword: z.string().max(72) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) throw new PortalError(400, "Enter your account email, HR code, and a password of at least 12 characters.");
    if (parsed.data.password !== parsed.data.confirmPassword) throw new PortalError(400, "Passwords do not match.");
    const email = parsed.data.email.trim().toLowerCase();
    if (!await throttle("doctor-reset-complete:" + digest(email), 8)) throw new PortalError(429, "Too many attempts. Try again later.");
    const passwordHash = await hash(parsed.data.password, 12), tokenHash = digest(parsed.data.token);
    await db.transaction(async tx => {
      const rows = await tx.query(`SELECT r.id,r."doctorId" FROM "DoctorPasswordReset" r JOIN "Doctor" d ON d.id=r."doctorId"
        WHERE r."tokenHash"=$1 AND lower(d.email)=$2 AND r."usedAt" IS NULL AND r."expiresAt">clock_timestamp() AND d."isVerified"=TRUE FOR UPDATE OF r,d`, [tokenHash, email]) as { id: string; doctorId: string }[];
      if (!rows.length) throw new PortalError(400, "Reset code is invalid, expired, or already used.");
      await tx.query('UPDATE "Doctor" SET "passwordHash"=$2,"updatedAt"=clock_timestamp() WHERE id=$1', [rows[0].doctorId, passwordHash]);
      await tx.query('UPDATE "DoctorPasswordReset" SET "usedAt"=clock_timestamp() WHERE "doctorId"=$1 AND "usedAt" IS NULL', [rows[0].doctorId]);
      await tx.query('DELETE FROM "DoctorSession" WHERE "doctorId"=$1', [rows[0].doctorId]);
    });
    return Response.json({ success: true, message: "Password reset. Sign in with your new password." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
