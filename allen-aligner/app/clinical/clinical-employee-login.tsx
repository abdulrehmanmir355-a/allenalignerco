'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export default function ClinicalEmployeeLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/clinical/employee-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to sign in.');
      router.replace('/clinical');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection interrupted. Please retry.');
      setBusy(false);
    }
  }
  return <main className="clinical" style={{ maxWidth: 680 }}>
    <span className="clinical-eyebrow">ALLEN ALIGNER · INTERNAL CLINICAL REVIEW</span>
    <h1>Internal login</h1>
    <p>Sign in only after your employee account is active and clinical access has been approved. Pending, rejected, suspended, and revoked accounts are not signed in.</p>
    <section>
      <form method="post" action="/clinical/login" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Employee ID<input name="employeeId" required minLength={3} maxLength={40} autoComplete="username" placeholder="Your Employee ID" /></label>
          <label>Password<input name="password" type="password" required maxLength={72} autoComplete="current-password" /></label>
          <button type="submit">{busy ? 'Please wait…' : 'Sign in'}</button>
        </fieldset>
      </form>
      {message && <p className="clinical-error" role="alert">{message}</p>}
      <p><Link href="/clinical/register">Employee registration</Link> · <Link href="/clinical/forgot-password">Forgot password</Link></p>
      <p><Link href="/clinical/login?account=reviewer">External reviewer email login</Link></p>
    </section>
  </main>;
}
