// GET /api/clinical/lab-threads?caseId=...
// Clinical LEAD/ADMIN oversight: see all lab-doctor threads for a case.

import { clinicalActor } from '../../../lib/clinical-auth';
import { failure, PortalError } from '../../../lib/portal-http';
import { listLabThreadsForClinical } from '../../../lib/lab-doctor-communication';

export async function GET(request: Request) {
  try {
    const actor = await clinicalActor();
    if (!['LEAD', 'ADMIN'].includes(actor.role)) {
      throw new PortalError(403, 'Clinical lead or admin access required to view lab communication threads.');
    }
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId') ?? '';
    if (!caseId) throw new PortalError(400, 'Provide a caseId to view lab threads.');
    const threads = await listLabThreadsForClinical(caseId);
    return Response.json(threads, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}
