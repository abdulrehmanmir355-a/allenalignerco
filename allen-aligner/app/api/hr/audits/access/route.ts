import { currentHR } from '@/app/lib/hr-auth';
import { auditTeamAccessData, manageAuditTeamAccess } from '@/app/lib/audit-team-auth';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function GET() {
  try { return Response.json(await auditTeamAccessData(await currentHR()), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    return Response.json(await manageAuditTeamAccess(await jsonBody(request), await currentHR()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
