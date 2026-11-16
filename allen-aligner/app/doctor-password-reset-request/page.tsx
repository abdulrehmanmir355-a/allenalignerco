"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import AuthFrame from "@/app/components/auth-frame";
export default function DoctorResetRequest() {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setMessage("");const form=e.currentTarget;const body=Object.fromEntries(new FormData(form));try{const res=await fetch("/api/doctor-password-reset-request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw new Error(data.message||"Request could not be sent.");setMessage(data.message);form.reset();}catch(err){setMessage(err instanceof Error?err.message:"Unable to send request.");}finally{setBusy(false);}}
  return <AuthFrame><h2>Request a password reset</h2><p>Enter the details registered to your verified doctor account.</p><form className="form-stack" onSubmit={submit}><label>Full name<input name="fullName" required minLength={2} maxLength={150}/></label><label>Registered email<input name="email" type="email" required maxLength={254}/></label><label>Registered phone number<input name="phone" type="tel" required minLength={7} maxLength={30}/></label><button className="button full" disabled={busy}>{busy?"Sending…":"Send request"}</button></form>{message&&<p className="notice" role="status">{message}</p>}<p className="auth-switch"><Link href="/doctor-password-recovery-complaint">Can’t remember these details? Send a complaint</Link></p><p className="auth-switch"><Link href="/doctor-login">Back to doctor login</Link></p></AuthFrame>;
}
