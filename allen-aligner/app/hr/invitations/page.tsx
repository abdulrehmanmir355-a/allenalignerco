import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import InvitationManagement from './invitation-management';

export const dynamic = 'force-dynamic';
export default async function InvitationsPage() {
  const actor = await currentHR();
  if (!actor) redirect('/hr/login');
  if (!['HR_ADMIN', 'HR_OFFICER', 'HR_VIEWER'].includes(actor.role)) redirect('/hr/login');
  return <InvitationManagement />;
}
