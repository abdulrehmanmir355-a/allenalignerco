import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import { currentOwner } from '@/app/lib/owner-auth';
import ReviewClient from './review-client';
import '../../clinical/review.css';
import '../../inventory/inventory.css';

export const dynamic = 'force-dynamic';
export default async function DoctorVerificationPage() {
  const actor = await currentHR();
  if (!actor) redirect('/hr/login');
  const owner = await currentOwner();
  if (owner?.id === actor.id) redirect('/owner/command-center');
  if (!['HR_ADMIN','HR_OFFICER'].includes(actor.role)) return <main className="clinical" style={{ maxWidth: 1000, margin: 'auto', padding: 32 }}><h1>Authorized HR access required</h1><p>Professional verification decisions are restricted to HR Admin and HR Officer accounts.</p></main>;
  return <ReviewClient />;
}
