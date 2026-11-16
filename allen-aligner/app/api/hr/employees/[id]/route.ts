import { currentHR } from '../../../../lib/hr-auth';
import { changeEmployeeStatus, employeeDetail, updateEmployee } from '../../../../lib/employee-service';
import { sameOrigin } from '../../../../lib/portal-auth';
import { failure, jsonBody, PortalError } from '../../../../lib/portal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const hr = await currentHR();
    if (!hr) throw new PortalError(401, 'HR login required.');
    const { id } = await context.params;
    return Response.json({ employee: await employeeDetail(id, hr) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const hr = await currentHR();
    if (!hr) throw new PortalError(401, 'HR login required.');
    const { id } = await context.params;
    const body = await jsonBody(request);
    const statusOnly = body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 && 'status' in body;
    const employee = statusOnly ? await changeEmployeeStatus(id, body, hr) : await updateEmployee(id, body, hr);
    return Response.json({ employee }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
