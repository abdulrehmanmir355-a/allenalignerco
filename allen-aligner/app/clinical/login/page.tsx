import AccessForm from '../access-form';
import ClinicalEmployeeLogin from '../clinical-employee-login';
import '../review.css';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const query = await searchParams;
  if (query.account === 'reviewer') return <AccessForm />;
  return <ClinicalEmployeeLogin />;
}
