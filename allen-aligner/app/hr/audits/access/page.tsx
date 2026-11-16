import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import HRWorkspace from '@/app/components/hr-workspace';
import AuditAccessPanel from '@/app/hr/audits/audit-access-panel';
import '../../../clinical/review.css';

export const dynamic='force-dynamic';
export default async function AuditTeamAccessPage(){const actor=await currentHR();if(!actor)redirect('/hr/login');if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))return <main className="clinical"><h1>Audit team access</h1><p>HR Admin or HR Officer permission is required.</p></main>;return <HRWorkspace><AuditAccessPanel/></HRWorkspace>;}
