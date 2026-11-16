import ClinicalRegistrationForm from '../clinical-registration-form';
import { registrationFields } from '@/app/lib/clinical-registration/policy';
import '../review.css';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const query = await searchParams;
  const code = typeof query.code === 'string' && /^[a-f0-9]{64}$/.test(query.code) ? query.code : '';
  return <ClinicalRegistrationForm invitationCode={code} fields={registrationFields()} />;
}
