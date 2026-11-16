import { currentHR } from '@/app/lib/hr-auth';
import { activateEmployee, invitationAdmin, invitationData, manageInvitation, registrationInput } from '@/app/lib/registration-invitations';
import { digest, sameOrigin, throttle } from '@/app/lib/portal-auth';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await currentHR(); invitationAdmin(actor);
    return Response.json(await invitationData(actor, Number(new URL(request.url).searchParams.get('page') || 1)), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const body = await jsonBody(request);
    if (body && typeof body === 'object' && body.action === 'register') {
      const input = registrationInput.safeParse(body);
      if (!input.success) throw new PortalError(400, 'Check your employee ID, invitation code and password details.');
      if (!await throttle('employee-register:global', 50) || !await throttle('employee-register:' + digest(input.data.employeeId), 10)) {
        throw new PortalError(429, 'Too many attempts. Try again later.');
      }
      return Response.json(await activateEmployee(input.data), { status: 201, headers: { 'Cache-Control': 'no-store' } });
    }
    const actor = await currentHR(); invitationAdmin(actor);
    return Response.json(await manageInvitation(body, actor), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
