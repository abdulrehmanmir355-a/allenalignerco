import { z } from "zod";
import { randomBytes } from "node:crypto";
import { currentHR } from "@/app/lib/hr-auth";
import { canRevokeOwnerInvitation } from "@/app/lib/owner-role-policy";
import { db } from "@/app/lib/database";
import { digest, sameOrigin, throttle } from "@/app/lib/portal-auth";
import { failure, jsonBody, PortalError } from "@/app/lib/portal-http";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("request"), requestId: z.uuid(), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ kind: z.literal("complaint"), complaintId: z.uuid(), decision: z.enum(["approve", "close"]), doctorEmail: z.email().max(254).optional() }).strict()
]);
export async function GET() {
  try {
    const actor = await currentHR();
    if (!actor || !canRevokeOwnerInvitation(actor.role)) throw new PortalError(403, "Only HR Admins and Officers can review doctor reset requests.");
    const hrAccount = await db.query(`SELECT id FROM "HRUser" WHERE id=$1 AND "isActive"=TRUE AND role IN ('HR_ADMIN','HR_OFFICER') LIMIT 1`, [actor.id]);
    if (!hrAccount.length) throw new PortalError(403, "An active HR Admin or Officer must review these requests.");
    const [requests, complaints] = await Promise.all([
      db.query(`SELECT id,"doctorName",email,phone,reason,status,"createdAt" FROM "DoctorPasswordResetRequest" ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,"createdAt" DESC LIMIT 200`),
      db.query(`SELECT id,"fullName","contactEmail",phone,complaint,status,"createdAt" FROM "DoctorPasswordRecoveryComplaint" ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END,"createdAt" DESC LIMIT 200`)
    ]);
    return Response.json({ requests, complaints }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, "Invalid request origin.");
    const actor = await currentHR();
    if (!actor || !canRevokeOwnerInvitation(actor.role)) throw new PortalError(403, "Only HR Admins and Officers can review doctor reset requests.");
    const hrAccount = await db.query(`SELECT id FROM "HRUser" WHERE id=$1 AND "isActive"=TRUE AND role IN ('HR_ADMIN','HR_OFFICER') LIMIT 1`, [actor.id]);
    if (!hrAccount.length) throw new PortalError(403, "An active HR Admin or Officer must review these requests.");
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new PortalError(400, "Choose a valid reset request and decision.");
    if (!await throttle("doctor-reset-review:" + digest(actor.id), 30)) throw new PortalError(429, "Too many review actions. Try again later.");
    if (parsed.data.kind === "complaint") {
      const complaintId = parsed.data.complaintId;
      if (parsed.data.decision === "close") {
        const closed = await db.query(`UPDATE "DoctorPasswordRecoveryComplaint" SET status='CLOSED',"reviewedById"=$2,"reviewedByEmail"=$3,"reviewedAt"=clock_timestamp() WHERE id=$1 AND status='PENDING' RETURNING id`, [complaintId, actor.id, actor.email]);
        if (!closed.length) throw new PortalError(409, "This complaint has already been reviewed.");
        return Response.json({ success: true, message: "Complaint closed." }, { headers: { "Cache-Control": "no-store" } });
      }
      const doctorEmail = parsed.data.doctorEmail;
      if (!doctorEmail) throw new PortalError(400, "Enter the verified Doctor account email after confirming the complaint.");
      const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const approved = await db.transaction(async tx => {
        const complaintRows = await tx.query(`SELECT id,"fullName","contactEmail",complaint FROM "DoctorPasswordRecoveryComplaint" WHERE id=$1 AND status='PENDING' FOR UPDATE`, [complaintId]);
        if (!complaintRows.length) throw new PortalError(409, "This complaint has already been reviewed.");
        const doctors = await tx.query(`SELECT id,"fullName",email,phone FROM "Doctor" WHERE lower(email)=lower($1) AND "isVerified"=TRUE FOR UPDATE`, [doctorEmail]);
        if (!doctors.length) throw new PortalError(404, "No verified doctor account matches that email.");
        const doctor = doctors[0], complaint = complaintRows[0];
        const requestRows = await tx.query(`INSERT INTO "DoctorPasswordResetRequest"("doctorId","doctorName",email,phone,reason,status,"reviewedById","reviewedByEmail","reviewedAt")
          VALUES($1,$2,$3,$4,$5,'APPROVED',$6,$7,clock_timestamp()) RETURNING id`, [doctor.id, doctor.fullName, doctor.email, doctor.phone ?? "", `Verified complaint: ${complaint.id}`, actor.id, actor.email]);
        await tx.query(`UPDATE "DoctorPasswordReset" SET "usedAt"=clock_timestamp() WHERE "doctorId"=$1 AND "usedAt" IS NULL`, [doctor.id]);
        await tx.query(`INSERT INTO "DoctorPasswordReset"("doctorId","tokenHash","requestId","expiresAt") VALUES($1,$2,$3,$4)`, [doctor.id, digest(token), requestRows[0].id, expiresAt]);
        await tx.query(`UPDATE "DoctorPasswordRecoveryComplaint" SET status='APPROVED',"doctorId"=$2,"reviewedById"=$3,"reviewedByEmail"=$4,"reviewedAt"=clock_timestamp() WHERE id=$1`, [complaint.id, doctor.id, actor.id, actor.email]);
        return { email: doctor.email };
      });
      return Response.json({ success: true, token, email: approved.email, expiresAt, message: "Identity verified. Share the one-time reset code privately." }, { headers: { "Cache-Control": "no-store" } });
    }
    const requestId = parsed.data.requestId;
    if (parsed.data.decision === "reject") {
      const rows = await db.query(`UPDATE "DoctorPasswordResetRequest" SET status='REJECTED',"reviewedById"=$2,"reviewedByEmail"=$3,"reviewedAt"=clock_timestamp() WHERE id=$1 AND status='PENDING' RETURNING id`, [requestId, actor.id, actor.email]);
      if (!rows.length) throw new PortalError(409, "This request has already been reviewed.");
      return Response.json({ success: true, message: "Request rejected." }, { headers: { "Cache-Control": "no-store" } });
    }
    const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const result = await db.transaction(async tx => {
      const rows = await tx.query(`SELECT id,"doctorId",email FROM "DoctorPasswordResetRequest" WHERE id=$1 AND status='PENDING' FOR UPDATE`, [requestId]) as { id: string; doctorId: string; email: string }[];
      if (!rows.length) throw new PortalError(409, "This request has already been reviewed.");
      const item = rows[0];
      const doctors = await tx.query(`SELECT id FROM "Doctor" WHERE id=$1 AND "isVerified"=TRUE FOR UPDATE`, [item.doctorId]);
      if (!doctors.length) throw new PortalError(409, "Doctor account is no longer verified.");
      await tx.query(`UPDATE "DoctorPasswordResetRequest" SET status='APPROVED',"reviewedById"=$2,"reviewedByEmail"=$3,"reviewedAt"=clock_timestamp() WHERE id=$1`, [item.id, actor.id, actor.email]);
      await tx.query(`UPDATE "DoctorPasswordReset" SET "usedAt"=clock_timestamp() WHERE "doctorId"=$1 AND "usedAt" IS NULL`, [item.doctorId]);
      await tx.query(`INSERT INTO "DoctorPasswordReset"("doctorId","tokenHash","requestId","expiresAt") VALUES($1,$2,$3,$4)`, [item.doctorId, digest(token), item.id, expiresAt]);
      return { email: item.email };
    });
    return Response.json({ success: true, token, email: result.email, expiresAt, message: "Approved. Share the one-time code with the doctor through a verified private channel." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
