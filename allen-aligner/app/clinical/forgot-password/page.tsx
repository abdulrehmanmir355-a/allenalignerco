'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import '../review.css';

export default function Page() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/clinical/password-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email: String(new FormData(event.currentTarget).get('email') || '') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to send the reset link.');
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection interrupted. Please retry.');
    } finally { setBusy(false); }
  }
  const [codeMessage, setCodeMessage] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (codeBusy) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setCodeBusy(true); setCodeMessage('');
    try {
      const response = await fetch('/api/clinical/password-reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hr-code', ...input }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save the password.');
      setCodeMessage(result.message);
    } catch (error) {
      setCodeMessage(error instanceof Error ? error.message : 'Connection interrupted. Please retry.');
    } finally { setCodeBusy(false); }
  }
  return <main className="clinical" style={{ maxWidth: 680 }}>
    <h1>Forgot password</h1>
    <p>Use this when a password was never set or you no longer know it. An HR password code does not approve clinical access, and HR never sees the password you choose.</p>
    <section>
      <h2>HR password code</h2>
      <form method="post" action="/clinical/forgot-password" onSubmit={submitCode}>
        <fieldset disabled={codeBusy}>
          <label>Employee ID<input name="employeeId" required pattern="AA-EMP-[0-9]{6,12}" autoComplete="username" /></label>
          <label>HR password code<input name="code" required minLength={64} maxLength={64} pattern="[a-f0-9]{64}" autoComplete="one-time-code" spellCheck={false} /></label>
          <label>New password<input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label>
          <label>Confirm password<input name="confirmPassword" type="password" required minLength={12} maxLength={72} autoComplete="new-password" /></label>
          <button>{codeBusy ? 'Please wait…' : 'Save my password'}</button>
        </fieldset>
      </form>
      {codeMessage && <p className="clinical-notice" role="status">{codeMessage}</p>}
    </section>
    <section><h2>Email reset link</h2><p>Enter the official email on your employee record. The reply is the same whether or not an account exists.</p><form method="post" action="/clinical/forgot-password" onSubmit={submit}><fieldset disabled={busy}><label>Official email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label><button>{busy ? 'Please wait…' : 'Send reset link'}</button></fieldset></form>{message && <p className="clinical-notice" role="status">{message}</p>}<p><Link href="/clinical/login">Internal login</Link> · <Link href="/clinical/register">Registration</Link></p></section>
  </main>;
}
