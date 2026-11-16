import 'server-only';
import { db, type Database } from './database';
import { digest } from './portal-auth';
import { PortalError } from './portal-http';
export async function authorizeCaseLab(request: Request, id: string, database: Database = db) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PortalError(401, 'Lab access required.');
  const access = await database.labAccess.findUnique({ where: { caseId: id } });
  if (!access || access.tokenHash !== digest(token) || access.expiresAt <= new Date()) throw new PortalError(403, 'Lab access denied.');
  return access;
}
