"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
export default function HRRegister() {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[success,setSuccess]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(busy)return;const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form));setMessage("");setSuccess(false);
  if(data.password!==data.confirmPassword){setMessage("Passwords do not match.");return;}
  setBusy(true);
  try{const response=await fetch("/api/hr/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.message||"Registration could not be completed.");setSuccess(true);setMessage(result.message);form.reset();}
  catch(error){setMessage(error instanceof Error?error.message:"Unable to connect. Please try again.");}finally{setBusy(false);}
 }
 return <main className="container auth-layout"><aside className="auth-story"><span className="eyebrow">ALLEN ALIGNER · HUMAN RESOURCES</span><h1>Our people.<br/>One connected<br/><em>workspace.</em></h1><p>Request access to Allen’s HR workspace.</p><div className="auth-benefits"><p><span>01</span> Register your details</p><p><span>02</span> Await authorization</p><p><span>03</span> Sign in to HR</p></div></aside><section className="auth-form"><span className="eyebrow">HR ACCESS REQUEST</span><h2>HR Registration</h2><p>Create your account. Access begins after approval.</p><form className="form-stack" onSubmit={submit}><label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={150} disabled={busy}/></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy}/></label><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy}/></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy}/></label><p className="fine-print">Use at least 12 characters. Registration does not grant immediate access to employee records.</p><button className="button full" disabled={busy}>{busy?"Submitting…":"Submit registration"}</button></form>{message&&<p className="notice" role={success?"status":"alert"}>{message}</p>}<p className="auth-switch">Already registered? <Link href="/hr/login">HR Login</Link></p></section></main>;
}
