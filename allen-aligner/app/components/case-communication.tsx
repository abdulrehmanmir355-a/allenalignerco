'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { CaseMessageView, Conversation } from '../lib/case-communication';
import styles from './case-communication-styles';

const labels:Record<string,string>={UPDATE:'Case update',QUESTION:'Question',STATUS_NOTE:'Status note',comment:'Case message',approve:'Plan approval',adjustment:'Modifications requested',reject:'Plan rejected',clinical_revision:'Clinical feedback'};
function time(value:string){return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'})+' PKT';}
function merge(existing:CaseMessageView[],incoming:CaseMessageView[]){return [...new Map([...existing,...incoming].map(m=>[m.id,m])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}

export default function CaseCommunication({initial,mode}:{initial:Conversation;mode:'doctor'|'internal'}){
 const [data,setData]=useState(initial),[text,setText]=useState(''),[kind,setKind]=useState('UPDATE'),[audience,setAudience]=useState(mode==='doctor'?'CASE':'DOCTOR_INTERNAL'),[planId,setPlanId]=useState(''),[file,setFile]=useState(''),[reply,setReply]=useState<CaseMessageView|null>(null),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const endpoint=`/api/${mode==='doctor'?'portal':'clinical'}/cases/${encodeURIComponent(initial.case.id)}/communication`;
 const caseUrl=mode==='doctor'?`/doctor-dashboard/cases/${encodeURIComponent(initial.case.id)}`:`/clinical/cases/${encodeURIComponent(initial.case.id)}`;
 const inbox=mode==='doctor'?'/doctor-dashboard/communication':'/clinical/communications';
 const pending=useRef<{key:string;payload:string}|null>(null),sending=useRef(false),alive=useRef(true);
 const history=useRef<HTMLDivElement>(null),atEnd=useRef(true);
 useEffect(()=>{if(atEnd.current&&history.current)history.current.scrollTop=history.current.scrollHeight;},[data.messages]);
 const current=useRef(initial);
 useEffect(()=>{current.current=data;},[data]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  let after=current.current.messages.at(-1)?.id;
  for(let page=0;page<10;page++){
   const r=await fetch(endpoint+(after?'?after='+encodeURIComponent(after):''),{cache:'no-store',signal});const next=await r.json();if(!r.ok){if([401,403,404].includes(r.status))setData(d=>({...d,messages:[]}));throw new Error(next.message||'Unable to refresh conversation.');}
   if(alive.current)setData(d=>({...next,messages:merge(d.messages,next.messages),hasMore:d.messages.length?d.hasMore:next.hasMore}));
   if(!after||!next.hasMore||!next.messages.length)break;after=next.messages.at(-1).id;
  }
 },[endpoint]);
 useEffect(()=>{const controller=new AbortController();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(controller.signal).catch(e=>{if(!controller.signal.aborted&&alive.current)setError(e.message);});},3000);return()=>{controller.abort();clearInterval(timer);};},[refresh]);
 async function older(){if(loading||!data.messages.length)return;atEnd.current=false;setLoading(true);setError('');try{const r=await fetch(endpoint+'?before='+encodeURIComponent(data.messages[0].id),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.message);setData(current=>({...current,messages:merge(d.messages,current.messages),hasMore:d.hasMore}));}catch(e){setError(e instanceof Error?e.message:'Unable to load earlier history.');}finally{setLoading(false);}}
 async function send(event:FormEvent<HTMLFormElement>){event.preventDefault();if(sending.current)return;sending.current=true;setBusy(true);setError('');setNotice('');
  const attachment=file?{kind:file.slice(0,file.indexOf(':')),id:file.slice(file.indexOf(':')+1)}:undefined;
  const body={text:text.trim(),kind,audience:mode==='doctor'?audience:'DOCTOR_INTERNAL',...(planId?{planId}:{}),...(reply?{replyToId:reply.id}:{}),...(attachment?{attachment}:{})};const serialized=JSON.stringify(body);
  if(!pending.current||pending.current.payload!==serialized)pending.current={key:crypto.randomUUID(),payload:serialized};
  try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,clientRequestId:pending.current.key})});const d=await r.json();if(!r.ok)throw new Error(d.message||'Message could not be sent.');
   // Clear only after a confirmed send. A network retry retains the same idempotency key.
   pending.current=null;atEnd.current=true;setText('');setReply(null);setFile('');setNotice(d.duplicate?'Your message was already saved.':'Message sent to the case conversation.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Connection interrupted. Retry the same message to check delivery without duplicating it.');}finally{sending.current=false;setBusy(false);}}
 const visible=data.messages.filter(m=>!search||`${m.text} ${m.author} ${labels[m.kind]||m.kind}`.toLowerCase().includes(search.toLowerCase()));
 const fromDoctor=(m:CaseMessageView)=>m.senderRole==='DOCTOR'||(m.senderRole!=='INTERNAL'&&!m.author.startsWith('Lab:')&&m.kind!=='clinical_revision'&&m.author!=='Internal Clinical Review');
 const canReply=(m:CaseMessageView)=>mode==='internal'?m.audience==='CASE'&&(fromDoctor(m)||m.author.startsWith('Lab:')):m.senderRole==='INTERNAL'||m.author.startsWith('Lab:')||m.kind==='clinical_revision'||m.author==='Internal Clinical Review';
 const fileUrl=(m:CaseMessageView)=>mode==='doctor'?(m.fileKind==='standard'?`/api/portal/files/${encodeURIComponent(m.fileId!)}`:`/api/portal/cases/${encodeURIComponent(data.case.id)}/large-uploads/files/${encodeURIComponent(m.fileId!)}`):`/api/clinical/cases/${encodeURIComponent(data.case.id)}/files/${m.fileKind}/${encodeURIComponent(m.fileId!)}`;
 return <div className={styles.workspace} data-aa-spinner-off="true">
  <header className={styles.header}><Link href={inbox}>← Case Communication</Link><p className={styles.eyebrow}>{mode==='doctor'?'Doctor ↔ assigned clinical contact':'Doctor ↔ Allen internal team'}</p><h1>{data.case.patientReference}</h1><p>One case conversation. Other doctors cannot see this case's messages.</p><p>{data.case.assignedToName?`Assigned clinical contact: ${data.case.assignedToName}${data.case.assignedToRole?' · '+data.case.assignedToRole:''}`:'Waiting for a Clinical Lead to assign a case contact.'}</p><div className={styles.meta}><span className={styles.badge}>{data.case.status.replaceAll('_',' ')}</span><span>Case {data.case.id}</span></div></header>
  <div className={styles.layout}><section className={styles.thread} aria-label="Case conversation"><div className={styles.toolbar}><h2>Case conversation</h2><button className={styles.secondary} type="button" disabled={loading||busy} onClick={()=>{setLoading(true);void refresh().then(()=>{setError('');setNotice('Conversation refreshed.');}).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Refresh</button><input aria-label="Search loaded messages" placeholder="Search loaded history" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <p className={styles.notice}>{mode==='doctor'?'Choose whether each message goes to the assigned lab and case team, or stays with Allen internal staff. Only the assigned lab can access its case messages. New messages appear automatically.':'New messages appear automatically while this chat is open. Messages marked for the laboratory are visible to the lab assigned to this case.'}</p>
   {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
   <div ref={history} className={styles.history} aria-label="Message history" onScroll={e=>{const el=e.currentTarget;atEnd.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>{data.hasMore&&<button type="button" className={styles.secondary} disabled={loading} onClick={()=>void older()}>{loading?'Loading history…':'Load earlier messages'}</button>}
    {!visible.length&&<p className={styles.empty}>{search?'No matching messages in the loaded history.':'Start the conversation for this case. Ask a question or send an update to keep the team aligned.'}</p>}
    {visible.map(m=><article key={m.id} className={`${styles.message} ${m.senderId===data.viewer.id&&m.senderRole===data.viewer.role?styles.mine:''}`}><header><strong>{m.author}</strong><span className={styles.badge}>{m.author.startsWith('Lab:')?'Laboratory':m.senderRole==='DOCTOR'?'Doctor':m.senderRole==='INTERNAL'?'Allen team':'Case history'}</span><time dateTime={m.createdAt}>{time(m.createdAt)}</time></header>
     {m.replyToId&&<blockquote className={styles.quote}><strong>Reply to {m.replyAuthor}</strong><br/>{m.replyText}</blockquote>}<p>{m.text}</p>
     {m.fileId&&<p><a href={fileUrl(m)}>↗ {m.fileName||'Case document'}</a></p>}
     <footer><span>{labels[m.kind]||m.kind.replaceAll('_',' ')}</span>{mode==='doctor'&&<span>· {m.audience==='CASE'?'Visible to assigned laboratory':'Allen internal only'}</span>}{m.planVersion&&<span>· Plan v{m.planVersion}</span>}{m.statusAtSend&&<span>· {m.statusAtSend.replaceAll('_',' ')}</span>}{canReply(m)&&<button type="button" disabled={busy} onClick={()=>{setReply(m);document.getElementById('case-message-text')?.focus();}}>Reply</button>}</footer></article>)}
   </div>
   {mode==='internal'&&!reply&&<p className={styles.notice} role="status">Select <strong>Reply</strong> on a doctor or laboratory message shared with the case team to respond.</p>}
   <form className={styles.composer} onSubmit={send}><fieldset disabled={busy||(mode==='internal'&&!reply)}>{reply&&<div className={styles.quote}>Replying to {reply.author}: {reply.text.slice(0,180)} <button type="button" className={styles.secondary} onClick={()=>setReply(null)}>Cancel reply</button></div>}
    <div className={styles.fields}>{mode==='doctor'&&<label>Send message to<select value={audience} onChange={e=>setAudience(e.target.value)}><option value="CASE">Assigned laboratory and case team</option><option value="DOCTOR_INTERNAL">Allen internal team only</option></select></label>}<label>Message type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="UPDATE">Case update</option><option value="QUESTION">Question</option><option value="STATUS_NOTE">Status note</option></select></label><label>Plan context<select value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">General case conversation</option>{data.plans.map(p=><option key={p.id} value={p.id}>Released plan v{p.version}</option>)}</select></label></div>
    <label htmlFor="case-message-text">{mode==='doctor'?(audience==='CASE'?'Message to assigned laboratory':'Message to Allen team'):'Reply to the doctor and the laboratory'}</label><textarea id="case-message-text" required maxLength={5000} rows={4} placeholder={mode==='doctor'?'Ask about this case or clarify the treatment plan…':'Share a clear case update or answer the doctor question…'} value={text} onChange={e=>setText(e.target.value)}/>
    <label>Reference a case document<select value={file} onChange={e=>setFile(e.target.value)}><option value="">No document reference</option>{data.files.map(f=><option key={`${f.kind}:${f.id}`} value={`${f.kind}:${f.id}`}>{f.name}</option>)}</select></label>
    <p className={styles.subtle}>{kind==='STATUS_NOTE'?'Status notes record communication; change case status through the authorized case workflow.':'Shared case conversation. Keep private clinical observations in the internal review workspace.'}</p><footer><span>{text.length.toLocaleString()} / 5,000 characters</span><button type="submit" disabled={busy||!text.trim()}>{busy?'Sending…':'Send message'}</button></footer></fieldset></form>
  </section><aside className={styles.aside}><h2>Case context</h2><p><strong>Treating doctor</strong><br/>{data.case.doctorName}</p><p><strong>Clinic</strong><br/>{data.case.clinicName}</p><p className={styles.detail}><strong>Case reference</strong><br/>{data.case.id}</p><hr/><Link href={caseUrl}>Open case & documents ↗</Link><Link href={mode==='doctor'?caseUrl+'#case-timeline':caseUrl}>View case history ↗</Link><Link href={inbox}>Switch case conversation ↗</Link><p className={`${styles.subtle} ${styles.detail}`}>Messages are saved with this case. Sending a message does not approve a plan or release manufacturing.</p></aside></div>
 </div>;
}
