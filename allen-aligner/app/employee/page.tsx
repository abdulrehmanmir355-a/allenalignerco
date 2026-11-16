import { redirect } from 'next/navigation';
import { workActor } from '../lib/work-auth';
import EmployeeWorkspace from './employee-workspace';
export const dynamic='force-dynamic';
export default async function Page(){let actor;try{actor=await workActor();}catch{redirect('/employee/login');}if(['HR_ADMIN','HR_OFFICER'].includes(actor.role))redirect('/hr/performance');return <EmployeeWorkspace/>}
