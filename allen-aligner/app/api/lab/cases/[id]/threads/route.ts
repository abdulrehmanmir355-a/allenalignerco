// GET  /api/lab/cases/[id]/threads      — list all lab-doctor threads for this case
// POST /api/lab/cases/[id]/threads      — open a new thread (or reuse existing)

import { authorizeCaseLab as authorize } from '../../../../../lib/lab-auth';
import { failure, jsonBody } from '../../../../../lib/portal-http';
import {
  listLabThreads,
  openLabDoctorThread,
} from '../../../../../lib/lab-doctor-communication';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await authorize(request, id);
    const threads = await listLabThreads(access);
    return Response.json(threads, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await authorize(request, id);
    const body = await jsonBody(request);
    const result = await openLabDoctorThread(body, access);
    return Response.json(result, { status: result.isNew ? 201 : 200 });
  } catch (e) {
    return failure(e);
  }
}
