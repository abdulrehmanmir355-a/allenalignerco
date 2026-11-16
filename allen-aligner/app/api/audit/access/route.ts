import { activateAuditTeam, auditTeamCredentials, endAuditSession, startAuditSession } from '@/app/lib/audit-team-auth';
import { digest, sameOrigin, throttle } from '@/app/lib/portal-auth';
import { failure, jsonBody, PortalError } from '@/app/lib/portal-http';

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new PortalError(403, 'Invalid request origin.');
    const body = await jsonBody(request);
    if (body.action === 'logout') {
      await endAuditSession();
      return Response.json({ message: 'Signed out.' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!await throttle('audit-login:' + digest(email), 10)) throw new PortalError(429, 'Too many attempts. Try again later.');
    if (body.action === 'register') {
      const { action, ...input } = body; void action;
      return Response.json(await activateAuditTeam(input), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action !== 'login') throw new PortalError(400, 'Choose registration, login or sign out.');
    const { action, ...input } = body; void action;
    const account = await auditTeamCredentials(input);
    await startAuditSession(account.id);
    return Response.json({ message: 'Signed in.', redirectTo: '/quality/audits' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
