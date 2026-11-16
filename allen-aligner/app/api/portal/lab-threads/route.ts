// GET /api/portal/lab-threads — Doctor sees all lab-doctor threads (all cases)

import { apiDoctor } from '../../../lib/portal-http';
import { failure } from '../../../lib/portal-http';
import { db } from '../../../lib/database';
import { labDoctorCommReady } from '../../../lib/lab-doctor-communication';

export async function GET(request: Request) {
  try {
    const doctor = await apiDoctor(request);
    if (!(await labDoctorCommReady())) {
      return Response.json([], { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const rows = await db.query(
      `SELECT t.id, t."caseId", t.subject, t.status,
              la.label AS "labLabel",
              (SELECT m.text FROM "LabDoctorMessage" m WHERE m."threadId"=t.id
               ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",
              (SELECT m."createdAt"::text FROM "LabDoctorMessage" m WHERE m."threadId"=t.id
               ORDER BY m."createdAt" DESC LIMIT 1) AS "lastAt",
              (SELECT count(*)::int FROM "LabDoctorMessage" m
               WHERE m."threadId"=t.id AND "senderRole"='LAB' AND NOT "readByDoctor") AS "unreadByDoctor",
              t."createdAt"
       FROM "LabDoctorThread" t
       LEFT JOIN "LabAccess" la ON la."caseId" = t."caseId"
       WHERE t."doctorId" = $1
       ORDER BY t."createdAt" DESC LIMIT 100`,
      [doctor.id]
    ) as {id:string;caseId:string;subject:string;status:string;labLabel:string|null;lastMessage:string|null;lastAt:string|null;unreadByDoctor:number;createdAt:Date}[];

    return Response.json(rows.map(r => ({
      id: String(r.id),
      caseId: String(r.caseId),
      subject: String(r.subject),
      status: String(r.status),
      labLabel: r.labLabel ? String(r.labLabel) : 'Lab',
      lastMessage: r.lastMessage ? String(r.lastMessage) : null,
      lastAt: r.lastAt ? String(r.lastAt) : null,
      unreadByDoctor: Number(r.unreadByDoctor),
      createdAt: new Date(r.createdAt).toISOString(),
    })), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}
