'use client';
import { useState, type FormEvent } from 'react';
import { qcLabels } from '../lib/extended-workflow-policy';
import type { workflowView } from '../lib/extended-case-workflow';
type State = Awaited<ReturnType<typeof workflowView>>;
export default function LabQCPanel({ caseId }: { caseId: string }) {
  const [token,setToken]=useState(''),[state,setState]=useState<State|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const endpoint=`/api/lab/cases/${encodeURIComponent(caseId)}/workflow`;
  async function request(body?:unknown) {
    const r=await fetch(endpoint,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await r.json();if(!r.ok)throw new Error(data.message||'Unable to access this case.');return data;
  }
  async function unlock(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage('');setState(null);try{setState(await request());}catch(err){setMessage(err instanceof Error?err.message:'Request failed.');}finally{setBusy(false);}}
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!state||busy)return;setBusy(true);setMessage('');const form=e.currentTarget,data=new FormData(form);
    try{await request({action:data.get('action'),revision:state.revision,notes:data.get('notes'),confirmed:data.get('confirmed')==='yes',checklist:Object.fromEntries(Object.keys(qcLabels).map(k=>[k,data.get(k)==='yes']))});setState(await request());form.reset();setMessage('QC decision recorded.');}
    catch(err){setState(null);setMessage((err instanceof Error?err.message:'Request failed.')+' Reload the case before retrying.');}finally{setBusy(false);}}
  return <section className="panel padded"><h1>Case quality control</h1><p>Use the laboratory access grant assigned to this case.</p>
    <form onSubmit={unlock} className="form-stack"><label>Case access token<input type="password" autoComplete="off" value={token} onChange={e=>{setToken(e.target.value);setState(null);}} required pattern="[a-f0-9]{64}"/></label><button className="button" disabled={busy}>Load case</button></form>
    {state&&<><p>Case status: {state.status} · QC: {state.qcState||'Not enrolled'} · Treatment: {state.careStage||'Not enrolled'}</p>
      {state.actions.filter(a=>a==='qc_pass'||a==='qc_fail').map(action=><form key={action} onSubmit={save} className="form-stack">
        <h2>{action==='qc_pass'?'Pass QC':'Fail QC / hold dispatch'}</h2><input type="hidden" name="action" value={action}/>
        {Object.entries(qcLabels).map(([key,label])=><label className="checkbox" key={key}><input type="checkbox" name={key} value="yes" required={action==='qc_pass'}/>{label}</label>)}
        <label>Inspection notes / reason<textarea name="notes" minLength={5} maxLength={4000} required/></label>
        <label className="checkbox"><input type="checkbox" name="confirmed" value="yes" required/>I confirm this inspection against the current approved plan.</label><button className="button" disabled={busy}>{action==='qc_pass'?'Record QC pass':'Record QC failure'}</button>
      </form>)}
      {!state.actions.some(a=>a==='qc_pass'||a==='qc_fail')&&<p>QC decisions are available only during manufacture after the latest clinical and doctor approvals. Existing cases require enrollment by the assigned doctor.</p>}
      <button className="button" onClick={()=>{setToken('');setState(null);setMessage('');}}>Clear access token</button></>}
    {message&&<p className="notice" role="status">{message}</p>}
  </section>;
}
