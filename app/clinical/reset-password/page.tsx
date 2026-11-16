'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import '../review.css';

export default function Page() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    const token = new URLSearchParams(window.location.search).get('token') || '';
    setBusy(true); setMessage(''); setSuccess(false);
    try {
      const response = await fetch('/api/clinical/password-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', token, password: input.password, confirmPassword: input.confirmPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to reset the password.');
      setSuccess(true); setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection interrupted. Please retry.');
    } finally { setBusy(false); }
  }
  return <main className="clinical" style={{ maxWidth: 680 }}>
    <h1>Reset password</h1>
    <p>Choose a new password. This does not approve or activate clinical access.</p>
    <section><form method="post" action="/clinical/reset-password" onSubmit={submit}><fieldset disabled={busy || success}><label>New password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label><label>Confirm password<input name="confirmPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label><button>{busy ? 'Please wait…' : 'Update password'}</button></fieldset></form>{message && <p className={success ? 'clinical-notice' : 'clinical-error'} role={success ? 'status' : 'alert'}>{message}</p>}<p><Link href="/clinical/login">Internal login</Link></p></section>
  </main>;
}
