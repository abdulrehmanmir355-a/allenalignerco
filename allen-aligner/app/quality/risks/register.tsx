'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import type {Risk} from './store';
import {submitRisk,exportRisks} from './actions';
const level=(score:number)=>score>=20?'Critical':score>=12?'High':score>=6?'Moderate':'Low';
export default function Register({initial}:{initial:Risk[]}){
 const router=useRouter();const [editing,setEditing]=useState<Risk|null>(null);const [query,setQuery]=useState('');const [message,setMessage]=useState('');const [pending,startTransition]=useTransition();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const open=initial.filter(r=>r.status!=='Closed');
 const filtered=initial.filter(r=>[r.title,r.category,r.owner,r.status].join(' ').toLowerCase().includes(query.toLowerCase()));
 const fieldStyle={display:'grid',gap:6} as const;
 return <><div className="clinical-metrics">{[['Open risks',open.length],['High / critical inherent',open.filter(r=>r.severity*r.likelihood>=12).length],['Reviews overdue',open.filter(r=>r.reviewDate<today).length],['Closed',initial.length-open.length]].map(([name,value])=><section key={name}><span>{name}</span><strong>{value}</strong></section>)}</div>
 <p>Score = severity × likelihood (1–5 each). Low 1–5 · Moderate 6–11 · High 12–19 · Critical 20–25. These are internal prioritization bands; residual scores describe risk after controls.</p>
 <section><h2>{editing?'Review risk':'Register a risk'}</h2><form key={editing?.id||'new'} action={form=>startTransition(async()=>{const result=await submitRisk(form);setMessage(result.ok?'Risk saved.':result.error);if(result.ok){setEditing(null);router.refresh();}})} style={{display:'grid',gap:16}}>
 <input type="hidden" name="id" value={editing?.id||''}/><input type="hidden" name="version" value={editing?.updatedAt||''}/>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>
 <label style={fieldStyle}>Risk title<input name="title" required minLength={3} maxLength={160} defaultValue={editing?.title}/></label>
 <label style={fieldStyle}>Category<select name="category" defaultValue={editing?.category||'Operational'}>{['Clinical','Production','Supplier','Data security','Operational','Other'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label style={fieldStyle}>Responsible owner<input name="owner" required minLength={2} maxLength={160} defaultValue={editing?.owner}/></label>
 <label style={fieldStyle}>Review date<input name="reviewDate" type="date" required defaultValue={editing?.reviewDate}/></label>
 {(['severity','likelihood','residualSeverity','residualLikelihood'] as const).map((name,i)=><label style={fieldStyle} key={name}>{['Inherent severity','Inherent likelihood','Residual severity','Residual likelihood'][i]}<select name={name} defaultValue={editing?.[name]||1}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}
 <label style={fieldStyle}>Status<select name="status" defaultValue={editing?.status||'Open'}>{['Open','Mitigating','Monitoring','Closed'].map(v=><option key={v}>{v}</option>)}</select></label></div>
 <label style={fieldStyle}>Hazard and potential harm<textarea name="description" required minLength={3} maxLength={4000} defaultValue={editing?.description}/></label>
 <label style={fieldStyle}>Mitigation actions / controls<textarea name="mitigation" required minLength={3} maxLength={4000} defaultValue={editing?.mitigation}/></label>
 <label style={fieldStyle}>Verification evidence / review notes (required to close)<textarea name="evidence" maxLength={4000} defaultValue={editing?.evidence}/></label>
 <div><button disabled={pending} type="submit">{pending?'Saving…':'Save risk'}</button> {editing&&<button type="button" onClick={()=>setEditing(null)}>Cancel edit</button>}</div><p role="status">{message}</p></form></section>
 <section><h2>Risk register</h2><label>Search risks <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Title, owner, category, status"/></label> <button type="button" onClick={()=>startTransition(async()=>{try{const json=await exportRisks();const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='risk-register.json';a.click();URL.revokeObjectURL(url);}catch{setMessage('Unable to export register.');}})} disabled={pending}>Export backup</button>
 <div className="clinical-table"><table><thead><tr>{['Risk','Owner / category','Inherent','Residual','Review','Status','Action'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><strong>{r.title}</strong><p>{r.description}</p><details><summary>Controls and review history</summary><p>{r.mitigation}</p><p>{r.evidence||'No verification evidence yet.'}</p>{r.history.map((h,i)=><details key={i}><summary>{new Date(h.at).toLocaleString()} · {h.actor}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{h.note}</pre></details>)}</details></td><td>{r.owner}<br/>{r.category}</td><td>{r.severity*r.likelihood} · {level(r.severity*r.likelihood)}</td><td>{r.residualSeverity*r.residualLikelihood} · {level(r.residualSeverity*r.residualLikelihood)}</td><td>{r.reviewDate}{r.status!=='Closed'&&r.reviewDate<today?' · Overdue':''}</td><td>{r.status}</td><td><button onClick={()=>{setEditing(r);setMessage('');window.scrollTo({top:0,behavior:'smooth'});}}>Review / edit</button></td></tr>)}</tbody></table>{!filtered.length&&<p>No risks found. Register your first risk above.</p>}</div></section></>;
}
