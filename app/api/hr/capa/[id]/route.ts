import { currentHR } from '@/app/lib/hr-auth';
import { updateCapa } from '@/app/lib/capa-management';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function PATCH(request: Request, context: { params: Promise<{ id:string }> }) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403,'Invalid request origin.');
    const { id } = await context.params;
    return Response.json({ message:'CAPA updated.', ...(await updateCapa(id,await jsonBody(request),await currentHR())) }, { headers:{'Cache-Control':'no-store'} });
  } catch (error) { return failure(error); }
}
