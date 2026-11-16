import { currentHR } from '@/app/lib/hr-auth';
import { capaList, createCapa } from '@/app/lib/capa-management';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';
import { sameOrigin } from '@/app/lib/portal-auth';

export async function GET() {
  try { return Response.json(await capaList(await currentHR()), { headers: { 'Cache-Control':'private, no-store' } }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403,'Invalid request origin.');
    return Response.json({ message:'CAPA created.', ...(await createCapa(await jsonBody(request),await currentHR())) }, { status:201,headers:{'Cache-Control':'no-store'} });
  } catch (error) { return failure(error); }
}
