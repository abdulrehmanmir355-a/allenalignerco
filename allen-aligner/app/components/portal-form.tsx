"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export default function PortalForm({ action, children, label = "Save", multipart = false }: { action: string; children: ReactNode; label?: string; multipart?: boolean }) {
 const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
 async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault(); if (busy) return; setBusy(true); setMessage(""); const form = event.currentTarget;
  const data = new FormData(form);
  try {
   const response = await fetch(action, { method: "POST", headers: multipart ? undefined : { "Content-Type": "application/json" }, body: multipart ? data : JSON.stringify(Object.fromEntries(data)) });
   const result = await response.json();
   if (!response.ok) { setMessage(result.message || "Unable to save."); return; }
   form.reset(); setMessage(result.message || "Saved.");
   if (result.redirect && (action === "/api/clinic/auth/login" || action.startsWith("/api/account/"))) { window.location.assign(result.redirect); return; }
   if (result.redirect) router.push(result.redirect); router.refresh();
  } catch { setMessage("Connection interrupted. Refresh to check whether your change was saved before retrying."); } finally { setBusy(false); }
 }
 return <form onSubmit={submit} className="form-stack"><fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="form-stack">{children}<button className="button" disabled={busy}>{busy ? "Saving…" : label}</button></div></fieldset>{message && <p className="notice" role="status">{message}</p>}</form>;
}
