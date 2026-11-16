'use client';
import { useMemo,useState,type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Capa,CapaAudit } from './types';

const transitions:Record<string,string[]>={OPEN:['INVESTIGATING','CANCELLED'],INVESTIGATING:['ACTION_IN_PROGRESS','CANCELLED'],ACTION_IN_PROGRESS:['VERIFYING','CANCELLED'],VERIFYING:['CLOSED','ACTION_IN_PROGRESS'],CLOSED:[],CANCELLED:[]};
const fields=['sourceType','severity','title','description','containment','rootCause','correction','correctiveAction','preventiveAction','effectivenessCheck','assignedTo','dueDate'] as const;
function textValue(form:FormData,key:string){return String(form.get(key)??'');}
function CapaFields({record}:{record?:Capa}){return <><div className="form-grid">
  <label>Source<select name="sourceType" defaultValue={record?.sourceType??''} required><option value="">Select source</option>{['CLINICAL','LABORATORY','SUPPLIER','INTERNAL_AUDIT','CUSTOMER','PROCESS','OTHER'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
  <label>Severity<select name="severity" defaultValue={record?.severity??'MEDIUM'} required>{['LOW','MEDIUM','HIGH','CRITICAL'].map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Issue title<input name="title" defaultValue={record?.title??''} required minLength={5} maxLength={200}/></label><label>Owner<input name="assignedTo" defaultValue={record?.assignedTo??''} required minLength={2} maxLength={200}/></label>
  <label>Target date<input name="dueDate" type="date" defaultValue={record?.dueDate??''} required/></label>
  <label>Description<textarea name="description" defaultValue={record?.description??''} required minLength={10} maxLength={5000}/></label>
  <label>Immediate containment<textarea name="containment" defaultValue={record?.containment??''} maxLength={3000}/></label><label>Correction<textarea name="correction" defaultValue={record?.correction??''} maxLength={3000}/></label>
  <label>Root cause<textarea name="rootCause" defaultValue={record?.rootCause??''} maxLength={3000}/></label><label>Corrective action<textarea name="correctiveAction" defaultValue={record?.correctiveAction??''} maxLength={3000}/></label>
  <label>Preventive action<textarea name="preventiveAction" defaultValue={record?.preventiveAction??''} maxLength={3000}/></label><label>Effectiveness check<textarea name="effectivenessCheck" defaultValue={record?.effectivenessCheck??''} maxLength={3000}/></label>
  </div></>}
export default function CapaManager({records,audit,canWrite}:{records:Capa[];audit:CapaAudit[];canWrite:boolean}){
  const router=useRouter();const [filter,setFilter]=useState('OPEN'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const shown=useMemo(()=>records.filter(r=>(filter==='ALL'||r.status===filter)&&`${r.title} ${r.assignedTo} ${r.sourceType}`.toLowerCase().includes(query.trim().toLowerCase())),[records,filter,query]);
  async function send(url:string,method:string,body:unknown,onSuccess?:()=>void){if(busy)return;setBusy(true);setMessage('');setError(false);try{const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message||'Unable to save CAPA.');setMessage(result.message||'Saved.');onSuccess?.();router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Unable to save CAPA.');setError(true);}finally{setBusy(false);}}
  function create(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const fd=new FormData(form);void send('/api/hr/capa','POST',Object.fromEntries(fields.map(k=>[k,textValue(fd,k)])),()=>form.reset());}
  function update(event:FormEvent<HTMLFormElement>,record:Capa){event.preventDefault();const fd=new FormData(event.currentTarget);const body=Object.fromEntries([...fields.map(k=>[k,textValue(fd,k)] as const),['status',textValue(fd,'status')],['actionNote',textValue(fd,'actionNote')]]);void send(`/api/hr/capa/${record.id}`,'PATCH',body);}
  return <>
    {message&&<p role={error?'alert':'status'} className={error?'clinical-error':'clinical-notice'}>{message}</p>}
    {canWrite&&<section><h2>Open a CAPA</h2><form onSubmit={create}><fieldset disabled={busy}><CapaFields/><button className="button" disabled={busy}>{busy?'Saving…':'Create CAPA'}</button></fieldset></form></section>}
    <section><h2>CAPA register</h2><div className="form-grid"><label>Find CAPA<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, owner or source"/></label><label>Status<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="OPEN">Open and active</option><option value="ALL">All statuses</option>{['INVESTIGATING','ACTION_IN_PROGRESS','VERIFYING','CLOSED','CANCELLED'].map(s=><option key={s}>{s}</option>)}</select></label></div>
      {!shown.length&&<p className="empty-state">No CAPA records match this view.</p>}
      {shown.map(r=><article key={r.id} style={{border:'1px solid #dce7e9',borderRadius:10,padding:18,margin:'14px 0'}}><h3>{r.title}</h3><p><strong>{r.status.replaceAll('_',' ')}</strong> · {r.severity} · {r.sourceType.replaceAll('_',' ')} · Owner: {r.assignedTo} · Due {r.dueDate}</p><p>{r.description}</p>{r.containment&&<p><strong>Containment:</strong> {r.containment}</p>}
        {canWrite&&r.status!=='CLOSED'&&r.status!=='CANCELLED'&&<details><summary>Update investigation and actions</summary><form onSubmit={e=>update(e,r)}><fieldset disabled={busy}><CapaFields record={r}/><label>Workflow status<select name="status" defaultValue={r.status} required><option value={r.status}>{r.status.replaceAll('_',' ')}</option>{(transitions[r.status]??[]).map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><label>Update note<textarea name="actionNote" required minLength={5} maxLength={2000}/></label><button className="button" disabled={busy}>Save update</button></fieldset></form></details>}
      </article>)}
    </section>
    {canWrite&&<section><h2>CAPA audit history</h2>{audit.length?audit.map(item=><p key={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.action.replaceAll('_',' ')} · {item.title} · {item.actorEmail}{item.detail?.note&&<> · {item.detail.note}</>}</p>):<p>No CAPA actions recorded.</p>}</section>}
  </>;
}
