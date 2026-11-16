'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {qcChecklists,qcDispositions,qcStageLabels,qcStages} from '@/app/lib/production-qc-policy';
import type {QCInspection} from '@/app/lib/production-qc';

type QCView={caseId:string;status:string;patientReference:string;latestPlan:{id:string;version:number;approved:boolean}|null;inspections:QCInspection[]};
export default function ProductionQualityControl({caseId,token}:{caseId:string;token:string}){
 const [view,setView]=useState<QCView|null>(null),[stage,setStage]=useState<(typeof qcStages)[number]>('INCOMING'),[disposition,setDisposition]=useState<(typeof qcDispositions)[number]>('PASS'),[notes,setNotes]=useState(''),[checks,setChecks]=useState<Record<string,boolean>>({}),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const checklist=useMemo(()=>qcChecklists[stage],[stage]);
 const request=useCallback(async(method:'GET'|'POST',body?:unknown)=>{const response=await fetch(`/api/lab/cases/${encodeURIComponent(caseId)}/quality`,{method,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(data.message||'Unable to load quality inspections.');return data;},[caseId,token]);
 const refresh=useCallback(async()=>{setError('');try{setView(await request('GET'));}catch(e){setError(e instanceof Error?e.message:'Unable to load quality inspections.');}},[request]);
 useEffect(()=>{if(token)void refresh();},[token,refresh]);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');try{const result=await request('POST',{stage,disposition,notes,checklist:Object.fromEntries(Object.keys(checklist).map(key=>[key,checks[key]===true]))});setMessage(result.message);setNotes('');setChecks({});await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to save inspection.');}finally{setBusy(false);}}
 return <section className="panel padded" aria-labelledby="production-qc-title">
  <h2 id="production-qc-title">Production Quality Control</h2>
  <p>Record Incoming, In-Process and Final QC against the latest approved plan. PASS, HOLD, REWORK and REJECT decisions are retained. Packing and dispatch are blocked until every required stage has a current-plan PASS.</p>
  {view?.latestPlan?<p><strong>Current plan:</strong> v{view.latestPlan.version} · {view.latestPlan.approved?'clinically and doctor approved':'not approved — QC decisions are blocked'}</p>:<p>No current treatment plan is available for inspection.</p>}
  {error&&<p role="alert" className="notice">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
  <form className="form-stack" onSubmit={submit}>
   <label>Inspection stage<select value={stage} onChange={event=>{setStage(event.target.value as typeof stage);setChecks({});}}>{qcStages.map(value=><option key={value} value={value}>{qcStageLabels[value]}</option>)}</select></label>
   <label>Disposition<select value={disposition} onChange={event=>setDisposition(event.target.value as typeof disposition)}>{qcDispositions.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <fieldset><legend>{qcStageLabels[stage]} checklist{disposition==='PASS'?' · all items required':''}</legend>{Object.entries(checklist).map(([key,label])=><label className="checkbox" key={key}><input type="checkbox" checked={checks[key]===true} onChange={event=>setChecks(current=>({...current,[key]:event.target.checked}))}/>{label}</label>)}</fieldset>
   <label>Inspection notes / hold, rework or rejection reason<textarea value={notes} onChange={event=>setNotes(event.target.value)} required minLength={5} maxLength={4000}/></label>
   <button className="button" disabled={busy||!token||!view?.latestPlan?.approved}>{busy?'Saving…':'Record QC decision'}</button>
  </form>
  <h3>Inspection history</h3>{view?.inspections.length?<div className="clinical-table"><table><thead><tr><th>Date</th><th>Stage</th><th>Decision</th><th>Inspector</th><th>Plan</th><th>Notes</th></tr></thead><tbody>{view.inspections.map(row=><tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{qcStageLabels[row.stage]}</td><td>{row.disposition}</td><td>{row.inspector}</td><td>v{row.planVersion}</td><td>{row.notes}</td></tr>)}</tbody></table></div>:<p>No inspections recorded for this case.</p>}
 </section>;
}
