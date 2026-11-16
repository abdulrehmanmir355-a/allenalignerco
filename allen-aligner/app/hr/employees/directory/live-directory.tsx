'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from '../employee.module.css';

type Employee = { id: string; permanentId: string; employeeCode: string; fullName: string; department: string; designation: string; joinedOn: string | null; status: string };
type Result = { employees: Employee[]; total: number; page: number; pageSize: number; message?: string };
const dateLabel = (value: string | null) => value ? new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' }) : 'Not recorded';

export default function LiveDirectory({ initialEmployees, initialTotal, initialPage, pageSize, initialQuery, initialStatus, fixedStatus, canChangeStatus = false }: {
  initialEmployees: Employee[]; initialTotal: number; initialPage: number; pageSize: number; initialQuery: string; initialStatus: string; fixedStatus?: 'ACTIVE' | 'INACTIVE'; canChangeStatus?: boolean;
}) {
  const [employees, setEmployees] = useState(initialEmployees), [total, setTotal] = useState(initialTotal), [page, setPage] = useState(initialPage);
  const [query, setQuery] = useState(initialQuery), [status, setStatus] = useState(fixedStatus || initialStatus), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const first = useRef(true), pageCount = Math.max(1, Math.ceil(total / pageSize));
  const [statusBusyId, setStatusBusyId] = useState(''), [statusError, setStatusError] = useState('');

  async function setEmployeeStatus(employee: Employee) {
    if (!canChangeStatus || statusBusyId) return;
    const nextStatus = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setStatusBusyId(employee.id); setStatusError('');
    try {
      const response = await fetch('/api/hr/employees/' + encodeURIComponent(employee.id), {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to change employee status.');
      if ((fixedStatus || status) && (fixedStatus || status) !== nextStatus) {
        setEmployees(rows => rows.filter(row => row.id !== employee.id));
        setTotal(value => Math.max(0, value - 1));
      } else {
        setEmployees(rows => rows.map(row => row.id === employee.id ? { ...row, status: result.employee.status } : row));
      }
    } catch (cause) { setStatusError(cause instanceof Error ? cause.message : 'Unable to change employee status.'); }
    finally { setStatusBusyId(''); }
  }

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (fixedStatus || status) params.set('status', fixedStatus || status);
      params.set('page', String(page));
      const visible = new URLSearchParams();
      if (query) visible.set('q', query);
      if (!fixedStatus && status) visible.set('status', status);
      if (page > 1) visible.set('page', String(page));
      window.history.replaceState(null, '', window.location.pathname + (visible.size ? '?' + visible : ''));
      setBusy(true); setError('');
      try {
        const response = await fetch('/api/hr/employees?' + params, { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as Result;
        if (!response.ok) throw new Error(result.message || 'Unable to update employee records.');
        if (!controller.signal.aborted) { setEmployees(result.employees); setTotal(result.total); setPage(result.page); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to update employee records.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, status, page, fixedStatus]);

  return <section className={styles.panel} aria-label="Employee directory">
    <form className={styles.search} onSubmit={event => event.preventDefault()}>
      <label>Search employees<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Name, Employee ID, code, email or department" maxLength={200} /></label>
      {!fixedStatus && <label>Employment status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="OFFBOARDING">Offboarding</option></select></label>}
      {(query || (!fixedStatus && status)) && <button className={styles.clearButton} type="button" onClick={() => { setQuery(''); setStatus(fixedStatus || ''); setPage(1); }}>Clear filters</button>}
    </form>
    <div className={styles.resultBar} aria-live="polite"><p>{busy ? 'Updating employee records…' : `${total} employee${total === 1 ? '' : 's'} found · Page ${page} of ${pageCount}`}</p>{(error || statusError) && <p className={styles.error} role="alert">{statusError || error}</p>}</div>
    <div className={styles.table} aria-busy={busy}><table><thead><tr><th>Employee ID</th><th>Full name</th><th>Department / designation</th><th>Status</th><th>Joining date</th><th>Actions</th>{canChangeStatus && <th>Employment status</th>}</tr></thead><tbody>
      {employees.map(employee => <tr key={employee.id}><td><strong>{employee.employeeCode}</strong></td><td>{employee.fullName}</td><td>{employee.department}<br /><span className={styles.muted}>{employee.designation}</span></td><td><span className={styles.status} data-status={employee.status}>{employee.status.charAt(0) + employee.status.slice(1).toLowerCase()}</span></td><td>{dateLabel(employee.joinedOn)}</td><td><Link href={'/hr/employees/' + encodeURIComponent(employee.id)}>View profile →</Link></td>{canChangeStatus && <td>{employee.status === 'OFFBOARDING' ? <span className={styles.muted}>Use offboarding workflow</span> : <button className={styles.button} type="button" disabled={Boolean(statusBusyId)} onClick={() => void setEmployeeStatus(employee)}>{statusBusyId === employee.id ? 'Saving…' : employee.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button>}</td>}</tr>)}
    </tbody></table></div>
    {!employees.length && !busy && <div className={styles.empty}><h2>No employees found</h2><p>Try changing the search or employment status filter.</p></div>}
    <nav className={styles.actions} aria-label="Employee directory pages"><button className={styles.button} disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className={styles.button} disabled={busy || page >= pageCount} onClick={() => setPage(value => value + 1)}>Next</button></nav>
  </section>;
}
