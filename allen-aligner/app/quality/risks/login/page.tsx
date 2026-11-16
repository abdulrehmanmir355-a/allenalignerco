import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
export const dynamic='force-dynamic';
export default async function Login(){
 const actor=await currentHR().catch(()=>null);
 if(actor&&['HR_ADMIN','HR_OFFICER'].includes(actor.role))redirect('/quality/risks');
 if(actor)return <main className="clinical" style={{maxWidth:720,margin:'60px auto',padding:32}}><h1>Risk Management access restricted</h1><p>Your HR account does not have permission to manage the risk register. Ask an HR Admin to review your access.</p><a href="/hr/offboarding/dashboard">Return to HR workspace</a></main>;
 redirect('/hr/login?next=%2Fquality%2Frisks');
}
