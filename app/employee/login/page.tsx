'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

const fieldStyle = {
  width: '100%',
  marginTop: 8,
  padding: '12px 14px',
  border: '1px solid #88bfd4',
  borderRadius: 10,
  background: '#f1f5ff',
  color: '#103746',
};

export default function Login() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    const form = event.currentTarget;
    try {
      const response = await fetch('/api/work/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message || 'Unable to sign in. Please retry.');
        return;
      }
      const requestedNext = new URLSearchParams(window.location.search).get('next');
      const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//')
        ? requestedNext
        : '/employee';
      window.location.assign(next);
    } catch {
      setMessage('Unable to sign in. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      width: 'min(1200px, calc(100% - 32px))',
      margin: '28px auto 48px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
      gap: 28,
      alignItems: 'stretch',
    }}>
      <aside style={{
        background: '#e5ede5',
        borderRadius: 18,
        padding: 'clamp(24px, 4vw, 48px)',
        minHeight: 540,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#103746',
      }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 48, color: 'inherit' }}>
            THE ALLEN ALIGNER NETWORK · EMPLOYEE
          </p>
          <h1 style={{ fontSize: 'clamp(38px, 4vw, 58px)', lineHeight: 1.13, letterSpacing: '-0.045em', fontWeight: 650, margin: 0 }}>
            Your work.
            <br />
            A clearer
            <br />
            <em>connection.</em>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.8, marginTop: 32, color: 'inherit' }}>
            One secure workspace for your role, work and performance.
          </p>
          <div style={{ display: 'grid', gap: 18, marginTop: 42, fontSize: 13 }}>
            <p style={{ color: 'inherit' }}>01　 Individual employee access</p>
            <p style={{ color: 'inherit' }}>02　 Your assigned work</p>
            <p style={{ color: 'inherit' }}>03　 Performance and records</p>
            <p style={{ color: 'inherit' }}>04　 Account settings</p>
          </div>
        </div>
        <Link href="/how-it-works" style={{ marginTop: 36, fontSize: 13, fontWeight: 600 }}>
          See how it works →
        </Link>
      </aside>

      <section style={{
        background: '#ffffff',
        border: '1px solid #d5e0db',
        borderRadius: 18,
        padding: 'clamp(24px, 4vw, 48px)',
        minHeight: 540,
        color: '#103746',
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 22, color: 'inherit' }}>
          EMPLOYEE ACCESS
        </p>
        <h2 style={{ fontSize: 'clamp(32px, 3vw, 44px)', lineHeight: 1.15, letterSpacing: '-0.04em', marginBottom: 16 }}>
          Welcome back.
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 35 }}>
          Sign in with your permanent Employee ID and individual password.
        </p>
        <form className="form-stack" onSubmit={submit} style={{ marginTop: 0 }}>
          <label>
            Employee ID
            <input name="employeeId" placeholder="AA-EMP-000000000001" required autoComplete="username" style={fieldStyle} />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" placeholder="Enter your password" style={fieldStyle} />
          </label>
          <button className="button full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
        {message && <p role="alert" className="notice">{message}</p>}
        <p className="fine-print" style={{ marginTop: 26 }}>
          Authorized employee accounts only. Contact HR if you need help with your access.
        </p>
        <p className="auth-switch" style={{ marginTop: 22 }}>
          Need an invitation? Contact HR.{' '}
          <Link href="/employee/register">Employee registration</Link>
          {' · '}
          <Link href="/clinical/login">Internal Clinical Login</Link>
        </p>
      </section>
    </main>
  );
}
