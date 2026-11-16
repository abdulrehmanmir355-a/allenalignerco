'use client';
import {useState,type CSSProperties,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {ManufacturingCatalogItem,ManufacturingMaterial,ManufacturingOrder} from '@/app/lib/manufacturing-orders';

const stamp=(value:string|null)=>value?`${value.slice(0,16).replace('T',' ')} UTC`:'Not recorded';
const field:CSSProperties={display:'grid',gap:6,minWidth:0};
const input:CSSProperties={width:'100%',minHeight:42,padding:'9px 11px',border:'1px solid #bfd1d9',borderRadius:8,background:'#f7fafb',color:'#163541',font:'inherit',boxSizing:'border-box'};
const formGrid:CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12,alignItems:'end'};
const button:CSSProperties={background:'#087989',color:'#fff',border:'1px solid #087989',borderRadius:8,padding:'10px 15px',font:'inherit',fontWeight:700,cursor:'pointer'};
const badge:CSSProperties={display:'inline-flex',padding:'6px 10px',border:'1px solid #b8d9d6',borderRadius:999,background:'#edf7f5',color:'#15594e',fontSize:12,fontWeight:700};
const fileSize=(bytes:number)=>bytes>=1024*1024?`${(bytes/(1024*1024)).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
const recordLabel=(type:string|null)=>type==='scan'?'3D scan':type==='photo'?'Clinical photo':type==='xray'?'X-ray':'Case file';
const progressStyle=(state:'done'|'current'|'waiting'):CSSProperties=>({
 display:'grid',alignContent:'start',gap:5,minWidth:115,padding:'10px 12px',borderRadius:12,
 border:`1px solid ${state==='done'?'#9bcfc2':state==='current'?'#6aaee6':'#d8e3e8'}`,
 background:state==='done'?'linear-gradient(145deg,#eff9f5,#e5f3ef)':state==='current'?'linear-gradient(145deg,#eef7ff,#e5eeff)':'rgba(255,255,255,.72)',
 color:state==='done'?'#175b4d':state==='current'?'#164b75':'#637984',
 boxShadow:state==='current'?'0 0 18px rgba(65,151,226,.18)':'none',
});

export default function ManufacturingOrders({ready,orders,catalog}:{ready:boolean;orders:ManufacturingOrder[];catalog:ManufacturingCatalogItem[]}){
 return <section id="manufacturing-orders" aria-labelledby="manufacturing-orders-heading" style={{margin:'28px 0',scrollMarginTop:100}}>
  <span className="clinical-eyebrow">PRODUCTION CONTROL · MES</span>
  <h2 id="manufacturing-orders-heading">Manufacturing orders</h2>
  <p>Doctor approval creates an order for that exact plan version. Confirm materials, commercial clearance, capacity and dates before it enters the queue; record costing after it is queued.</p>
  <div id="production-control" style={{padding:'14px 16px',margin:'18px 0',border:'1px solid #cbdce2',borderRadius:12,background:'#f6faf9',scrollMarginTop:100}}><strong>Production stage control</strong><p style={{margin:'4px 0 0'}}>Open a queued order to record each stage’s operator, machine, material, time spent and result. Each entry is timestamped and kept in the order history.</p></div>
  {!ready?<p className="clinical-notice">Manufacturing-order setup is waiting for its database migration. No order can be created or advanced until setup is applied.</p>:!orders.length?<p className="empty-state">No current doctor-approved plans are waiting for manufacturing checks.</p>:orders.map(order=><ManufacturingOrderCard key={order.id} order={order} catalog={catalog}/>)}
 </section>;
}

function ManufacturingOrderCard({order,catalog}:{order:ManufacturingOrder;catalog:ManufacturingCatalogItem[]}){
 const router=useRouter();
 const [materials,setMaterials]=useState<ManufacturingMaterial[]>(()=>order.materials.map(material=>({...material})));
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [failed,setFailed]=useState(false);
 async function send(body:Record<string,unknown>){
  if(busy)return;setBusy(true);setMessage('');setFailed(false);
  try{const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.message||'Unable to update this manufacturing order.');setMessage(result.message||'Manufacturing order updated.');router.refresh();}
  catch(error){setMessage(error instanceof Error?error.message:'Unable to update this manufacturing order.');setFailed(true);}
  finally{setBusy(false);}
 }
 function saveMaterials(event:FormEvent<HTMLFormElement>){event.preventDefault();void send({action:'set_materials',orderId:order.id,materials:materials.map(({itemId,quantityRequired})=>({itemId,quantity:quantityRequired}))});}
 function submitForm(event:FormEvent<HTMLFormElement>,action:string){event.preventDefault();const values=new FormData(event.currentTarget);const body:Record<string,unknown>={action,orderId:order.id};for(const [key,value] of values.entries())body[key]=['materialCost','laborCost','otherCost','durationMinutes'].includes(key)?Number(value):String(value);void send(body);}
 const isQueued=order.status==='QUEUED';
 const isQualityHold=order.status==='QUALITY_HOLD';
 const isReleased=order.status==='RELEASED';
 const lastStage=order.stages[0];
 const latestReview=order.qualityReviews[0];
 const productionStagePassed=Boolean(lastStage?.result==='PASS'&&(isReleased||!latestReview||new Date(lastStage.createdAt).getTime()>new Date(latestReview.createdAt).getTime()));
 const qualityCanInspect=Boolean(order.costedAt&&lastStage&&productionStagePassed&&isQueued);
 const workflow=[
  {label:'Doctor approval',done:true,current:false},
  {label:'Manufacturing order',done:true,current:false},
  {label:'Material check',done:order.status!=='MATERIAL_CHECK'&&order.status!=='SUPERSEDED',current:order.status==='MATERIAL_CHECK'},
  {label:'Commercial check',done:['CAPACITY_CHECK','QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status),current:order.status==='COMMERCIAL_CHECK'},
  {label:'Capacity',done:isQueued||isQualityHold||isReleased,current:order.status==='CAPACITY_CHECK'},
  {label:'Due date',done:isQueued||isQualityHold||isReleased,current:order.status==='CAPACITY_CHECK'},
  {label:'Production queue',done:isQueued||isQualityHold||isReleased,current:false},
  {label:'Production stages',done:productionStagePassed,current:isQueued&&!productionStagePassed},
  {label:'Costing',done:Boolean(order.costedAt),current:isQueued&&!order.costedAt},
  {label:'Quality release',done:isReleased,current:qualityCanInspect||isQualityHold},
 ];
 return <article style={{border:'1px solid #cbdce2',borderRadius:14,padding:20,margin:'16px 0',background:'#fff',boxShadow:'0 8px 24px rgba(16,52,67,.05)'}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}>
   <div><p className="clinical-eyebrow">{order.orderNumber} · PLAN v{order.planVersion}</p><h3 style={{margin:'4px 0 8px'}}>{order.patientReference} · {order.status.replaceAll('_',' ')}</h3><p style={{margin:'0 0 8px'}}>Case {order.caseId} · {order.caseType} · {order.clinicName} · Dr. {order.doctorName}</p></div>
   <span style={badge}>Queue {order.queuePosition??'—'}</span>
  </header>
  {order.status!=='SUPERSEDED'&&<section aria-label="Approval to manufacturing progress" style={{padding:'14px 0 18px',borderTop:'1px solid #e0eaee',borderBottom:'1px solid #e0eaee',marginBottom:4}}>
   <h4 style={{margin:'0 0 10px'}}>Approval to manufacturing</h4>
   <ol aria-label="Doctor approval through manufacturing progress" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,135px),1fr))',gap:8,margin:0,padding:0,listStyle:'none'}}>
    {workflow.map((step,index)=>{const state=step.done?'done':step.current?'current':'waiting';return <li key={step.label} className="manufacturing-progress-step" data-state={state} aria-current={step.current?'step':undefined} style={progressStyle(state)}><span style={{fontSize:11,fontWeight:800,letterSpacing:'.04em'}}>{String(index+1).padStart(2,'0')} · {state==='done'?'Complete':state==='current'?'In progress':'Next'}</span><strong style={{fontSize:13,lineHeight:1.35}}>{step.label}</strong></li>;})}
   </ol>
  </section>}
  <section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>Approved case data · linked automatically</h4><p style={{color:'#607681'}}>This order uses the original case and approved plan. Case details and files are linked from that record; no duplicate entry or re-upload is needed.</p>
   {order.intake?<dl style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:'10px 20px',margin:'12px 0'}}><div><dt style={{fontWeight:700}}>Product and arch</dt><dd>{order.intake.product} · {order.intake.arch}</dd></div><div><dt style={{fontWeight:700}}>Treatment goal</dt><dd>{order.intake.treatmentGoal}</dd></div><div><dt style={{fontWeight:700}}>Extraction</dt><dd>{order.intake.extraction}</dd></div><div><dt style={{fontWeight:700}}>IPR</dt><dd>{order.intake.ipr}</dd></div><div><dt style={{fontWeight:700}}>Attachments</dt><dd>{order.intake.attachments}</dd></div></dl>:<p>Prescription details were not recorded in the structured intake for this case.</p>}
   {order.planSummary&&<p><strong>Approved plan summary:</strong> {order.planSummary}</p>}
   {order.intake?.specialInstructions&&<p><strong>Clinical instructions:</strong> {order.intake.specialInstructions}</p>}
   {order.caseNotes&&<details><summary>Additional case notes</summary><p>{order.caseNotes}</p></details>}
   <div style={{marginTop:12}}><strong>Files attached to this exact approved version</strong>{order.sourceFiles.length?<ul style={{margin:'8px 0'}}>{order.sourceFiles.map(file=><li key={file.id}>{recordLabel(file.recordType)} · {file.name} · {fileSize(file.sizeBytes)}</li>)}</ul>:<p>No source files are attached to this version.</p>}</div>
  </section>
  <p><strong>Doctor approval:</strong> ID {order.approvedDoctorId} · {stamp(order.approvedAt)}</p>
  <details style={{margin:'10px 0 18px'}}><summary>Approved version evidence</summary><p>Exact plan: v{order.planVersion} · SHA-256 artifact fingerprint</p><code style={{overflowWrap:'anywhere'}}>{order.artifactSha256}</code></details>
  {message&&<p role={failed?'alert':'status'} className={failed?'clinical-error':'clinical-notice'}>{message}</p>}
  {order.status==='SUPERSEDED'&&<section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>Plan version superseded</h4><p>This order stays in the audit history. Any materials reserved for it must be released before they can be used by the newly approved plan.</p>{order.materials.some(material=>material.reserved>0)?<button type="button" style={button} disabled={busy} onClick={()=>void send({action:'release_superseded_materials',orderId:order.id})}>{busy?'Releasing…':'Release held materials'}</button>:<p>No held material reservations remain.</p>}</section>}
  <section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>1 · Material check and reservation</h4>
   {order.status==='MATERIAL_CHECK'?<>
    <p>Set requirements from the approved plan. Passing the check reserves available inventory in the stock ledger.</p>
    {catalog.length===0&&<p className="clinical-notice">Set up inventory items and record available stock before adding material requirements.</p>}
    <form onSubmit={saveMaterials}>
     <div style={{display:'grid',gap:10}}>{materials.map((material,index)=><div key={index} style={{...formGrid,padding:12,border:'1px solid #e3ecef',borderRadius:9}}>
      <label style={field}>Inventory item<select required value={material.itemId} onChange={event=>setMaterials(rows=>rows.map((row,rowIndex)=>rowIndex===index?{...row,itemId:event.target.value}:row))} style={input}><option value="">Choose inventory item</option>{catalog.filter(item=>item.id===material.itemId||!materials.some((other,rowIndex)=>rowIndex!==index&&other.itemId===item.id)).map(item=><option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.available} {item.unit} available)</option>)}</select></label>
      <label style={field}>Required quantity<input required type="number" min="1" max="1000000000" step="1" value={material.quantityRequired||''} onChange={event=>setMaterials(rows=>rows.map((row,rowIndex)=>rowIndex===index?{...row,quantityRequired:Number(event.target.value)}:row))} style={input}/></label>
      <p style={{margin:0,color:'#607681'}}>Available now: {catalog.find(item=>item.id===material.itemId)?.available??0} {catalog.find(item=>item.id===material.itemId)?.unit??''}</p>
      <button type="button" className="button secondary" disabled={busy} onClick={()=>setMaterials(rows=>rows.filter((_,rowIndex)=>rowIndex!==index))}>Remove</button>
     </div>)}</div>
     <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}><button type="button" className="button secondary" disabled={busy||materials.length>=100||catalog.length===0} onClick={()=>setMaterials(rows=>[...rows,{itemId:'',sku:'',name:'',unit:'',quantityRequired:1,available:0,reserved:0}])}>+ Add material</button><button style={button} disabled={busy||!materials.length}>{busy?'Saving…':'Save requirements'}</button></div>
    </form>
    {order.materials.length>0&&<form onSubmit={event=>submitForm(event,'check_materials')} style={{marginTop:14}}><div style={formGrid}><label style={field}>Material check evidence<input name="evidence" required minLength={5} maxLength={2000} placeholder="e.g. BOM checked against approved plan v1" style={input}/></label><button style={button} disabled={busy}>{busy?'Checking…':'Check and reserve stock'}</button></div></form>}
   </>:order.status==='SUPERSEDED'?<><p>This plan version is no longer current. The order cannot advance to manufacturing.</p><ul>{order.materials.map(material=><li key={material.itemId}>{material.name}: {material.reserved} {material.unit} still reserved</li>)}</ul></>:<><p>Stock reserved for this order · {stamp(order.materialCheckedAt)}</p><p>{order.materialEvidence}</p><ul>{order.materials.map(material=><li key={material.itemId}>{material.name}: {material.quantityRequired} {material.unit} required · {material.reserved} {material.unit} reserved</li>)}</ul></>}
  </section>
  {['COMMERCIAL_CHECK','CAPACITY_CHECK','QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status)&&<section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>2 · Commercial check</h4>{order.status==='COMMERCIAL_CHECK'?<form onSubmit={event=>submitForm(event,'commercial_check')}><div style={formGrid}><label style={field}>Commercial reference<input name="reference" required minLength={2} maxLength={200} placeholder="Quote, account or authorization reference" style={input}/></label><label style={field}>Check evidence<input name="evidence" required minLength={5} maxLength={2000} placeholder="Record what was verified" style={input}/></label><button style={button} disabled={busy}>{busy?'Saving…':'Confirm commercial check'}</button></div></form>:<p>Passed · {order.commercialReference} · {stamp(order.commercialCheckedAt)}<br/>{order.commercialEvidence}</p>}</section>}
  {['CAPACITY_CHECK','QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status)&&<section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>3 · Capacity and due date</h4>{order.status==='CAPACITY_CHECK'?<form onSubmit={event=>submitForm(event,'capacity_check')}><div style={formGrid}><label style={field}>Work center<input name="workCenter" required minLength={2} maxLength={120} placeholder="Enter an available work center" style={input}/></label><label style={field}>Capacity booking reference<input name="capacityReference" required minLength={2} maxLength={200} placeholder="Enter the confirmed slot reference" style={input}/></label><label style={field}>Scheduled production date<input name="scheduledFor" type="date" required style={input}/></label><label style={field}>Due date<input name="dueDate" type="date" required style={input}/></label><button style={button} disabled={busy}>{busy?'Saving…':'Confirm capacity and add to queue'}</button></div></form>:<p>{order.workCenter} · capacity ref {order.capacityReference} · scheduled {order.scheduledFor} · due {order.dueDate} · confirmed {stamp(order.capacityCheckedAt)}</p>}</section>}
  {['QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status)&&<section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>Production stage control</h4><p>Record who ran each stage, the machine and material used, time spent, and outcome. Entries are kept in the order history.</p>
   {order.stages.length>0?<ol style={{display:'grid',gap:10,paddingLeft:22}}>{order.stages.map(stage=><li key={stage.id}><strong>{stage.sequence}. {stage.stageName}</strong> · {stage.result}<br/><span>{stage.operatorName} · {stage.machineName} · {stage.materialUsed} · {stage.durationMinutes} min</span><br/><small>Logged by {stage.recordedBy} · {stamp(stage.createdAt)}{stage.notes?` · ${stage.notes}`:''}</small></li>)}</ol>:<p className="empty-state">No production stages have been recorded for this order.</p>}
   {isQueued&&<form onSubmit={event=>submitForm(event,'record_stage')}><div style={formGrid}><label style={field}>Stage name<input name="stageName" required minLength={2} maxLength={120} placeholder="e.g. Print, trim, finish" style={input}/></label><label style={field}>Operator<input name="operatorName" required minLength={2} maxLength={200} placeholder="Operator full name" style={input}/></label><label style={field}>Machine<input name="machineName" required minLength={2} maxLength={160} placeholder="Machine or work-center ID" style={input}/></label><label style={field}>Material used<input name="materialUsed" required minLength={2} maxLength={240} placeholder="Material name, SKU or lot" style={input}/></label><label style={field}>Time spent (minutes)<input name="durationMinutes" type="number" required min="1" max="1440" step="1" style={input}/></label><label style={field}>Result<select name="result" required defaultValue="PASS" style={input}><option value="PASS">Passed</option><option value="REWORK">Rework required</option><option value="FAIL">Failed</option></select></label><label style={{...field,gridColumn:'1 / -1'}}>Notes<textarea name="notes" maxLength={2000} rows={2} placeholder="Optional production notes" style={input}/></label><button style={button} disabled={busy}>{busy?'Saving…':'Record production stage'}</button></div></form>}
  </section>}
  {['QUEUED','RELEASED'].includes(order.status)&&<section style={{padding:'16px 0',borderTop:'1px solid #e0eaee'}}><h4>4 · Queue and costing</h4><p><strong>Queue position {order.queuePosition}</strong> · Due {order.dueDate} · {order.costedAt?`Costed ${stamp(order.costedAt)}`:'Costing not recorded yet'}</p>{order.costedAt&&<p>{order.currency} {order.totalCost?.toFixed(2)} total · Materials {order.materialCost?.toFixed(2)} · Labor {order.laborCost?.toFixed(2)} · Other {order.otherCost?.toFixed(2)}</p>}
   <form onSubmit={event=>submitForm(event,'cost')}><div style={formGrid}><label style={field}>Currency code<input name="currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={order.currency??''} placeholder="e.g. PKR" style={input}/></label><label style={field}>Material cost<input name="materialCost" required type="number" min="0" max="999999999999" step="0.01" defaultValue={order.materialCost??''} style={input}/></label><label style={field}>Labor cost<input name="laborCost" required type="number" min="0" max="999999999999" step="0.01" defaultValue={order.laborCost??''} style={input}/></label><label style={field}>Other cost<input name="otherCost" required type="number" min="0" max="999999999999" step="0.01" defaultValue={order.otherCost??''} style={input}/></label><button style={button} disabled={busy}>{busy?'Saving…':order.costedAt?'Update costing':'Record costing'}</button></div></form>
  </section>}
  {['QUEUED','QUALITY_HOLD','RELEASED'].includes(order.status)&&<section className="mes-quality-release" aria-label="Module 18 final quality release"><h4>5 · Final quality inspection and release</h4><p>This MES release must match the official Final QC record for this exact approved plan. Release requires Incoming, In-Process and Final QC to pass, plus completed costing and a passing production stage.</p>
   {order.qualityReviews.length>0?<ol className="mes-quality-history">{order.qualityReviews.map(review=><li key={review.id}><span className={`mes-quality-decision is-${review.decision.toLowerCase()}`}>{review.decision==='PASS'?'Released':review.decision==='REWORK'?'Rework':'On hold'}</span><strong>{review.inspectorName}</strong><time dateTime={review.createdAt}>{stamp(review.createdAt)}</time><p>{review.evidence}</p></li>)}</ol>:<p className="empty-state">No final inspection is recorded yet.</p>}
   {isReleased?<p className="mes-quality-success" role="status">Final quality passed. This order is released for the dispatch handoff.</p>:isQualityHold?<form onSubmit={event=>submitForm(event,'quality_review')}><input type="hidden" name="decision" value="REWORK"/><label style={{...field,marginBottom:12}}>Rework disposition evidence<textarea name="evidence" required minLength={5} maxLength={2000} rows={3} placeholder="Describe why production should resume and what must be corrected" style={input}/></label><button style={button} disabled={busy}>{busy?'Saving…':'Return order to production'}</button></form>:qualityCanInspect?<form onSubmit={event=>submitForm(event,'quality_review')}><div style={formGrid}><label style={field}>Inspection decision<select name="decision" required defaultValue="PASS" style={input}><option value="PASS">Pass · release order</option><option value="REWORK">Rework · return to production</option><option value="FAIL">Fail · place on quality hold</option></select></label><label style={{...field,gridColumn:'span 2'}}>Inspection evidence<textarea name="evidence" required minLength={5} maxLength={2000} rows={3} placeholder="Record the inspection evidence against your approved quality criteria" style={input}/></label><button style={button} disabled={busy}>{busy?'Recording…':'Record quality decision'}</button></div></form>:<p className="clinical-notice">{!order.costedAt?'Complete costing before the final quality inspection.':lastStage?latestReview?'Record a new passing production stage after the latest rework review before inspection.':'The most recent production stage must pass before final inspection.':'Record a production stage before final inspection can begin.'}</p>}
  </section>}  <details style={{marginTop:12}}><summary>Manufacturing order history</summary>{order.activity.length?<ol>{order.activity.map(entry=><li key={entry.id}>{stamp(entry.createdAt)} · {entry.actorName} ({entry.actorRole}) · {entry.action.replaceAll('_',' ')}{Object.keys(entry.detail).length?` · ${JSON.stringify(entry.detail)}`:''}</li>)}</ol>:<p>No operations history recorded yet.</p>}</details>
 </article>;
}
