import {redirect} from 'next/navigation';
import Link from 'next/link';
import {riskAccess} from './actions';
import {readRisks} from './store';
import Register from './register';
import '../../clinical/review.css';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function RiskPage(){
 try{await riskAccess();}catch{redirect('/quality/risks/login');}
 const risks=await readRisks();
 return <main className="clinical" style={{maxWidth:1280,margin:'0 auto',padding:'32px 24px'}}><header><div><span className="clinical-eyebrow">QUALITY · HR WORKSPACE</span><h1>Risk management</h1><p>Identify hazards, assign controls, and document risk reviews. Access is managed through approved HR accounts.</p></div><nav><form method="post" action="/api/hr/logout"><button type="submit">Sign out</button></form><Link href="/quality">Quality dashboard</Link><Link href="/capa">CAPA register</Link></nav></header><Register initial={risks}/></main>;
}
