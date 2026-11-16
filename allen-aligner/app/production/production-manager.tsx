'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {ProductionActivity,ProductionMetrics,ProductionRecord} from '@/app/lib/production-management';

const timeText=(value:string|null)=>value?`${value.slice(0,16).replace('T',' ')} UTC`:'—';

export default function ProductionManager({records,metrics,activity,releasedCaseIds=[],dispatchReadyCaseIds=[]}:{records:ProductionRecord[];metrics:ProductionMetrics;activity:ProductionActivity[];releasedCaseIds?:string[];dispatchReadyCaseIds?:string[]}){
 const router=useRouter();
 const [status,setStatus]=useState('ACTIVE'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[issued,setIssued]=useState<{caseId:string;token:string;label:string;expiresAt:string|null}|null>(null),[copied,setCopied]=useState(false);
 const shown=useMemo(()=>records.filter(record=>(status==='ALL'||(status==='ACTIVE'?!['COMPLETED'].includes(record.status):record.status===status))&&`${record.id} ${record.patientReference} ${record.category} ${record.doctorName} ${record.clinicName}`.toLowerCase().includes(query.trim().toLowerCase())),[records,status,query]);
 async function submit(body:unknown){
  if(busy)return;
  setBusy(true);setMessage('');setFailed(false);setCopied(false);
  try{
   const response=await fetch('/api/production/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.message||'Unable to update production access.');
   if(result.token)setIssued({caseId:String((body as {caseId?:string})?.caseId??''),token:result.token,label:result.label,expiresAt:result.expiresAt});else setIssued(null);
   setMessage(result.message||'Production access updated.');
   router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to update production access.');setFailed(true);}
  finally{setBusy(false);}
 }
 function grant(event:FormEvent<HTMLFormElement>,record:ProductionRecord){
  event.preventDefault();const values=new FormData(event.currentTarget);
  void submit({action:'grant',caseId:record.id,label:String(values.get('label')??''),expiresInHours:Number(values.get('expiresInHours'))});
 }
 async function copyToken(){if(!issued)return;try{await navigator.clipboard.writeText(issued.token);setCopied(true);}catch{setMessage('Clipboard access failed. Select and copy the displayed token manually.');}}
 return <>
  {message&&<p role={failed?'alert':'status'} className={failed?'clinical-error':'clinical-notice'}>{message}</p>}
  {issued&&<section aria-labelledby="one-time-access"><h2 id="one-time-access">New laboratory credential — copy it now</h2><p>This credential will not be shown again. Issuing it replaces any previous credential for this case.</p><p><strong>{issued.label}</strong> · expires {timeText(issued.expiresAt)}</p><label>Case access token<input readOnly value={issued.token} onFocus={event=>event.currentTarget.select()} /></label><button className="button" type="button" onClick={()=>void copyToken()}>{copied?'Copied':'Copy token'}</button><p>Enter this case ID and token in the laboratory case workspace.</p><code>{issued.caseId}</code></section>}
  <section aria-label="Production metrics"><div className="clinical-metrics">
   <section><span>Planning / review queue</span><strong>{metrics.planningQueue}</strong></section>
   <section><span>Approved for production</span><strong>{metrics.readyForProduction}</strong></section>
   <section><span>In production</span><strong>{metrics.inProduction}</strong></section>
   <section><span>Awaiting completion</span><strong>{metrics.awaitingCompletion}</strong></section>
   <section><span>Active lab grants</span><strong>{metrics.activeLabGrants}</strong></section>
   <section><span>Expired lab grants</span><strong>{metrics.expiredLabGrants}</strong></section>
  </div></section>
  <section><h2>Production case register</h2><div className="form-grid"><label>Find case<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Case ID, patient reference, doctor or clinic"/></label><label>Workflow stage<select value={status} onChange={event=>setStatus(event.target.value)}><option value="ACTIVE">Active cases</option><option value="ALL">All cases</option>{['SUBMITTED','PLANNING','REVIEW','CHANGES_REQUESTED','APPROVED','IN_PRODUCTION','SHIPPED','COMPLETED'].map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label></div>
   {!shown.length&&<p className="empty-state">No production cases match this view.</p>}
   {shown.map(record=><article key={record.id} style={{border:'1px solid #dce7e9',borderRadius:10,padding:18,margin:'14px 0'}}>
    <h3>{record.patientReference} · {record.status.replaceAll('_',' ')}</h3>
    <p><strong>Case ID:</strong> {record.id} · {record.category} · {record.clinicName} · Dr. {record.doctorName}</p>
    <p><strong>Plan:</strong> {record.planVersion?`v${record.planVersion} · ${record.planDecision??'pending'}`:'No plan submitted'} · Clinical review: {record.clinicalReviewStatus??'not reviewed'}</p>
    {record.approvedAt&&<p><strong>Doctor approval:</strong> {timeText(record.approvedAt)}</p>}
    <p><strong>QC:</strong> {record.qcState??'Not enrolled'} · <strong>Treatment:</strong> {record.careStage??'Not enrolled'}</p>
    {record.status==='IN_PRODUCTION'&&<p className={dispatchReadyCaseIds.includes(record.id)?'production-dispatch-ready':'production-dispatch-blocked'}><strong>Module 19 dispatch:</strong> {dispatchReadyCaseIds.includes(record.id)?'Ready · Module 18 released and current approved-plan QC passed':!releasedCaseIds.includes(record.id)?'Waiting for Module 18 manufacturing quality release':`Blocked · case QC must PASS on plan v${record.planVersion??'—'} before dispatch`}</p>}
    {record.status==='SHIPPED'&&<p className="production-doctor-handoff"><strong>Module 20 doctor handoff:</strong> {record.careStage==='NOT_STARTED'?'Awaiting doctor to start treatment':record.careStage?record.careStage.replaceAll('_',' ').toLowerCase():'Shipped · doctor handoff status not enrolled'}</p>}
    <p><strong>Lab access:</strong> {record.labLabel?`${record.labLabel} · ${record.labAccessActive?'active':'expired'} · expires ${timeText(record.labExpiresAt)}`:'Not assigned'}</p>
    <details><summary>Manage case laboratory access</summary>
     {record.status!=='COMPLETED'&&<form onSubmit={event=>grant(event,record)}><fieldset disabled={busy}><div className="form-grid"><label>Laboratory / operator label<input name="label" defaultValue={record.labLabel??'Specialist lab'} minLength={2} maxLength={120} required/></label><label>Grant duration<select name="expiresInHours" defaultValue="168"><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option></select></label></div><button className="button" disabled={busy}>{record.labAccessActive?'Rotate access token':'Issue case access'}</button></fieldset></form>}
     {record.labLabel&&<button className="button secondary" type="button" disabled={busy} onClick={()=>void submit({action:'revoke',caseId:record.id})}>Revoke access</button>}
     <p>Grant tokens are stored as hashes. Rotating a token invalidates the previous credential.</p>
    </details>
   </article>)}
  </section>
  <section><h2>Production access audit</h2>{activity.length?<div className="clinical-table"><table><thead><tr><th>Time</th><th>Case</th><th>Action</th><th>Operator</th><th>Details</th></tr></thead><tbody>{activity.map(item=><tr key={item.id}><td>{timeText(item.createdAt)}</td><td>{item.caseId}</td><td>{item.action.replaceAll('_',' ')}</td><td>{item.actorEmail??'HR administrator'}</td><td>{item.detail?.label??'—'}{item.detail?.expiresAt?` · ${timeText(item.detail.expiresAt)}`:''}</td></tr>)}</tbody></table></div>:<p>No production access changes recorded.</p>}</section>
 </>;
}

