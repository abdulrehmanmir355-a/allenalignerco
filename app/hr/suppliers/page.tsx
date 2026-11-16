import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import { listSuppliers } from '@/app/lib/supplier-management';
import HRWorkspace from '@/app/components/hr-workspace';
import SupplierManager from './supplier-manager';
import type { SupplierEvent, SupplierRecord } from './types';
import '../../clinical/review.css';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const actor = await currentHR();
  if (!actor) redirect('/hr/login');
  const data = await listSuppliers(actor);
  return <HRWorkspace><main className="clinical" style={{ maxWidth: 1200 }}>
    <header><span className="clinical-eyebrow">HR · OPERATIONS</span><h1>Supplier management</h1><p>Maintain supplier contacts and service terms. Deactivated suppliers stay in the directory and audit history.</p></header>
    <SupplierManager suppliers={data.suppliers as SupplierRecord[]} events={data.events as SupplierEvent[]} canWrite={actor.role === 'HR_ADMIN' || actor.role === 'HR_OFFICER'} />
  </main></HRWorkspace>;
}
