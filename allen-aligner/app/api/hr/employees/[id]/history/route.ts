import { currentHR } from '../../../../../lib/hr-auth';
import { employeeHistory } from '../../../../../lib/employee-service';
import { failure, PortalError } from '../../../../../lib/portal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const hr = await currentHR();
    if (!hr) throw new PortalError(401, 'HR login required.');
    const { id } = await context.params;
    return Response.json(await employeeHistory(id, hr), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
