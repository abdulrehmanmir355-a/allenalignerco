// GET /api/lab/doctors?q=... — Lab searches for a doctor by name / email / reg-no / ID.
// Requires a valid LabAccess Bearer token (any active case's token is accepted).
// The Bearer token identifies which case the lab is working on.

import { failure, PortalError } from '../../../lib/portal-http';
import { searchDoctorsForLab } from '../../../lib/lab-doctor-communication';
import { db } from '../../../lib/database';

/** Resolve any active LabAccess from a Bearer token (not tied to a specific case). */
async function authorizeAnyLab(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PortalError(401, 'Lab access required.');

  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const [access] = await db.query(
    `SELECT "caseId","tokenHash",label,"expiresAt" FROM "LabAccess"
     WHERE "tokenHash" = $1 AND "expiresAt" > now() LIMIT 1`,
    [tokenHash]
  ) as {caseId:string;tokenHash:string;label:string;expiresAt:Date}[];
  if (!access) throw new PortalError(403, 'Lab access denied or expired.');
  return access;
}

export async function GET(request: Request) {
  try {
    const access = await authorizeAnyLab(request);
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const results = await searchDoctorsForLab({ q }, access);
    return Response.json(results, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return failure(e);
  }
}
