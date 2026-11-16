import { redirect } from 'next/navigation';
import { workActor } from '@/app/lib/work-auth';
import Invitations from '@/app/hr/employee-access/invitations';
export default async function Page(){const a=await workActor().catch(()=>null);if(!a?.employeeId)redirect('/employee/login');return <Invitations/>;}
