"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import "../employee-access/identity.css";

type Invite = { id: string; fullName: string; email: string; issuedByEmail: string; issuedAt: string; expiresAt: string; activatedAt: string | null; revokedAt: string | null; ownerId: string | null; state: string };
type Event = { id: number; actorEmail: string; action: string; invitationId: string | null; detail: { recipientEmail?: string; reason?: string }; createdAt: string };
type Data = { actor: { role: string }; invitations: Invite[]; events: Event[] };
type Secret = { token: string; email: string; expiresAt: string };
const date = (value: string) => new Date(value).toLocaleString();

export default function OwnerInvitationManagement() {
  const [data, setData] = useState<Data | null>(null), [secret, setSecret] = useState<Secret | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/hr/owner-invitations", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load Owner invitations.");
    setData(result);
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void load().catch(error => setMessage(error.message)); }, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { if (!secret) return; const timer = setTimeout(() => setSecret(null), Math.max(0, new Date(secret.expiresAt).getTime() - Date.now())); return () => clearTimeout(timer); }, [secret]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    setBusy(true); setMessage(""); setSecret(null);
    try {
      const response = await fetch("/api/hr/owner-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "issue", ...values }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not issue the code.");
      setSecret({ token: result.token, email: values.email.toString(), expiresAt: result.expiresAt });
      setMessage("Invitation code created. Copy it now; it will not be shown again."); form.reset(); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to issue the code."); }
    finally { setBusy(false); }
  }
  async function revoke(invitationId: string) {
    const reason = window.prompt("Why are you revoking this Owner invitation? (At least 5 characters)");
    if (!reason) return;
    setBusy(true); setMessage(""); setSecret(null);
    try { const response = await fetch("/api/hr/owner-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", invitationId, reason }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || "Could not revoke invitation."); setMessage("Invitation revoked."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to revoke invitation."); }
    finally { setBusy(false); }
  }
  return <main className="identity">
    <header className="identity-header"><div><p className="eyebrow">ALLEN ALIGNER / HUMAN RESOURCES</p><h1>Owner registration invitations</h1><p>HR members may issue one-use Owner codes. Each code expires after 24 hours.</p></div><div><Link href="/hr/password-recovery">Password recovery →</Link> · <Link href="/hr/offboarding/dashboard">HR workspace →</Link></div></header>
    <section className="identity-card invitation-process"><h2>Issue an Owner registration code</h2><p>Verify the recipient first. The code grants Owner portal access and must be shared privately.</p>
      <form className="form-stack" onSubmit={submit}><label>Owner full name<input name="fullName" required minLength={2} maxLength={150} disabled={busy}/></label><label>Owner email<input name="email" type="email" required maxLength={254} disabled={busy}/></label><label>Reason for issuing<input name="reason" required minLength={5} maxLength={1000} disabled={busy}/></label><button className="button" disabled={busy}>{busy ? "Working…" : "Issue one-time code"}</button></form>
    </section>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {secret && <section className="identity-card"><h2>Share this code privately</h2><p>{secret.email} · expires {date(secret.expiresAt)}</p><code className="activation-secret" style={{ display: "block", overflowWrap: "anywhere" }}>{secret.token}</code><p>It is displayed once, stored only as a hash, and usable for one registration.</p><Link href="/owner-register">Owner registration page →</Link></section>}
    <section className="identity-card"><h2>Issued invitations</h2><button type="button" disabled={busy} onClick={() => void load().catch(error => setMessage(error.message))}>Refresh</button><div style={{ overflowX: "auto" }}><table><thead><tr><th>Owner</th><th>Email</th><th>Status</th><th>Issued by</th><th>Expires</th><th>Action</th></tr></thead><tbody>{data?.invitations.map(item => <tr key={item.id}><td>{item.ownerId || item.fullName}</td><td>{item.email}</td><td>{item.state}</td><td>{item.issuedByEmail}</td><td>{date(item.expiresAt)}</td><td>{item.state === "PENDING" && data.actor.role !== "HR_VIEWER" && <button type="button" disabled={busy} onClick={() => void revoke(item.id)}>Revoke</button>}</td></tr>)}</tbody></table></div></section>
    <section className="identity-card"><h2>Recent audit events</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>When</th><th>Action</th><th>HR member</th><th>Recipient</th><th>Reason</th></tr></thead><tbody>{data?.events.map(event => <tr key={event.id}><td>{date(event.createdAt)}</td><td>{event.action}</td><td>{event.actorEmail}</td><td>{event.detail?.recipientEmail || "—"}</td><td>{event.detail?.reason || "—"}</td></tr>)}</tbody></table></div></section>
  </main>;
}
