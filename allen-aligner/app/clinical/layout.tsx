import type { ReactNode } from 'react';
import { clinicalActor } from '@/app/lib/clinical-auth';
import ClinicalWorkspaceNav from './clinical-workspace-nav';
import './review.css';

export default async function ClinicalLayout({ children }: { children: ReactNode }) {
  const actor = await clinicalActor().catch(() => null);
  return <>
    {actor && <ClinicalWorkspaceNav actor={{ name: actor.name, role: actor.role, employeeId: actor.employeeId }} />}
    {children}
  </>;
}
