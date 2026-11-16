import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import {complaintList} from '@/app/lib/complaint-management';
import ComplaintManager from '@/app/hr/complaints/complaint-manager';
import type {CapaOption,ComplaintAudit,QualityComplaint} from '@/app/hr/complaints/types';
import '../../clinical/review.css';

export const dynamic='force-dynamic';
export default async function ComplaintsPage(){
 const actor=await currentHR();
 if(!actor)redirect('/hr/login');
 const data=await complaintList(actor);
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const today=dateParts.filter(p=>['year','month','day'].includes(p.type)).map(p=>p.value).join('-');
 return <main className="clinical" style={{maxWidth:1280,margin:'0 auto',padding:'32px 24px'}}>
  <header><div><span className="clinical-eyebrow">QUALITY · COMPLAINT CELL</span><h1>Complaint management</h1><p>Track each complaint from intake through risk assessment, investigation, traceability, CAPA and regulatory review to documented closure.</p></div><nav aria-label="Quality management"><a className="button secondary" href="/quality">Quality dashboard</a><a className="button secondary" href="/capa">CAPA management</a></nav></header>
  <ComplaintManager records={data.records as QualityComplaint[]} audit={data.audit as ComplaintAudit[]} capas={data.capas as CapaOption[]} canWrite={data.canWrite} today={today}/>
 </main>;
}
