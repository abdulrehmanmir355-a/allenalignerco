'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { registrationFields } from '@/app/lib/clinical-registration/policy';

type Field = ReturnType<typeof registrationFields>[number];
const empty = { employeeId: '', email: '', fullName: '', department: '', jobTitle: '', employeeStatus: '', invitationCode: '', password: '', confirmPassword: '', role: 'REVIEWER', reason: '' };

export default function ClinicalRegistrationForm({ invitationCode = '', fields }: { invitationCode?: string; fields: readonly Field[] }) {
  const [values, setValues] = useState({ ...empty, invitationCode });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState('');
  function set(name: string, value: string) { setValues(current => ({ ...current, [name]: value })); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(''); setSuccess(false);
    try {
      const response = await fetch('/api/clinical/employee-registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', ...values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to submit registration.');
      setStatus(result.status || '');
      setSuccess(true);
      setMessage(result.message || 'Registration received.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection interrupted. Please retry.');
    } finally { setBusy(false); }
  }
  return <main className="clinical" style={{ maxWidth: 760 }}>
    <span className="clinical-eyebrow">ALLEN ALIGNER · INTERNAL CLINICAL REVIEW</span>
    <h1>Employee registration</h1>
    <p>Register with your Employee ID, official email, and a password you choose. Use the HR registration code when you have one. If you have no password or forgot it, use the HR password code on the forgot-password page. HR never sees your password. This page does not sign you in.</p>
    <section>
      <form method="post" action="/clinical/register" onSubmit={submit}>
        <fieldset disabled={busy}>
          {fields.map(field => <label key={field.name}>{field.label}{field.required ? ' *' : ''}
            {field.type === 'select' ? <select name={field.name} value={values.role} onChange={event => set('role', event.target.value)}>{(field.options || ['REVIEWER', 'LEAD']).map(option => <option key={option} value={option}>{option === 'REVIEWER' ? 'Clinical Reviewer' : 'Clinical Lead'}</option>)}</select>
              : field.type === 'textarea' ? <textarea name={field.name} value={values.reason} maxLength={2000} onChange={event => set('reason', event.target.value)} />
                : <input name={field.name} type={field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : 'text'} required={field.required} autoComplete={field.name === 'password' || field.name === 'confirmPassword' ? 'new-password' : 'off'} value={values[field.name as keyof typeof values]} onChange={event => set(field.name, event.target.value)} />}
          </label>)}
          <button type="submit">{busy ? 'Please wait…' : 'Submit registration'}</button>
        </fieldset>
      </form>
      {message && <p className={success ? 'clinical-notice' : 'clinical-error'} role={success ? 'status' : 'alert'}>{message}{status ? ` Status: ${status}.` : ''}</p>}
      <p><Link href="/clinical/login">Internal login</Link> · <Link href="/clinical/forgot-password">Forgot password</Link></p>
      <p><Link href="/clinical/login?account=reviewer">External reviewer login</Link> · <Link href="/clinical/reviewer-activation">Activate an external reviewer invitation</Link></p>
    </section>
  </main>;
}
