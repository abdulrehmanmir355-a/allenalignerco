import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {productionDashboard} from '@/app/lib/production-management';
import ProductionManager from './production-manager';
import '../clinical/review.css';

export const dynamic='force-dynamic';

export default async function ProductionPage(){
 const actor=await currentHR();
 if(!actor)redirect('/hr/login');
 if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))return <main className="clinical"><h1>Production Management access restricted</h1><p>HR Admin or HR Officer permission is required to manage production access.</p><Link href="/">Return home</Link></main>;
 const data=await productionDashboard(actor);
 return <main className="clinical" style={{maxWidth:1320,margin:'0 auto',padding:'32px 24px'}}>
  <header><div><span className="clinical-eyebrow">OPERATIONS · CASE PRODUCTION</span><h1>Production Management</h1><p>Monitor approved cases, production, dispatch and completion. Issue case-scoped lab access; the secret is shown only once.</p></div><nav aria-label="Production workspaces"><Link className="button secondary" href="/owner/command-center">Owner Command Center</Link><Link className="button secondary" href="/lab">Laboratory case workspace</Link></nav></header>
  <ProductionManager records={data.cases} metrics={data.metrics} activity={data.activity}/>
 </main>;
}
