import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { workSessionActor } from '@/app/lib/work-auth';

export default async function ClinicalRegistrationLayout({ children }: { children: ReactNode }) {
  const activeAccount = await workSessionActor().catch(() => null);
  if (activeAccount) redirect('/clinical');
  return children;
}
