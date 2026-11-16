import { z } from "zod";
import { db } from "@/app/lib/database";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.object({ fullName: z.string().trim().min(2).max(150), email: z.email().max(254), phone: z.string().trim().min(7).max(30) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter your registered name, email, and phone.");
    const email = parsed.data.email.trim().toLowerCase(), phone = parsed.data.phone.replace(/\D/g, "");
    if (!await throttle("doctor-reset-request:" + digest(email), 3)) throw new PortalError(429, "A request was recently submitted. Contact HR if you still need help.");
    const doctors = await db.query(`SELECT id,"fullName",email,phone FROM "Doctor" WHERE lower(email)=$1 AND "isVerified"=TRUE LIMIT 1`, [email]) as { id: string; fullName: string; email: string; phone: string | null }[];
    const doctor = doctors[0];
    if (doctor && doctor.fullName.trim().toLowerCase() === parsed.data.fullName.trim().toLowerCase() && (doctor.phone ?? "").replace(/\D/g, "") === phone) {
      await db.query(`INSERT INTO "DoctorPasswordResetRequest"("doctorId","doctorName",email,phone,reason)
        SELECT $1,$2,$3,$4,'Password reset requested' WHERE NOT EXISTS (SELECT 1 FROM "DoctorPasswordResetRequest" WHERE "doctorId"=$1 AND status='PENDING')`, [doctor.id, doctor.fullName, doctor.email, parsed.data.phone.trim()]);
    }
    return Response.json({ success: true, message: "If the details match a verified doctor account, the request has been sent to HR for review." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
