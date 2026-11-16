import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {productionDashboard} from '@/app/lib/production-management';
import {manufacturingOrderDashboard} from '@/app/lib/manufacturing-orders';
import ProductionManager from './production-manager';
import ManufacturingOrders from './manufacturing-orders';
import '../clinical/review.css';
import './manufacturing.css';

export const dynamic='force-dynamic';

export default async function ProductionPage(){
 const actor=await currentHR();
 if(!actor)redirect('/hr/login');
 if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))return <main className="clinical"><h1>Production Management access restricted</h1><p>HR Admin or HR Officer permission is required to manage production access.</p><Link href="/">Return home</Link></main>;
 const [data,manufacturing]=await Promise.all([productionDashboard(actor),manufacturingOrderDashboard(actor)]);
 const activeOrders=manufacturing.orders.filter(order=>order.status!=='SUPERSEDED');
 const casesById=new Map(data.cases.map(item=>[item.id,item]));
 const approvedPlans=data.cases.filter(item=>item.planDecision==='APPROVED'&&item.clinicalReviewStatus==='APPROVED'&&item.approvedAt).length;
 const productionOrders=activeOrders.filter(order=>['QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status));
 const releasedOrders=activeOrders.filter(order=>order.status==='RELEASED').length;
 const qualityHolds=activeOrders.filter(order=>order.status==='QUALITY_HOLD').length;
 const dispatchReadyCaseIds=activeOrders.filter(order=>{
  const record=casesById.get(order.caseId);
  return order.status==='RELEASED'&&!!record&&record.status==='IN_PRODUCTION'&&record.planDecision==='APPROVED'&&record.clinicalReviewStatus==='APPROVED'&&record.planVersion===order.planVersion&&!!record.planId&&record.qcState==='PASSED'&&record.qcPlanId===record.planId;
 }).map(order=>order.caseId);
 const releasedCaseIds=activeOrders.filter(order=>order.status==='RELEASED').map(order=>order.caseId);
 const dispatchReadyOrders=dispatchReadyCaseIds.length;
 const activeCareCases=data.cases.filter(item=>['ACTIVE','REFINEMENT','RETENTION','RETENTION_COMPLETED','TREATMENT_COMPLETED'].includes(String(item.careStage))).length;
 const shippedAwaitingHandoff=data.cases.filter(item=>item.status==='SHIPPED'&&item.careStage==='NOT_STARTED').length;
 const connectedModules=[
  {module:'15',title:'Doctor approval',value:approvedPlans,detail:'Clinically reviewed and doctor-approved plans in the case register.',href:'#production-access'},
  {module:'16',title:'Automatic trigger',value:activeOrders.length,detail:'Manufacturing orders created from approved plans.',href:'#manufacturing-orders'},
  {module:'17',title:'Production control',value:productionOrders.length,detail:`${productionOrders.reduce((sum,order)=>sum+order.stages.length,0)} production stages recorded.`,href:'#production-control'},
  {module:'18',title:'Final quality',value:releasedOrders,detail:qualityHolds?`${qualityHolds} order${qualityHolds===1?'':'s'} on quality hold.`:'Released after the current-plan QC gate.',href:'#manufacturing-orders'},
  {module:'19',title:'Dispatch',value:dispatchReadyOrders,detail:`Ready only after release plus current-plan case QC PASS · ${data.metrics.awaitingCompletion} case${data.metrics.awaitingCompletion===1?'':'s'} shipped.`,href:'#production-access'},
  {module:'20',title:'Doctor handoff',value:activeCareCases,detail:`In treatment / retention · ${shippedAwaitingHandoff} shipped case${shippedAwaitingHandoff===1?'':'s'} awaiting doctor handoff.`,href:'#production-access'},
 ];
 return <main className="clinical manufacturing-mes" style={{maxWidth:1320,margin:'0 auto',padding:'32px 24px'}}>
  <header><div><span className="clinical-eyebrow">OPERATIONS · PRODUCTION CONTROL</span><h1>Manufacturing / MES</h1><p>Manage approved manufacturing orders, record each production stage, and review lab access activity.</p></div></header>
  <nav className="manufacturing-nav" aria-label="Manufacturing workspace"><a className="button secondary" href="#manufacturing-orders">Manufacturing orders</a><a className="button secondary" href="#production-control">Stage control</a><a className="button secondary" href="#production-access">Production access & audit</a><Link className="button secondary" href="/lab">Laboratory workspace</Link></nav>
  <section className="production-handoff" aria-labelledby="production-handoff-title">
   <div className="production-handoff-heading"><div><span className="clinical-eyebrow">CONNECTED CASE FLOW · MODULES 15 → 20</span><h2 id="production-handoff-title">Approval to doctor handoff</h2><p>Follow the approved plan into production, quality release and the existing dispatch and treatment workflow.</p></div><span className="production-flow-count">{activeOrders.length} linked order{activeOrders.length===1?'':'s'}</span></div>
   <ol className="production-handoff-grid">{connectedModules.map((step,index)=><li className="production-handoff-step" key={step.module} style={{'--flow-index':index} as import('react').CSSProperties}><a href={step.href}><span className="production-handoff-number">{step.module}</span><span className="production-handoff-copy"><strong>{step.title}</strong><span>{step.detail}</span></span><b className="production-handoff-value">{step.value}</b><span className="production-handoff-arrow" aria-hidden="true">↗</span></a></li>)}</ol>
   {!manufacturing.ready&&<p className="clinical-notice" role="status">Manufacturing tables are not installed yet, so order-based module counts are unavailable.</p>}
  </section>
  <ManufacturingOrders ready={manufacturing.ready} orders={manufacturing.orders} catalog={manufacturing.catalog}/>
  <div id="production-access" style={{scrollMarginTop:100}}><ProductionManager records={data.cases} metrics={data.metrics} activity={data.activity} releasedCaseIds={releasedCaseIds} dispatchReadyCaseIds={dispatchReadyCaseIds}/></div>
 </main>;
}
