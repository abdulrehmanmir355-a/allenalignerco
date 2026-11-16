import { redirect } from 'next/navigation';
import { currentHR } from '../../lib/hr-auth';
import WorkDashboard from '../../employee/work-dashboard';
export const dynamic = 'force-dynamic';
export default async function Page(){let actor;try{actor=await currentHR();}catch{redirect('/hr/login');}if(!actor)redirect('/hr/login');if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))redirect('/employee');return <WorkDashboard view="hr"/>}
