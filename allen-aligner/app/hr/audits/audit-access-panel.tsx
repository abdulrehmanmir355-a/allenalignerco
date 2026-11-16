'use client';
import { useEffect, useState, type FormEvent } from 'react';

type Account = { id: string; fullName: string; email: string; state: string; expiresAt: string | null };
type Data = { accounts: Account[]; events: { id: string; action: string; detail: { reason?: string }; createdAt: string; actorEmail: string; accountName: string }[] };
type Secret = { email: string; code: string; expiresAt: string };
const date = (value: string) => new Date(value).toLocaleString();

export default function AuditAccessPanel() {
  const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[secret,setSecret]=useState<Secret|null>(null);
  async function load() { const response=await fetch('/api/hr/audits/access',{cache:'no-store'}); const result=await response.json(); if(!response.ok)throw new Error(result.message); setData(result); }
  useEffect(()=>{const c=new AbortController();void fetch('/api/hr/audits/access',{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message);return d;}).then(setData).catch(e=>{if(!c.signal.aborted)setMessage(e instanceof Error?e.message:'Unable to load audit team access.');});return()=>c.abort();},[]);
  async function send(body:unknown,form?:HTMLFormElement){if(busy)return;setBusy(true);setMessage('');setSecret(null);try{const r=await fetch('/api/hr/audits/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw new Error(b.message);await load();if(b.code)setSecret({email:b.email,code:b.code,expiresAt:b.expiresAt});setMessage(b.message);form?.reset();}catch(e){setMessage(e instanceof Error?e.message:'Unable to save audit team access.');}finally{setBusy(false);}}
  function invite(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;void send({action:'invite',...Object.fromEntries(new FormData(form))},form);}
  return <main className="clinical" style={{maxWidth:1000,margin:'32px auto',padding:'0 20px'}}>
    <header><span className="clinical-eyebrow">HR · AUDIT TEAM ACCESS</span><h1>Audit team invitations</h1><p>HR Admins and Officers can issue one-time registration codes. Codes expire after 24 hours and are shown only once.</p><p><a href="/quality/audits">Back to Audit Management</a></p></header>
    {message&&<p className="clinical-notice" role="status">{message}</p>}
    {secret&&<section><h2>Share this code privately</h2><p>{secret.email} · Expires {date(secret.expiresAt)}</p><label>One-time registration code<input readOnly value={secret.code} onFocus={e=>e.currentTarget.select()}/></label><p>Send the invitee to <a href="/audit/register">Audit Team Registration</a>, then they can use <a href="/audit/login">Audit Login</a>.</p><button onClick={()=>setSecret(null)}>Hide code</button></section>}
    <section><h2>Invite an audit team member</h2><form onSubmit={invite}><fieldset disabled={busy}><label>Full name<input name="fullName" required minLength={2} maxLength={150}/></label><label>Email address<input name="email" type="email" required maxLength={254}/></label><label>Reason / audit assignment<textarea name="reason" required minLength={5} maxLength={1000}/></label><button>{busy?'Saving…':'Issue 24-hour invitation'}</button></fieldset></form></section>
    <section><h2>Audit team accounts</h2>{!data&&<p>Loading accounts…</p>}{data?.accounts.length===0&&<p>No audit team invitations yet.</p>}{data?.accounts.map(a=><article key={a.id}><h3>{a.fullName}</h3><p>{a.email} · {a.state}{a.expiresAt?` · Code expires ${date(a.expiresAt)}`:''}</p><form onSubmit={e=>{e.preventDefault();void send({accountId:a.id,...Object.fromEntries(new FormData(e.currentTarget))});}}><fieldset disabled={busy}><label>Access action<select name="action">{a.state==='ACTIVE'?<option value="suspend">Suspend access</option>:<><option value="replace">Issue replacement code</option>{a.state==='INVITED'&&<option value="revoke">Revoke invitation</option>}<option value="suspend">Suspend access</option></>}</select></label><label>Reason<textarea name="reason" required minLength={5} maxLength={1000}/></label><button>Save access action</button></fieldset></form></article>)}</section>
    <section><h2>Recent access history</h2>{data?.events.map(e=><p key={e.id}>{date(e.createdAt)} · {e.action.replaceAll('_',' ')} · {e.accountName} · {e.actorEmail}<br/>{e.detail.reason||''}</p>)}</section>
  </main>;
}
