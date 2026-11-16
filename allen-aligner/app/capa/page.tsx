import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import { capaList } from '@/app/lib/capa-management';
import CapaManager from '@/app/hr/capa/capa-manager';
import type { Capa, CapaAudit } from '@/app/hr/capa/types';
import '../clinical/review.css';

export const dynamic = 'force-dynamic';

export default async function CapaPage() {
  const actor = await currentHR();
  if (!actor) redirect('/hr/login');
  const data = await capaList(actor);

  return <main className="clinical" style={{ maxWidth: 1250, margin: '0 auto', padding: '32px 24px' }}>
    <header>
      <span className="clinical-eyebrow">QUALITY · CONTINUOUS IMPROVEMENT</span>
      <h1>CAPA management</h1>
      <p>Record nonconformances, investigate causes, track corrective and preventive actions, then verify effectiveness before closure.</p>
    </header>
    <CapaManager records={data.records as Capa[]} audit={data.audit as CapaAudit[]} canWrite={data.canWrite} />
  </main>;
}
