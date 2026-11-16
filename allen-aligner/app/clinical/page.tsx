import Link from 'next/link';
import { clinicalActor } from '@/app/lib/clinical-auth';
import { PortalError } from '@/app/lib/portal-http';
import ClinicalDashboard from './review-client';
export default async function Page(){
 try{await clinicalActor();}catch(e){if(!(e instanceof PortalError))throw e;const message=e.message==='Sign in through the Employee Portal.'?'Sign in with an approved Internal Clinical Review account.':e.message;return <main className="clinical"><h1>Internal Clinical Review</h1><p>{message}</p><Link href="/clinical/login" style={{ display: "inline-flex", padding: "13px 24px", backgroundColor: "#087989", color: "#ffffff", borderRadius: 10, fontWeight: 700, textDecoration: "none", marginRight: 12 }}>Internal Login</Link>
<Link href="/clinical/register" style={{ display: "inline-flex", padding: "13px 24px", backgroundColor: "#ffffff", color: "#113847", border: "2px solid #113847", borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>Internal Registration</Link><p>Use your existing employee account. Clinical access must be granted by an authorized administrator.</p><p><Link href="/clinical/reviewer-activation">Activate an HR-invited external reviewer account</Link></p></main>;}
 return <ClinicalDashboard/>;
}
