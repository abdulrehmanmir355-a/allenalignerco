import 'server-only';
import type { Database } from './database';
import { audit } from './hr-management';
import type { ActivityDetail } from './case-lifecycle';

export async function recordCaseActivity(tx: Database, caseId: string, clinicId: string, label: string, detail: Omit<ActivityDetail, 'type'>) {
  // Both writes share the caller's transaction; createdAt comes from PostgreSQL.
  const [clock] = await tx.query('SELECT clock_timestamp() AS at');
  const event = await tx.caseEvent.create({ data: { caseId, label, createdAt: clock.at } });
  await audit(tx, detail.actor.id, clinicId, JSON.stringify({ type: 'case_activity', ...detail }), event.id);
}
