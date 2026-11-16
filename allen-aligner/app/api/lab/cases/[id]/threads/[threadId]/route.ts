// GET  /api/lab/cases/[id]/threads/[threadId]   — read thread + messages
// POST /api/lab/cases/[id]/threads/[threadId]   — send a message into the thread

import { authorizeCaseLab as authorize } from '../../../../../../lib/lab-auth';
import { failure, jsonBody } from '../../../../../../lib/portal-http';
import {
  getLabDoctorThread,
  sendLabMessage,
} from '../../../../../../lib/lab-doctor-communication';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  try {
    const { id, threadId } = await params;
    const access = await authorize(request, id);
    const detail = await getLabDoctorThread(threadId, access);
    return Response.json(detail, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  try {
    const { id, threadId } = await params;
    const access = await authorize(request, id);
    const body = await jsonBody(request);
    const result = await sendLabMessage(threadId, body, access);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return failure(e);
  }
}
