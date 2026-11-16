"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import AuthFrame from "../components/auth-frame";
const fields = [
 { name: "fullName", label: "Doctor full name", type: "text", autoComplete: "name", min: 2 },
 { name: "clinicName", label: "Current practice / clinic (optional)", type: "text", autoComplete: "organization", min: undefined },
 { name: "email", label: "Email address", type: "email", autoComplete: "email", min: undefined },
 { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel", min: 7 },
 { name: "registrationAuthority", label: "Professional registration authority (if available)", type: "text", autoComplete: "organization", min: undefined },
 { name: "registrationNumber", label: "Professional registration number (if available)", type: "text", autoComplete: "off", min: undefined },
 { name: "password", label: "Password", type: "password", autoComplete: "new-password", min: 12 },
] as const;
export default function DoctorRegister() {
 const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false);
 const [hasRegistrationNumber, setHasRegistrationNumber] = useState(false);
 async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); if (loading) return; setLoading(true); setMessage(""); setSuccess(false);
  const form = e.currentTarget; const formData = new FormData(form);
  const data = Object.fromEntries(fields.map(field=>[field.name, String(formData.get(field.name) ?? "")]));
  try {
   const response = await fetch("/api/doctor-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
   const result = await response.json();
   if (!response.ok) { setMessage(result.message || "Registration failed. Please try again."); return; }
   setSuccess(true); setMessage(result.message || "Registration received. Your account is pending professional verification."); form.reset(); setHasRegistrationNumber(false);
  } catch { setMessage("Unable to connect to the server. Please try again."); } finally { setLoading(false); }
 }
 return <AuthFrame register><form className="form-stack" onSubmit={handleSubmit}><div className="form-grid">{fields.map(field=><label key={field.name} htmlFor={field.name}>{field.label}<input id={field.name} name={field.name} type={field.type} required={!['clinicName','registrationAuthority','registrationNumber'].includes(field.name)||(field.name==='registrationAuthority'&&hasRegistrationNumber)} minLength={field.min} maxLength={field.name==='password'?72:undefined} autoComplete={field.autoComplete} onChange={field.name==='registrationNumber'?event=>setHasRegistrationNumber(Boolean(event.target.value.trim())):undefined} placeholder={field.name === "password" ? "At least 12 characters" : field.name === "registrationNumber" || field.name === "registrationAuthority" || field.name === "clinicName" ? "Optional" : field.label}/>{field.name === "registrationAuthority"&&<small>Required when you enter a registration number. This may be a national or regional dental / medical council.</small>}{field.name === "registrationNumber"&&<small>If you do not have a number, leave this blank. Allen will manually review other professional evidence before activation.</small>}</label>)}</div><p className="fine-print">Registration creates a pending professional account. It does not create or link a clinic. Authorized HR staff verify your professional status; after approval, you can register a clinic or accept an invitation from its administrator.</p><button className="button full" disabled={loading}>{loading ? "Submitting registration…" : "Submit for professional verification →"}</button></form>{message && <p className={success ? "notice" : "notice error"} role={success ? "status" : "alert"}>{message}</p>}<p className="auth-switch">Already registered? <Link href="/doctor-login">Doctor login</Link></p></AuthFrame>;
}
