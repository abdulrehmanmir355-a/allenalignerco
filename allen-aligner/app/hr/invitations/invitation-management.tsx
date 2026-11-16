'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import '../employee-access/identity.css';

type Employee = { permanentId: string; fullName: string; email: string | null };
type Invitation = { id: string; permanentId: string; fullName: string; intendedEmail: string | null; issuedAt: string; expiresAt: string; state: string; isLatest: boolean; issuedBy: string };
type Event = { id: number; invitationId: string; action: string; actor: string; createdAt: string };
type Data = { actor: { role: string }; employees: Employee[]; invitations: Invitation[]; events: Event[]; page: number; pageSize: number; total: number };
type Secret = { token: string; employeeId: string; expiresAt: string };
const instant = (value: string) => new Date(value).toLocaleString();

export default function InvitationManagement() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [secret, setSecret] = useState<Secret | null>(null);
  const [selection, setSelection] = useState({ employeeId: '', invitationId: '', action: 'invite' });
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/work/registration?page=' + page, { cache: 'no-store', signal });
    const result = await response.json();
    if (!response.ok) { setData(null); setSecret(null); throw new Error(result.message || 'Unable to load invitations.'); }
    if (!signal?.aborted) { setData(result); setPage(result.page); }
  }, [page]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void load(controller.signal).catch(error => { if (!controller.signal.aborted) setMessage(error.message); }); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load]);
  // Secrets are never persisted and disappear automatically when they expire.
  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => setSecret(null), Math.max(0, new Date(secret.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [secret]);
  function choose(invitation: Invitation, action: string) {
    setSecret(null); setMessage('');
    setSelection({ employeeId: invitation.permanentId, invitationId: invitation.id, action });
    document.getElementById('invitation-form')?.scrollIntoView({ behavior: 'smooth' });
  }
  const selectedEmployee = data?.employees.find(employee => employee.permanentId === selection.employeeId);
  return <main className="identity">
    <header className="identity-header"><div><p className="eyebrow">ALLEN ALIGNER / HUMAN RESOURCES</p><h1>Employee registration invitations</h1><p>One employee. One use. Expires after 24 hours.</p><p><Link href="/hr/reviewer-access">Issue an external clinical reviewer invitation →</Link></p></div><Link href="/hr/employees/directory">Employee directory →</Link></header>
    <p>HR Admins can manage all invitations. HR Officers can manage employees assigned to them. HR Viewers can check status only.</p>
    {data?.actor.role !== 'HR_VIEWER' && <section className="identity-card invitation-process" aria-labelledby="invitation-process-title">
      <p className="eyebrow">QUICK PROCESS</p><h2 id="invitation-process-title">Issue an employee code</h2>
      <ol>
        <li><strong>Confirm the employee record.</strong><span>Create or find the employee in HR. Their permanent Employee ID is assigned by the existing system.</span></li>
        <li><strong>Select and verify the employee.</strong><span>Choose their Employee ID below and confirm that you verified the intended recipient.</span></li>
        <li><strong>Generate the code.</strong><span>Keep “Generate / replace code,” select a private handover method, add the reason, then confirm.</span></li>
        <li><strong>Give it to that employee privately.</strong><span>Copy the code from the one-time display and share it privately. It is single-use and expires after 24 hours.</span></li>
        <li><strong>Employee activates their account.</strong><span>They open <Link href="/employee/register">Employee registration</Link>, enter their Employee ID and code, then set and confirm a password.</span></li>
        <li><strong>Check the status if needed.</strong><span>Used, pending, expired, and revoked codes appear below. Resending invalidates the old code and starts a new 24-hour period.</span></li>
      </ol>
      <button type="button" onClick={() => document.getElementById('invitation-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Start issuing a code</button>
    </section>}
    <p role="status" aria-live="polite">{message}</p><button disabled={busy} onClick={() => { void load().catch(error => setMessage(error.message)); }}>Refresh status</button>
    {secret && <section className="identity-card"><h2>Share this code privately</h2><p>Employee ID: <strong>{secret.employeeId}</strong> · Expires: {instant(secret.expiresAt)}</p><code className="activation-secret" style={{ display: 'block' }}>{secret.token}</code><p>This code is displayed once. Give it only to the intended employee, who can activate at <Link href="/employee/register">Employee registration</Link>. Resend creates a fresh code; no email is sent automatically.</p><button onClick={() => setSecret(null)}>Hide code</button></section>}
    {!data ? <p>Invitation records are available to signed-in HR accounts within their assigned employee scope.</p> : <>
      {data.actor.role === 'HR_VIEWER' && <p className="identity-card">Your HR account can view invitation status, but cannot issue, resend or revoke codes.</p>}
      {data.actor.role !== 'HR_VIEWER' && <>
      <section className="identity-card" id="invitation-form"><h2>{selection.action === 'revoke' ? 'Revoke invitation' : selection.action === 'resend' ? 'Resend / replace invitation' : 'Generate invitation'}</h2>
        <form onSubmit={async event => {
          event.preventDefault(); if (busy) return;
          const form = event.currentTarget, fields = new FormData(form);
          setBusy(true); setSecret(null); setMessage('');
          try {
            const response = await fetch('/api/work/registration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selection, invitationId: selection.invitationId || undefined, method: fields.get('method'), reason: fields.get('reason') }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Unable to manage invitation.');
            setMessage(result.message); if (result.token) setSecret({ token: result.token, employeeId: result.employeeId, expiresAt: result.expiresAt });
            setSelection({ employeeId: '', invitationId: '', action: 'invite' }); form.reset(); await load();
          } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to manage invitation.'); }
          finally { setBusy(false); }
        }}><fieldset disabled={busy}>
          <label>Employee ID<select required value={selection.employeeId} onChange={event => { setSecret(null); setSelection({ employeeId: event.target.value, invitationId: '', action: 'invite' }); }}>
            <option value="">Select an existing employee</option>{data.employees.map(employee => <option key={employee.permanentId} value={employee.permanentId}>{employee.permanentId} · {employee.fullName}</option>)}
            {selection.employeeId && !selectedEmployee && <option value={selection.employeeId}>{selection.employeeId}</option>}
          </select></label>
          {selectedEmployee && <p>{selectedEmployee.fullName} · {selectedEmployee.email || 'No email recorded'}</p>}
          <label>Action<select value={selection.action} onChange={event => setSelection(value => ({ ...value, action: event.target.value }))}><option value="invite">Generate / replace code</option><option value="resend">Resend with a new code</option><option value="revoke">Revoke code</option></select></label>
          <label>Delivery method<select name="method"><option value="MANUAL">Private handover</option><option value="PRINTED">Printed handover</option><option value="DIGITAL">Private digital delivery</option></select></label>
          <label>Identity verification / reason<textarea name="reason" required minLength={5} maxLength={1000} /></label>
          <label className="identity-check"><input type="checkbox" required /> I verified this employee and the intended recipient.</label>
          <button disabled={!selection.employeeId || busy}>{busy ? 'Saving…' : 'Confirm invitation action'}</button>
        </fieldset></form>
      </section>
      </>}
      <section className="identity-card"><h2>Invitation status and history</h2><p>Codes cannot be recovered. Resend invalidates the old code and starts a new 24-hour period.</p>
        {!data.invitations.length && <p>No invitations have been issued.</p>}
        {data.invitations.map(invitation => <article className="identity-card" key={invitation.id}>
          <h3>{invitation.permanentId} · {invitation.fullName} <span className="identity-badge">{invitation.state}</span></h3>
          <p>{invitation.intendedEmail || 'Tied to this employee'} · Issued {instant(invitation.issuedAt)} by {invitation.issuedBy}<br />Expires {instant(invitation.expiresAt)}</p>
          {data.actor.role !== 'HR_VIEWER' && invitation.isLatest && invitation.state !== 'USED' && <div>
            {data.employees.some(employee => employee.permanentId === invitation.permanentId) && <button disabled={busy} onClick={() => choose(invitation, 'resend')}>Resend / replace</button>}
            {['PENDING', 'EXPIRED'].includes(invitation.state) && <button disabled={busy} onClick={() => choose(invitation, 'revoke')}>Revoke</button>}
          </div>}
          <details><summary>Audit history</summary><ul>{data.events.filter(event => event.invitationId === invitation.id).map(event => <li key={event.id}>{instant(event.createdAt)} · {event.action} · {event.actor}</li>)}</ul></details>
        </article>)}
        <nav aria-label="Invitation pages"><button disabled={busy || page <= 1} onClick={() => { setSecret(null); setPage(value => value - 1); }}>Previous</button> <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))} · {data.total} invitations</span> <button disabled={busy || page * data.pageSize >= data.total} onClick={() => { setSecret(null); setPage(value => value + 1); }}>Next</button></nav>
      </section>
    </>}
  </main>;
}
