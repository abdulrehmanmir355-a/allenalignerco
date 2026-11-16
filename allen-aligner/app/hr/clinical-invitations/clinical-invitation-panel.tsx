'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Employee = { permanentId: string; fullName: string; email: string; department: string; designation: string; status: string; clinicalRole: string | null };
type Invitation = { id: string; permanentId: string; fullName: string; email: string; department: string; role: string; status: string; expiresAt: string; issuedBy: string };
type Secret = { code: string; employeeId: string; email: string; expiresAt: string; kind: 'registration' | 'password' };
type Audit = { id: number; action: string; createdAt: string; permanentId: string | null; detail: { purpose?: string } };

export default function ClinicalInvitationPanel() {
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [role, setRole] = useState('REVIEWER');
  const [selected, setSelected] = useState('');
  const [secret, setSecret] = useState<Secret | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/api/hr/clinical-invitations', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load invitations.');
    setInvitations(result.invitations || []);
    setAudit(result.audit || []);
  }, []);
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, [load]);
  async function search(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/hr/clinical-invitations?q=' + encodeURIComponent(query), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) { setMessage(result.message || 'Search failed.'); return; }
    setEmployees(result.employees || []);
  }
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const reason = String(new FormData(event.currentTarget).get('reason') || '');
    setBusy(true); setMessage(''); setSecret(null);
    try {
      const response = await fetch('/api/hr/clinical-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue', employeeId: selected, role, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to issue the invitation.');
      setSecret({ code: result.code, employeeId: result.employeeId, email: result.email, expiresAt: result.expiresAt, kind: 'registration' });
      setMessage(result.message);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to issue the invitation.'); }
    finally { setBusy(false); }
  }
  async function change(action: 'revoke' | 'resend', invitationId: string) {
    const reason = window.prompt(action === 'revoke' ? 'Why are you revoking this invitation?' : 'Why are you replacing this invitation?');
    if (!reason || reason.trim().length < 5) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/hr/clinical-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, invitationId, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to update the invitation.');
      if (result.code) setSecret({ code: result.code, employeeId: result.employeeId, email: result.email, expiresAt: result.expiresAt, kind: 'registration' });
      setMessage(result.message);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update the invitation.'); }
    finally { setBusy(false); }
  }
  return <section>
    <p>HR issues codes only. The employee chooses the password on the registration form, or on the forgot-password page when the password is missing. Registration codes last 7 days. Password codes are a separate issue type and share this audit trail. HR cannot grant Admin access.</p>
    <form onSubmit={search}><label>Search by Employee ID, email, or name<input value={query} onChange={event => setQuery(event.target.value)} minLength={2} /></label><button type="submit">Search</button></form>
    {employees.length > 0 && <div className="clinical-table"><table><thead><tr><th>Employee</th><th>Email</th><th>Department</th><th></th></tr></thead><tbody>{employees.map(employee => <tr key={employee.permanentId}><td>{employee.fullName}<br />{employee.permanentId}</td><td>{employee.email}</td><td>{employee.department} · {employee.designation}</td><td><button type="button" onClick={() => setSelected(employee.permanentId)}>Select</button></td></tr>)}</tbody></table></div>}
    <h3>Registration code</h3>
    <form onSubmit={issue}><fieldset disabled={busy}><label>Selected Employee ID<input value={selected} onChange={event => setSelected(event.target.value)} required pattern="AA-EMP-[0-9]{6,12}" /></label><label>Clinical role<select value={role} onChange={event => setRole(event.target.value)}><option value="REVIEWER">Clinical Reviewer</option><option value="LEAD">Clinical Lead</option></select></label><label>Reason<textarea name="reason" required minLength={5} maxLength={1000} /></label><button type="submit">{busy ? 'Saving…' : 'Issue registration code'}</button></fieldset></form>
    <h3>Password code</h3>
    <p>Use this when the employee has no password or forgot it. The code does not approve clinical access.</p>
    <form onSubmit={async event => { event.preventDefault(); if (busy) return; const reason = String(new FormData(event.currentTarget).get('reason') || ''); setBusy(true); setMessage(''); setSecret(null); try { const response = await fetch('/api/hr/clinical-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue-password-code', employeeId: selected, reason }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Unable to issue the password code.'); setSecret({ code: result.code, employeeId: result.employeeId, email: result.email, expiresAt: result.expiresAt, kind: 'password' }); setMessage(result.message); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to issue the password code.'); } finally { setBusy(false); } }}><fieldset disabled={busy}><label>Reason<textarea name="reason" required minLength={5} maxLength={1000} /></label><button type="submit">{busy ? 'Saving…' : 'Issue password code'}</button></fieldset></form>
    {secret && <div className="clinical-notice"><p><strong>{secret.email}</strong> · {secret.employeeId} · {secret.kind === 'password' ? 'Password code' : 'Registration code'}</p><label>One-time code<input readOnly value={secret.code} onFocus={event => event.currentTarget.select()} /></label><p>Expires {new Date(secret.expiresAt).toLocaleString()}. Share it only with this employee. {secret.kind === 'password' ? <Link href="/clinical/forgot-password">Forgot password page</Link> : <Link href="/clinical/register">Registration page</Link>}</p></div>}
    {message && <p role="status">{message}</p>}
    <h3>Audit trail</h3>
    <div className="clinical-table"><table><thead><tr><th>When</th><th>Employee</th><th>Action</th><th>Purpose</th></tr></thead><tbody>{audit.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.permanentId || '—'}</td><td>{item.action}</td><td>{item.detail?.purpose || '—'}</td></tr>)}</tbody></table></div>
    <h3>Invitation status</h3>
    <div className="clinical-table"><table><thead><tr><th>Employee</th><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{invitations.map(item => <tr key={item.id}><td>{item.fullName}<br />{item.permanentId}</td><td>{item.email}</td><td>{item.role}</td><td>{item.status}</td><td>{new Date(item.expiresAt).toLocaleString()}</td><td>{item.status === 'INVITED' && <><button type="button" disabled={busy} onClick={() => void change('resend', item.id)}>Resend</button><button type="button" disabled={busy} onClick={() => void change('revoke', item.id)}>Revoke</button></>}</td></tr>)}</tbody></table></div>
  </section>;
}
