import { currentHR } from '@/app/lib/hr-auth';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';
import { setSupplierStatus, updateSupplier } from '@/app/lib/supplier-management';
import { sameOrigin } from '@/app/lib/portal-auth';

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const { id } = await context.params;
    return Response.json({ message: 'Supplier updated.', ...(await updateSupplier(id, await jsonBody(request), await currentHR())) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const { id } = await context.params;
    const body = await jsonBody(request) as { status?: unknown };
    if (body?.status !== 'ACTIVE' && body?.status !== 'INACTIVE') throw new PortalError(400, 'Choose a valid supplier status.');
    return Response.json({ message: body.status === 'ACTIVE' ? 'Supplier reactivated.' : 'Supplier deactivated.', ...(await setSupplierStatus(id, body.status, await currentHR())) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
