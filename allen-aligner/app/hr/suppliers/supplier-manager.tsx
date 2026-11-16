'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SupplierEvent, SupplierRecord } from './types';

type Fields = Omit<SupplierRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
const blank: Fields = { companyName: '', contactName: '', email: '', phone: '', category: '', paymentTerms: '', address: '', notes: '' };
const dateLabel = (value: string) => new Date(value).toLocaleString();
const fieldNames: Record<string, string> = { companyName: 'Company', contactName: 'Contact', email: 'Email', phone: 'Phone', category: 'Category / service', paymentTerms: 'Payment terms', address: 'Address', notes: 'Notes', status: 'Status' };
function auditFields(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.entries(value as Record<string, unknown>);
  return value == null ? [] : [['status', value] as [string, unknown]];
}
export default function SupplierManager({ suppliers, events, canWrite }: { suppliers: SupplierRecord[]; events: SupplierEvent[]; canWrite: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(''), [status, setStatus] = useState('ALL');
  const [form, setForm] = useState<Fields>(blank), [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [isError, setIsError] = useState(false);
  const filtered = useMemo(() => suppliers.filter(s => (status === 'ALL' || s.status === status) && `${s.companyName} ${s.contactName} ${s.category} ${s.email}`.toLowerCase().includes(query.trim().toLowerCase())), [suppliers, status, query]);
  async function request(url: string, method: string, body: unknown) {
    if (busy) return;
    setBusy(true); setMessage(''); setIsError(false);
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to save supplier.');
      setMessage(result.message || 'Saved.');
      if (method !== 'PATCH') { setForm(blank); setEditing(null); }
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save supplier. Please retry.'); setIsError(true); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void request(editing ? `/api/hr/suppliers/${editing}` : '/api/hr/suppliers', editing ? 'PUT' : 'POST', form); }
  function edit(supplier: SupplierRecord) { const { id, status: _status, createdAt: _created, updatedAt: _updated, ...fields } = supplier; setForm(fields); setEditing(id); setMessage(''); }
  return <>
    {message && <p role={isError ? 'alert' : 'status'} className={isError ? 'clinical-error' : 'clinical-notice'}>{message}</p>}
    {canWrite && <section><h2>{editing ? 'Update supplier' : 'Add supplier'}</h2><form onSubmit={submit}><fieldset disabled={busy}>
      <div className="form-grid"><label>Company name<input name="companyName" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} required minLength={2} maxLength={200}/></label><label>Contact name<input name="contactName" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} maxLength={200}/></label>
      <label>Email<input name="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={254}/></label><label>Phone<input name="phone" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} maxLength={40}/></label>
      <label>Category / service<input name="category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} maxLength={100}/></label><label>Payment terms<input name="paymentTerms" value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} maxLength={120} placeholder="e.g. Net 30"/></label></div>
      <label>Address<input name="address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={500}/></label><label>Notes<textarea name="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={2000}/></label>
      <button className="button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button>{editing && <button type="button" className="button secondary" onClick={() => { setForm(blank); setEditing(null); }}>Cancel edit</button>}
    </fieldset></form></section>}
    <section><h2>Supplier directory</h2><div className="filter-bar"><label>Search suppliers<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Company, contact, category or email"/></label><label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">All suppliers</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label></div>
      <div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Contact</th><th>Category</th><th>Terms</th><th>Status</th>{canWrite && <th>Actions</th>}</tr></thead><tbody>{filtered.map(s => <tr key={s.id}><td><strong>{s.companyName}</strong><small>{s.email || 'No email'} · {s.phone || 'No phone'}</small></td><td>{s.contactName || '—'}</td><td>{s.category || '—'}</td><td>{s.paymentTerms || '—'}</td><td>{s.status}</td>{canWrite && <td><button className="button secondary small" disabled={busy} onClick={() => edit(s)}>Edit</button>{' '}<button className="button secondary small" disabled={busy} onClick={() => void request(`/api/hr/suppliers/${s.id}`, 'PATCH', { status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{s.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button></td>}</tr>)}</tbody></table>{filtered.length === 0 && <p className="empty-state">No suppliers match these filters.</p>}</div>
    </section>
    {canWrite && <section><h2>Supplier record history</h2>{events.length ? events.map(event => <details key={event.id} style={{ padding: '14px 0', borderBottom: '1px solid #dce7e9' }}>
      <summary>{dateLabel(event.createdAt)} · {event.action.toLowerCase()} · {event.companyName} · {event.actorEmail}</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 14 }}>
        {(['before', 'after'] as const).map(side => { const entries = auditFields(event.detail?.[side]); return entries.length ? <div key={side}><h3>{side === 'before' ? 'Previous values' : 'Recorded values'}</h3><dl>{entries.map(([key, value]) => <div key={key}><dt>{fieldNames[key] ?? key}</dt><dd>{String(value || '—')}</dd></div>)}</dl></div> : null; })}
      </div>
    </details>) : <p>No supplier changes have been recorded.</p>}</section>}
  </>;
}
