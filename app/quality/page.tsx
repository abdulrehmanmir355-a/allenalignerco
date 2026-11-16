import Link from 'next/link';
import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {qualityOverview} from '@/app/lib/quality-management';
import '../clinical/review.css';

export const dynamic='force-dynamic';

function todayInPakistan(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return parts.filter(part=>['year','month','day'].includes(part.type)).map(part=>part.value).join('-');
}

export default async function QualityManagementPage(){
 const actor=await currentHR();
 if(!actor)redirect('/hr/login');
 const today=todayInPakistan();
 const canViewAudit=['HR_ADMIN','HR_OFFICER'].includes(actor.role);
 const overview=await qualityOverview(today,canViewAudit);

 return <main className="clinical" style={{maxWidth:1280,margin:'0 auto',padding:'32px 24px'}}>
  <header><div><span className="clinical-eyebrow">QUALITY · COMPLIANCE · CONTINUOUS IMPROVEMENT</span><h1>Quality Management</h1><p>One quality workspace for complaint intake, risk, investigation, traceability, CAPA, regulatory assessment, audits and documented closure.</p></div><nav aria-label="Quality actions"><Link className="button" href="/quality/risks">Risk management</Link><Link className="button" href="/quality/audits">Internal audits</Link><Link className="button" href="/quality/complaints">Complaint management</Link><Link className="button secondary" href="/capa">CAPA register</Link></nav></header>
  <section aria-labelledby="quality-overview"><h2 id="quality-overview">Live quality overview</h2><p>Counts are read from the current complaint and CAPA registers.</p>
   <div className="clinical-metrics">
    <section><span>Open complaints</span><strong>{overview.metrics.openComplaints}</strong><Link href="/quality/complaints">Review complaints</Link></section>
    <section><span>High / critical risk</span><strong>{overview.metrics.highRisk}</strong><Link href="/quality/complaints">Review risk assessments</Link></section>
    <section><span>Open CAPAs</span><strong>{overview.metrics.openCapas}</strong><Link href="/capa">Review CAPAs</Link></section>
    <section><span>Overdue CAPAs</span><strong>{overview.metrics.overdueCapas}</strong><Link href="/capa">Review due dates</Link></section>
    <section><span>Regulatory assessment pending</span><strong>{overview.metrics.regulatoryPending}</strong><Link href="/quality/complaints">Complete assessment</Link></section>
    <section><span>CAPA decision pending</span><strong>{overview.metrics.capaPending}</strong><Link href="/quality/complaints">Review CAPA decisions</Link></section>
    <section><span>Open internal audits</span><strong>{overview.metrics.openAudits}</strong><Link href="/quality/audits">Review audit plans</Link></section>
    <section><span>Overdue audit plans</span><strong>{overview.metrics.overdueAudits}</strong><Link href="/quality/audits">Review overdue audits</Link></section>
   </div>
  </section>
  <section aria-labelledby="quality-workflow"><h2 id="quality-workflow">Quality workflow</h2><ol><li>Internal audit plan and scope</li><li>Checklist evidence and findings</li><li>Assigned corrective action and linked CAPA</li><li>Verified audit closure</li><li>Complaint intake and source capture</li><li>Risk assessment, case traceability and regulatory review</li><li>Effectiveness verification and documented closure</li></ol><p>Audit, complaint and CAPA changes are recorded in their append-only histories. Closed and cancelled records remain in their registers.</p></section>
  {canViewAudit&&<section aria-labelledby="quality-activity"><h2 id="quality-activity">Recent quality activity</h2>{overview.events.length?<div className="clinical-table"><table><thead><tr><th>Time</th><th>Record</th><th>Action</th><th>Updated by</th><th>Note</th></tr></thead><tbody>{overview.events.map(item=><tr key={`${item.kind}-${item.id}`}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.record}</td><td>{item.action.replaceAll('_',' ')}</td><td>{item.actorEmail}</td><td>{item.note||'—'}</td></tr>)}</tbody></table></div>:<p>No quality audit activity has been recorded.</p>}</section>}
 </main>;
}
