import { compare } from "bcryptjs";
import { z } from "zod";
import { jsonBody } from "../../lib/portal-http";
import { db } from "../../lib/database";
import { digest, sameOrigin, startSession, throttle } from "../../lib/portal-auth";
const schema = z.object({ email: z.email().max(254), password: z.string().min(1).max(72) });
export async function POST(request: Request) {
 if (!sameOrigin(request)) return Response.json({ message: "Invalid request origin." }, { status: 403 });
 try {
  if (Number(request.headers.get("content-length")) > 4096) return Response.json({ message: "Request too large." }, { status: 413 });
  const parsed = schema.safeParse(await jsonBody(request));
  if (!parsed.success) return Response.json({ message: "Invalid email or password." }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();
  if (!await throttle("login:global", 120) || !await throttle("login:" + digest(email))) return Response.json({ message: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const doctor = await db.doctor.findUnique({ where: { email } });
  const valid = await compare(parsed.data.password, doctor?.passwordHash ?? "$2b$12$abcdefghijklmnopqrstuuGJfDqHMTWvXlQxO8YLS2rkX3C6QbXb1q");
  if (!doctor || !valid) return Response.json({ message: "Invalid email or password." }, { status: 401 });
  if (!doctor.isVerified) return Response.json({ message: "Your account is awaiting professional verification." }, { status: 403 });
  if (!doctor.clinicId) await db.transaction(async tx => {
    await tx.query('SELECT id FROM "Doctor" WHERE id=$1 FOR UPDATE', [doctor.id]);
    const current = await tx.doctor.findUniqueOrThrow({ where: { id: doctor.id } });
    if (!current.clinicId) {
      const clinic = await tx.clinic.create({ data: { name: doctor.clinicName || doctor.fullName + " practice" } });
      await tx.doctor.update({ where: { id: doctor.id }, data: { clinicId: clinic.id } });
    }
  });
  await startSession(doctor.id);
  return Response.json({ success: true, message: "Signed in." }, { headers: { "Cache-Control": "no-store" } });
 } catch (error) { const e = error as { name?: string; code?: string; message?: string }; console.error("DOCTOR_LOGIN_ERROR", { name: e?.name, code: e?.code, detail: e?.message?.replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED]") }); return Response.json({ message: "Sign in unavailable. Please try again." }, { status: 503 }); }
}
