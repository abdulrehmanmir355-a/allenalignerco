// GET  /api/portal/lab-threads/[threadId]   — Doctor reads a thread
// POST /api/portal/lab-threads/[threadId]   — Doctor sends a reply

import { apiDoctor, failure, jsonBody } from '../../../../lib/portal-http';
import {
  getDoctorLabThread,
  sendDoctorReply,
} from '../../../../lib/lab-doctor-communication';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const doctor = await apiDoctor(request);
    const { threadId } = await params;
    const detail = await getDoctorLabThread(threadId, doctor.id);
    return Response.json(detail, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const doctor = await apiDoctor(request);
    const { threadId } = await params;
    const body = await jsonBody(request);
    const result = await sendDoctorReply(threadId, body, {
      id: doctor.id,
      fullName: doctor.fullName,
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return failure(e);
  }
}
