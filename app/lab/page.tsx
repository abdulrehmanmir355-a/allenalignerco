"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { canPublishPlan, labTransitions } from "../lib/lab-workflow";
import LargeClinicalUpload from "../components/large-clinical-upload";
import ProductionQualityControl from "../components/production-quality-control";
type PlanFile = {id:string;kind:"standard"|"large";name:string};
type LabPlan = {id:string;version:number;summary:string;decision:string;changeSummary:string;createdAt:string;createdByRole:string|null;authorName:string|null;parentPlanId:string|null;approvedByDoctorId:string|null;approvedAt:string|null;fileReferences:PlanFile[]};
type LabCase = { preparationIdentity:{id:string;employeeId:string;name:string}|null; id: string; patientReference: string; category: string; notes: string; status: string; revision: number; plans: LabPlan[]; messages: { id: string; author: string; kind: string; text: string; createdAt: string }[]; events: { id: string; label: string; createdAt: string }[]; files: { id: string; name: string; size: number }[] };
export default function LabWorkspace() {
  const [authorizationToken,setAuthorizationToken]=useState('');
  const [record, setRecord] = useState<LabCase | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const access = useRef<{ id: string; token: string } | null>(null), lock = useRef(false);
  async function request(path: string, body?: object) {
    if (!access.current) throw new Error("Enter your assigned case credentials.");
    const r = await fetch(`/api/lab/cases/${encodeURIComponent(access.current.id)}${path}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${access.current.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { const data = await r.json(); if ([401,403,404].includes(r.status)) { access.current = null; setAuthorizationToken('');setRecord(null); } throw new Error(data.message || "Unable to complete request."); }
    return r;
  }
  const activeLabCaseId=record?.id;
  useEffect(() => {
    const caseId=activeLabCaseId;
    if(!caseId)return;
    let refreshing=false;
    const timer=window.setInterval(async()=>{
      const current=access.current;
      if(refreshing||document.visibilityState!=='visible'||!current||current.id!==caseId)return;
      refreshing=true;
      try{
        const response=await fetch(`/api/lab/cases/${encodeURIComponent(caseId)}`,{cache:'no-store',headers:{Authorization:`Bearer ${current.token}`}});
        if(!response.ok){if([401,403,404].includes(response.status)){access.current=null;setAuthorizationToken('');setRecord(null);}throw new Error('Case access expired. Reopen the assigned case.');}
        setRecord(await response.json());
      }catch(error){setError(error instanceof Error?error.message:'Unable to refresh case messages.');}
      finally{refreshing=false;}
    },3000);
    return()=>window.clearInterval(timer);
  },[activeLabCaseId]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Connection interrupted. Refresh before retrying."); }
    finally { lock.current = false; setBusy(false); }
  }
  const communicationHistory=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=communicationHistory.current;if(el)el.scrollTop=el.scrollHeight;},[record?.messages.length]);
  async function connect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form); const caseId = String(data.get("caseId") ?? "").trim(); if (caseId.includes("@")) { setError("Enter the assigned Case ID, not your email address. Ask the Owner for laboratory case access."); return; } if (/^AA-EMP-/i.test(caseId)) { setError("This is an Employee ID. Enter the assigned Laboratory Case ID."); return; }
    await run(async () => { const token=String(data.get("token")).trim();access.current = { id: String(data.get("caseId")).trim(), token };setAuthorizationToken(token); setRecord(await (await request("")).json()); form.reset(); });
  }
  async function update(body: object, form?: HTMLFormElement) {
    await run(async () => { await request("", { ...body, revision: record!.revision }); form?.reset(); setMessage("Update saved."); setRecord(await (await request("")).json()); });
  }
  return <main style={{ padding: "32px 5%", maxWidth: 1200, margin: "auto" }}><h1>Laboratory workspace</h1><p>Open only the case assigned to you. Access expires and can be revoked by the operator.</p><p>Ask the Owner for your Case ID and case access token. The token is separate from your account password.</p><p><Link href="/production">Owner: issue or change laboratory access</Link> · <Link href="/owner/command-center">Owner Command Center</Link></p>
    {error && <p role="alert" className="notice">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
    {!record ? <section className="panel padded narrow"><form className="form-stack" onSubmit={connect}><label>Assigned case ID<input name="caseId" required maxLength={100} autoComplete="off" placeholder="Case ID provided by the Owner" /></label><label>Case access token<input name="token" type="password" required pattern="[a-f0-9]{64}" autoComplete="off" placeholder="64-character token provided by the Owner" /></label><button className="button" disabled={busy}>{busy ? "Openingâ€¦" : "Open assigned case"}</button></form></section> : <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 12 }}><button disabled={busy} onClick={() => void run(async () => setRecord(await (await request("")).json()))}>Refresh case</button><button disabled={busy} onClick={() => { access.current = null;setAuthorizationToken(''); setRecord(null); setError(""); setMessage(""); }}>Close case</button></div>
      <section className="panel padded"><h2>{record.patientReference}</h2><p>{record.category} Â· {record.status.replaceAll("_", " ")}</p><p style={{ whiteSpace: "pre-wrap" }}>{record.notes}</p><h3>Private case files</h3>{!record.files.length && <p>No files.</p>}<ul>{record.files.map(f => <li key={f.id}><button disabled={busy} onClick={() => void run(async () => { const r = await request(`/files/${encodeURIComponent(f.id)}`); const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = f.name.replace(/[\\/]/g, "_"); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })}>{f.name} ({Math.ceil(f.size / 1024)} KB)</button></li>)}</ul></section>
      <section className="panel padded"><h2>Treatment plan versions</h2>
        <div className="notice">{record.preparationIdentity?<p>Preparing as <strong>{record.preparationIdentity.name}</strong>. A different qualified clinician must review each version before it reaches the doctor.</p>:<p>Plan submission requires your internal employee login in addition to this case grant. <a href="/employee/login" target="_blank" rel="noreferrer">Sign in as the preparer â†—</a>, then refresh this case. A case access token alone cannot identify the preparer.</p>}</div>
        <p>Each submission creates a permanent, sequential version. Older versions remain available; restoring one creates a new revision and sends it through review again.</p>
        {!record.plans.length && <p>No written plan published.</p>}
        {[...record.plans].sort((a,b) => b.version-a.version).map(p => <article className="plan-version" key={p.id}>
          <h3>Version {p.version} Â· {p.decision.replaceAll("_"," ")}{p.decision==="APPROVED"?" Â· Doctor-approved version":""}</h3>
          <p><strong>Change summary:</strong> {p.changeSummary||"No change summary was recorded for this legacy version."}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.summary}</p>
          <small>{p.authorName||"Original author not recorded"} Â· {p.createdByRole||"Legacy version"} Â· {new Date(p.createdAt).toLocaleString()}</small>
          {p.parentPlanId&&<p>Based on plan {p.parentPlanId}; this version requires its own approvals.</p>}
          {p.approvedAt&&<p>Approved by the responsible doctor Â· {new Date(p.approvedAt).toLocaleString()}</p>}
          <h4>Files bound to this version</h4>
          {!p.fileReferences.length&&<p>No file references were captured for this version.</p>}
          <ul>{p.fileReferences.map(f=><li key={`${f.kind}:${f.id}`}><button type="button" disabled={busy} onClick={()=>void run(async()=>{const r=await request(`/${f.kind==="large"?"large-files":"files"}/${encodeURIComponent(f.id)}`);const url=URL.createObjectURL(await r.blob());const a=document.createElement("a");a.href=url;a.download=f.name.replace(/[\\/]/g,"_");a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>{f.name} Â· secure {f.kind} file</button></li>)}</ul>
          {canPublishPlan(record.status)&&p.id!==record.plans[0]?.id&&<details><summary>Restore as a new version</summary>
            <form className="form-stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void update({action:"restore",sourcePlanId:p.id,changeSummary:String(new FormData(form).get("changeSummary"))},form);}}>
              <label>Reason for restoring this version<textarea name="changeSummary" required minLength={5} maxLength={1000}/></label>
              <button className="button" disabled={busy||!record.preparationIdentity}>Create next version from v{p.version}</button>
            </form>
          </details>}
        </article>)}
        {canPublishPlan(record.status) && <form className="form-stack" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; void update({ action: "plan", summary: String(new FormData(form).get("summary")), changeSummary:String(new FormData(form).get("changeSummary")) }, form); }}>
          <h3>Submit a new plan version</h3>
          <label>Change summary<textarea name="changeSummary" required minLength={5} maxLength={1000} rows={3} placeholder="Describe what changed from the previous version." /></label>
          <label>Specialist platform plan summary<textarea name="summary" required minLength={10} maxLength={10000} rows={6} placeholder="Platform and plan version; setup and staging notes; IPR and attachment decisions; transition-model and manufacturing preparation." /></label>
          <button className="button" disabled={busy||!record.preparationIdentity}>Submit next version for independent clinical review</button>
        </form>}
        {(labTransitions[record.status] || []).map(status => <button className="button" key={status} disabled={busy} onClick={() => void update({ action: "status", status })}>Move to {status.replaceAll("_", " ")}</button>)}
        <p>After completing the external setup, record the platform, setup/staging notes, IPR and attachment decisions, and manufacturing preparation. Only the current version can complete internal review and doctor approval before manufacturing.</p>
      </section>
      <ProductionQualityControl caseId={record.id} token={authorizationToken}/>
      <section className="panel padded"><h2>Doctor and laboratory chat</h2><p>Messages appear here automatically while the case is open. This chat is private to the treating doctor, the lab assigned to this case and authorized internal reviewers.</p>
        <div ref={communicationHistory} aria-label="Doctor and laboratory messages" aria-live="polite" style={{maxHeight:'min(62vh,620px)',overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:10,background:'#efeae2',borderRadius:14,scrollBehavior:'smooth'}}>
          {!record.messages.length&&<p style={{alignSelf:'center',padding:'18px 22px',borderRadius:12,background:'#fff',color:'#52666b'}}>No messages yet. Start the chat with the doctor.</p>}
          {record.messages.map(message=>{const fromLab=message.author.startsWith('Lab:');return <article key={message.id} style={{alignSelf:fromLab?'flex-end':'flex-start',maxWidth:'min(84%,620px)',padding:'10px 13px 8px',borderRadius:fromLab?'14px 14px 4px 14px':'14px 14px 14px 4px',background:fromLab?'#d9fdd3':'#fff',boxShadow:'0 1px 1px #00000012',overflowWrap:'anywhere'}}><header style={{display:'flex',justifyContent:'space-between',gap:16,fontSize:12,color:'#34535b'}}><strong>{fromLab?'Laboratory':message.author}</strong><time>{new Date(message.createdAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></header><p style={{whiteSpace:'pre-wrap',lineHeight:1.55,margin:'7px 0 2px'}}>{message.text}</p></article>;})}
        </div>
        <form className="form-stack" onSubmit={e => { e.preventDefault(); const form=e.currentTarget; void update({ action: "comment", text: String(new FormData(form).get("text")) }, form); }}><label>Message to doctor<textarea name="text" required maxLength={5000} rows={3} placeholder="Write a message…" /></label><button className="button" disabled={busy}>{busy?'Sending…':'Send message'}</button></form>
      </section>
      <section className="panel padded"><h2>Specialist planning deliverables</h2><p>Return transition models, manufacturing preparation files and reports from the specialist platform to this case. Files are versioned and available to the doctor and authorized clinical reviewers.</p>
        <LargeClinicalUpload action={`/api/lab/cases/${encodeURIComponent(record.id)}/large-uploads`} canUpload={['SUBMITTED', 'PLANNING', 'REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'IN_PRODUCTION'].includes(record.status)} authorizationToken={authorizationToken||undefined} onUploadComplete={() => { void run(async () => setRecord(await (await request("")).json())); }} />
      </section>
    </div>}
  </main>;
}
