"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function OwnerRegisterPage() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [ownerId, setOwnerId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); setBusy(true); setMessage("");
    try { const response = await fetch("/api/owner/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Registration could not be completed."); setOwnerId(result.ownerId); setMessage(result.message); form.reset(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to register. Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="container auth-layout"><aside className="auth-story"><span className="eyebrow">ALLEN ALIGNER · OWNER PORTAL</span><h1>Business<br/>oversight.<br/><em>Connected.</em></h1><p>Owner access is invitation-only and managed by HR.</p><div className="auth-benefits"><p><span>01</span> Enter your HR-issued code</p><p><span>02</span> Create your password</p><p><span>03</span> Sign in using your Owner ID</p></div></aside><section className="auth-form"><span className="eyebrow">OWNER ACCESS</span><h2>Owner registration</h2><p>Public signup is disabled. Use the one-time code issued to your email by HR.</p>
    {!ownerId ? <form className="form-stack" onSubmit={submit}><label>Full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={150} disabled={busy}/></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy}/></label><label>HR invitation code<input name="token" autoComplete="one-time-code" required minLength={64} maxLength={64} pattern="[a-fA-F0-9]{64}" disabled={busy}/></label><label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy}/></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} disabled={busy}/></label><button className="button full" disabled={busy}>{busy ? "Registering…" : "Create Owner account"}</button></form> : <section role="status"><p>{message}</p><p>Your Owner ID: <strong style={{ userSelect: "all" }}>{ownerId}</strong></p><p>Save this ID. It is required to sign in.</p><Link className="button" href="/owner-login">Go to Owner sign in →</Link></section>}
    {!ownerId && message && <p className="notice" role="alert">{message}</p>}<p className="auth-switch">Already registered? <Link href="/owner-login">Owner sign in</Link></p></section></main>;
}
