import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import Invitations from './invitations';
export default async function Page(){const a=await currentHR();if(!a||!['HR_ADMIN','HR_OFFICER'].includes(a.role))redirect('/hr/login');return <Invitations/>;}
