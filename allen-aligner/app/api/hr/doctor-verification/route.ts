import { currentHR } from '@/app/lib/hr-auth';
import { currentOwner } from '@/app/lib/owner-auth';
import { sameOrigin } from '@/app/lib/portal-auth';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';
import { db } from '@/app/lib/database';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
async function authorizedHRAdmin() {
  const actor = await currentHR();
  if (!actor) throw new PortalError(401, 'Sign in with an HR account to review doctor credentials.');
  const owner = await currentOwner();
  if (owner?.id === actor.id || !['HR_ADMIN','HR_OFFICER'].includes(actor.role)) throw new PortalError(403, 'Doctor verification is available to authorized HR accounts only.');
  return actor;
}

export async function GET() {
  try {
    await authorizedHRAdmin();
    const doctors = await db.query(`SELECT d.id,d."fullName",d.email,d."clinicName",d.phone,d."registrationNumber",d."registrationAuthority",d."createdAt",COALESCE(a.action,'PENDING') AS status,COALESCE(a."evidenceMethod",'') AS "lastEvidenceMethod",COALESCE(a.note,'') AS "lastDecisionNote",a."occurredAt" AS "lastReviewedAt" FROM "Doctor" d LEFT JOIN LATERAL(SELECT action,"evidenceMethod",note,"occurredAt" FROM "DoctorVerificationAudit" WHERE "doctorId"=d.id ORDER BY "occurredAt" DESC,id DESC LIMIT 1)a ON TRUE WHERE d."isVerified"=FALSE ORDER BY d."createdAt" DESC LIMIT 200`);
    return Response.json({ doctors, total: doctors.length }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const actor = await authorizedHRAdmin();
    const input = z.object({ doctorId: z.uuid(), decision: z.enum(['VERIFY','REJECT']), evidenceMethod: z.string().trim().min(3).max(100), note: z.string().trim().min(5).max(2000) }).strict().safeParse(await jsonBody(request));
    if (!input.success) throw new PortalError(400, input.error.issues[0]?.message || 'Check the verification decision.');
    const result = await db.transaction(async tx => {
      const [doctor] = await tx.query('SELECT id,"isVerified" FROM "Doctor" WHERE id=$1 FOR UPDATE', [input.data.doctorId]);
      if (!doctor) throw new PortalError(404, 'Doctor registration not found.');
      if (doctor.isVerified) throw new PortalError(409, 'This doctor has already been verified.');
      const action = input.data.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED';
      if (action === 'VERIFIED') await tx.query('UPDATE "Doctor" SET "isVerified"=TRUE,"updatedAt"=NOW() WHERE id=$1', [doctor.id]);
      await tx.query(`INSERT INTO "DoctorVerificationAudit"("actorOwnerId","actorHRId","doctorId",action,"evidenceMethod",note) VALUES(NULL,$1,$2,$3,$4,$5)`, [actor.id, doctor.id, action, input.data.evidenceMethod, input.data.note]);
      return action;
    });
    return Response.json({ success: true, status: result, message: result === 'VERIFIED' ? 'Doctor verified. They can now sign in and register a clinic or accept an invitation.' : 'Rejection recorded with a reason. The account remains inactive.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
