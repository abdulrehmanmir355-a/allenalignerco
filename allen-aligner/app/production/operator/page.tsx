import {redirect} from 'next/navigation';
import {workSessionActor} from '@/app/lib/work-auth';
import {productionOperatorDashboard} from '@/app/lib/manufacturing-orders';
import OperatorScreen from './operator-screen';
import '../../clinical/review.css';
import '../manufacturing.css';

export const dynamic='force-dynamic';

export default async function ProductionOperatorPage(){
 let actor;
 try{actor=await workSessionActor();}catch{redirect('/employee/login?next=%2Fproduction%2Foperator');}
 if(actor.role!=='PRODUCTION_OPERATOR'||!actor.employeeId||actor.mustChangePassword)redirect('/employee');
 const data=await productionOperatorDashboard(actor);
 return <main className="clinical manufacturing-operator" style={{maxWidth:1180,margin:'0 auto',padding:'32px 24px'}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:20,flexWrap:'wrap'}}><div><span className="clinical-eyebrow">ALLEN ALIGNER · PRODUCTION FLOOR</span><h1>Operator screen</h1><p>{data.operatorName} · Record work against the approved production queue.</p></div><a className="button secondary" href="/employee">Employee workspace</a></header>
  <OperatorScreen operatorName={data.operatorName} orders={data.orders}/>
 </main>;
}
