import { currentHR } from '../../../lib/hr-auth';
import { createEmployee, employeeList } from '../../../lib/employee-service';
import { sameOrigin } from '../../../lib/portal-auth';
import { failure, jsonBody, PortalError } from '../../../lib/portal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const hr = await currentHR();
    if (!hr) throw new PortalError(401, 'HR login required.');
    const search = new URL(request.url).searchParams;
    const result = await employeeList(hr, {
      q: search.get('q') ?? '', status: search.get('status') ?? '', page: Number(search.get('page') ?? 1),
    });
    return Response.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const hr = await currentHR();
    if (!hr) throw new PortalError(401, 'HR login required.');
    const result = await createEmployee(await jsonBody(request), hr);
    return Response.json(result, { status: result.replayed ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
