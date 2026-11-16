"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function OwnerLoginPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Owner sign-in failed.");
      window.location.assign(result.redirectTo || "/owner/command-center");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container auth-layout">
      <aside className="auth-story">
        <span className="eyebrow">ALLEN ALIGNER · OWNER PORTAL</span>
        <h1>Business<br />oversight.<br /><em>Connected.</em></h1>
        <p>Owner access is invitation-only and managed through the existing Owner account system.</p>
      </aside>
      <section className="auth-form">
        <span className="eyebrow">SECURE OWNER ACCESS</span>
        <h2>Owner sign in</h2>
        <p>Use the Owner ID issued when your invited account was activated.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>Owner ID<input name="ownerId" required pattern="AA-OWN-[A-Fa-f0-9]{10}" autoComplete="username" maxLength={18} disabled={busy} /></label>
          <label>Password<input name="password" type="password" required maxLength={72} autoComplete="current-password" disabled={busy} /></label>
          <button className="button full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to Owner Command Center"}</button>
        </form>
        {message && <p className="notice" role="alert">{message}</p>}
        <p className="auth-switch"><Link href="/owner-register">Activate an HR invitation</Link> · <Link href="/owner-password-reset">Reset Owner password</Link></p>
      </section>
    </main>
  );
}
