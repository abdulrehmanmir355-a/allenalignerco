import { z } from "zod";
import { db } from "@/app/lib/database";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.object({ fullName: z.string().trim().min(2).max(150), contactEmail: z.email().max(254), phone: z.string().trim().max(30).optional().default(""), complaint: z.string().trim().min(10).max(2000) }).strict();
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Enter your name, a contact email, and a short description of the problem.");
    const email = parsed.data.contactEmail.trim().toLowerCase();
    if (!await throttle("doctor-recovery-complaint:" + digest(email), 3)) throw new PortalError(429, "A complaint was recently submitted. Please wait or contact HR directly.");
    await db.query(`INSERT INTO "DoctorPasswordRecoveryComplaint"("fullName","contactEmail",phone,complaint) VALUES($1,$2,$3,$4)`, [parsed.data.fullName.trim(), email, parsed.data.phone.trim() || null, parsed.data.complaint.trim()]);
    return Response.json({ success: true, message: "Your complaint was sent for HR identity review." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
