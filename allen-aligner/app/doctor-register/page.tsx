"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import AuthFrame from "../components/auth-frame";
const fields = [
 { name: "fullName", label: "Doctor full name", type: "text", autoComplete: "name", min: 2 },
 { name: "clinicName", label: "Clinic / hospital", type: "text", autoComplete: "organization", min: 2 },
 { name: "email", label: "Email address", type: "email", autoComplete: "email", min: undefined },
 { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel", min: 7 },
 { name: "registrationNumber", label: "Professional registration number", type: "text", autoComplete: "off", min: 3 },
 { name: "password", label: "Password", type: "password", autoComplete: "new-password", min: 12 },
] as const;
export default function DoctorRegister() {
 const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false);
 async function handleSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); if (loading) return; setLoading(true); setMessage(""); setSuccess(false);
  const form = e.currentTarget; const formData = new FormData(form);
  const data = Object.fromEntries(fields.map(field=>[field.name, String(formData.get(field.name) ?? "")]));
  try {
   const response = await fetch("/api/doctor-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
   const result = await response.json();
   if (!response.ok) { setMessage(result.message || "Registration failed. Please try again."); return; }
   setSuccess(true); setMessage("Registration received! Your account is pending verification."); form.reset();
  } catch { setMessage("Unable to connect to the server. Please try again."); } finally { setLoading(false); }
 }
 return <AuthFrame register><form className="form-stack" onSubmit={handleSubmit}><div className="form-grid">{fields.map(field=><label key={field.name} htmlFor={field.name}>{field.label}<input id={field.name} name={field.name} type={field.type} required minLength={field.min} autoComplete={field.autoComplete} placeholder={field.name === "password" ? "At least 12 characters" : field.label}/></label>)}</div><p className="fine-print">Registration submits your professional details for verification. Approval and email verification workflows are not yet available.</p><button className="button full" disabled={loading}>{loading ? "Submitting registration…" : "Register your practice →"}</button></form>{message && <p className={success ? "notice" : "notice error"} role="status">{message}</p>}<p className="auth-switch">Already registered? <Link href="/doctor-login">Doctor login</Link></p></AuthFrame>;
}
