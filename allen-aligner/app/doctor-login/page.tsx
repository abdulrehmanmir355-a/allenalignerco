"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";

import AuthFrame from "../components/auth-frame";
export default function DoctorLogin() {

 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [message, setMessage] = useState("");
 const [loading, setLoading] = useState(false);
 const [show, setShow] = useState(false);
 async function handleLogin(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); if (loading) return; setLoading(true); setMessage("");
  try {
   const response = await fetch("/api/doctor-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
   const result = await response.json();
   if (response.ok && result.success) { window.location.assign("/doctor-dashboard"); return; }
   setMessage(result.message || "Unable to verify login.");
  } catch { setMessage("Connection error. Please try again."); } finally { setLoading(false); }
 }
 return <AuthFrame><form onSubmit={handleLogin} className="form-stack"><label htmlFor="email">Email address<input id="email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="doctor@example.com"/></label><label htmlFor="password">Password<div className="password-field"><input id="password" type={show ? "text" : "password"} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password"/><button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={()=>setShow(!show)}>{show ? "Hide" : "Show"}</button></div></label><button className="button full" disabled={loading}>{loading ? "Checking credentials…" : "Sign in →"}</button></form>{message && <p className="notice" role="status">{message}</p>}<p className="auth-switch"><Link href="/doctor-password-reset-request">Forgot password? Request a reset</Link></p><p className="fine-print">Verified doctors can access their private clinic cases. Sessions expire after eight hours.</p><p className="auth-switch">New to Allen Aligner? <Link href="/doctor-register">Register your practice</Link></p><Link className="text-link" href="/doctor-dashboard">Open doctor workspace →</Link></AuthFrame>;
}
