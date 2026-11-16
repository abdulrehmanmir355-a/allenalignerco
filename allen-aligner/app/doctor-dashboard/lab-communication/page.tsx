import { requireDoctor } from '@/app/lib/portal-auth';
import { redirect } from 'next/navigation';
import DoctorLabCommunication from './doctor-lab-communication';
import '../../clinical/review.css';

export const dynamic = 'force-dynamic';

export default async function DoctorLabCommunicationPage() {
  const doctor = await requireDoctor().catch(() => null);
  if (!doctor) redirect('/doctor-login');

  return (
    <main className="clinical" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <DoctorLabCommunication doctorId={doctor.id} doctorName={doctor.fullName} />
    </main>
  );
}
