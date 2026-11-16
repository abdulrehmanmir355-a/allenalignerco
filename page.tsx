import { redirect } from 'next/navigation';
import { currentHR } from '@/app/lib/hr-auth';
import { auditList } from '@/app/lib/audit-management';
import AuditManager,{type AuditRegisterData} from '@/app/hr/audits/audit-manager';
import '../../clinical/review.css';
import './audit-management.css';

export const dynamic='force-dynamic';
export default async function InternalAuditsPage(){
 const actor=await currentHR();
 if(!actor)redirect('/hr/login');
 const data=await auditList(actor);
 return <main className="clinical audit-management" style={{maxWidth:1320,margin:'0 auto',padding:'32px 24px'}}>
  <header><div><span className="clinical-eyebrow">QUALITY · INTERNAL AUDIT · CONTINUOUS IMPROVEMENT</span><h1>Audit Management</h1><p>Plan an audit, assess evidence against a checklist, record findings, assign actions, link CAPA and verify closure.</p></div><nav aria-label="Quality navigation"><a className="button secondary" href="/quality">Quality Management</a><a className="button secondary" href="/capa">CAPA register</a></nav></header>
  <div className="audit-flow" aria-label="Internal audit workflow"><span>Audit plan</span><b>→</b><span>Checklist</span><b>→</b><span>Finding</span><b>→</b><span>Action</span><b>→</b><span>CAPA</span><b>→</b><span>Closure</span></div>
  <AuditManager data={data as unknown as AuditRegisterData}/>
 </main>;
}
