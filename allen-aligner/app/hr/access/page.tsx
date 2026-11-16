import { redirect } from 'next/navigation';
import HRWorkspace from '@/app/components/hr-workspace';
import { currentHR } from '@/app/lib/hr-auth';
import AccessHub from './access-hub';
import '../../clinical/review.css';

export const dynamic = 'force-dynamic';

export default async function HRAccessPage() {
  const actor = await currentHR();
  if (!actor) redirect('/hr/login');
  if (!['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(actor.role)) redirect('/hr/login');

  return <HRWorkspace><AccessHub role={actor.role} /></HRWorkspace>;
}
