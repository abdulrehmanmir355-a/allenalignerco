'use client';
import {useState,type CSSProperties,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {ProductionOperatorOrder} from '@/app/lib/manufacturing-orders';

const input:CSSProperties={width:'100%',minHeight:42,padding:'9px 11px',border:'1px solid #bfd1d9',borderRadius:8,background:'#f7fafb',color:'#163541',font:'inherit',boxSizing:'border-box'};
const field:CSSProperties={display:'grid',gap:6,minWidth:0};
const grid:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,210px),1fr))',gap:12,alignItems:'end'};
const primary:CSSProperties={background:'#087989',color:'#fff',border:'1px solid #087989',borderRadius:8,padding:'10px 15px',font:'inherit',fontWeight:700,cursor:'pointer'};
const metric:CSSProperties={background:'#fff',border:'1px solid #d4e2e6',borderRadius:12,padding:'16px 18px',display:'grid',gap:4};
const stamp=(value:string)=>`${value.slice(0,16).replace('T',' ')} UTC`;

export default function OperatorScreen({operatorName,orders}:{operatorName:string;orders:ProductionOperatorOrder[]}){
 const router=useRouter();const [busy,setBusy]=useState<string|null>(null);const [notice,setNotice]=useState('');const [failed,setFailed]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>,orderId:string){event.preventDefault();if(busy)return;setBusy(orderId);setNotice('');setFailed(false);const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));const body={...values,action:'record_operator_stage',orderId,durationMinutes:Number(values.durationMinutes)};
  try{const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message||'Unable to save this stage.');setNotice(result.message||'Production stage saved.');form.reset();router.refresh();}
  catch(error){setFailed(true);setNotice(error instanceof Error?error.message:'Unable to save this stage.');}finally{setBusy(null);}
 }
 return <section aria-labelledby="operator-queue-heading" style={{marginTop:24}}>
  {notice&&<p role={failed?'alert':'status'} className={failed?'clinical-error':'clinical-notice'}>{notice}</p>}
  <header><span className="clinical-eyebrow">APPROVED WORK · LIVE QUEUE</span><h2 id="operator-queue-heading">Your production queue</h2><p>Only current doctor-approved orders that passed internal review are shown. Patient-identifying details stay in the authorized clinical workspace.</p></header>
  <div className="operator-metrics" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,margin:'18px 0 24px'}}><div style={metric}><span>Orders waiting</span><strong style={{fontSize:28}}>{orders.length}</strong></div><div style={metric}><span>Stages logged</span><strong style={{fontSize:28}}>{orders.reduce((count,order)=>count+order.stages.length,0)}</strong></div><div style={metric}><span>Next due</span><strong style={{fontSize:20}}>{orders.find(order=>order.dueDate)?.dueDate??'No date set'}</strong></div></div>
  {!orders.length?<section className="clinical-notice" style={{marginTop:18}}><strong>No production orders are waiting.</strong><p>When an approved order passes its checks and enters the queue, it will appear here.</p></section>:orders.map(order=><article key={order.id} style={{background:'#fff',border:'1px solid #cbdce2',borderRadius:14,padding:20,margin:'16px 0',boxShadow:'0 8px 24px rgba(16,52,67,.05)'}}>
   <header style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'flex-start',flexWrap:'wrap'}}><div><p className="clinical-eyebrow">{order.orderNumber} · PLAN v{order.planVersion}</p><h3 style={{margin:'4px 0 8px'}}>Queue position {order.queuePosition??'—'}</h3><p style={{margin:0}}>{order.caseType} · {order.workCenter||'Work center pending'} · Due {order.dueDate||'Not set'}</p></div><span className="badge">{order.stages.length} recorded stage{order.stages.length===1?'':'s'}</span></header>
   {order.stages.length>0?<ol style={{display:'grid',gap:8,paddingLeft:22,margin:'18px 0'}}>{order.stages.map(stage=><li key={stage.id}><strong>{stage.sequence}. {stage.stageName}</strong> · {stage.result}<br/><span>{stage.operatorName} · {stage.machineName} · {stage.materialUsed} · {stage.durationMinutes} min</span><br/><small>Recorded by {stage.recordedBy} · {stamp(stage.createdAt)}{stage.notes?` · ${stage.notes}`:''}</small></li>)}</ol>:<p>No stages are recorded yet.</p>}
   <details style={{marginTop:16}}><summary>Record a production stage</summary><form onSubmit={event=>submit(event,order.id)} style={{marginTop:14}}><div style={grid}>
    <label style={field}>Stage<input name="stageName" required minLength={2} maxLength={120} placeholder="e.g. Print, trim, finishing" style={input}/></label>
    <label style={field}>Signed-in operator<input name="operatorName" required minLength={2} maxLength={200} defaultValue={operatorName} readOnly style={{...input,background:'#edf4f4'}}/><small>Recorded from your employee account.</small></label>
    <label style={field}>Machine<input name="machineName" required minLength={2} maxLength={160} placeholder="Machine or work-center ID" style={input}/></label>
    <label style={field}>Material used<input name="materialUsed" required minLength={2} maxLength={240} placeholder="Material name, SKU or lot" style={input}/></label>
    <label style={field}>Time spent (minutes)<input name="durationMinutes" type="number" required min="1" max="1440" step="1" style={input}/></label>
    <label style={field}>Result<select name="result" required defaultValue="PASS" style={input}><option value="PASS">Passed</option><option value="REWORK">Rework required</option><option value="FAIL">Failed</option></select></label>
    <label style={{...field,gridColumn:'1 / -1'}}>Notes<textarea name="notes" maxLength={2000} rows={2} placeholder="Optional stage notes" style={input}/></label>
    <button style={primary} disabled={busy===order.id}>{busy===order.id?'Saving…':'Save stage record'}</button>
   </div></form></details>
  </article>)}
 </section>;
}
