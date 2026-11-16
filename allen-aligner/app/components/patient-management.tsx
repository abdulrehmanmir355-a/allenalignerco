"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import PatientEditor, { type PatientRecord } from "./patient-editor";
type History = { id: string; action: string; revision: number; createdAt: string; actorName: string; before: Record<string, string | null> | null; after: Record<string, string | null> };
type PatientCase = { id: string; patientReference: string; status: string; updatedAt: string };
function HistoryPanel({ patient, onClose, canCreateCase }: { patient: PatientRecord; onClose: () => void; canCreateCase: boolean }) {
  const [history, setHistory] = useState<History[]>([]), [cases, setCases] = useState<PatientCase[]>([]), [casesTotal, setCasesTotal] = useState(0), [casePage, setCasePage] = useState(1), [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try { const r = await fetch(`/api/clinic/patients/${patient.id}?page=${page}&casePage=${casePage}`, { cache: "no-store", signal: controller.signal }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setHistory(data.history); setCases(data.cases || []); setCasesTotal(data.casesTotal ?? (data.cases || []).length); setTotal(data.total); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load history."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [patient.id, page, casePage]);
  return <section className="panel padded" aria-label="Patient history"><h2>History: {patient.patientCode}</h2><button onClick={onClose}>Close history</button>{patient.archivedAt && <p role="status" className="notice">This patient is archived. The record and its history are retained and can be restored.</p>}{loading ? <p role="status">Loading history…</p> : error ? <p role="alert">{error}</p> : <>
    <h3>Linked cases ({casesTotal})</h3>{cases.length ? <><ul>{cases.map(c => <li key={c.id}>{canCreateCase ? <Link href={`/doctor-dashboard/cases/${encodeURIComponent(c.id)}`}>{c.patientReference} · {c.status} · updated {new Date(c.updatedAt).toLocaleDateString()}</Link> : <Link href={`/clinic/cases/${encodeURIComponent(c.id)}/timeline`}>{c.patientReference} · {c.status} · updated {new Date(c.updatedAt).toLocaleDateString()}</Link>}</li>)}</ul><button disabled={casePage === 1 || loading} onClick={() => setCasePage(value => value - 1)}>Previous cases</button> <span>Page {casePage} of {Math.max(1, Math.ceil(casesTotal / 20))}</span> <button disabled={casePage * 20 >= casesTotal || loading} onClick={() => setCasePage(value => value + 1)}>Next cases</button></> : <p>No cases are linked to this patient yet.</p>}
    {!history.length && <p>No recorded changes. Records created before history was enabled have no creation event.</p>}
    {history.map(h => <article key={h.id} style={{ borderBottom: "1px solid #cbd5e1", padding: "16px 0" }}><strong>{h.action} · Revision {h.revision}</strong><p>{h.actorName} · {new Date(h.createdAt).toLocaleString()}</p><ul>{Object.entries(h.after).filter(([key, value]) => !h.before || h.before[key] !== value).map(([key, value]) => <li key={key}>{key}: {h.before ? `${h.before[key] || "—"} → ` : ""}{value || "—"}</li>)}</ul></article>)}
    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous history</button> <span>Page {page}</span> <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next history</button>
  </>}</section>;
}
export default function PatientManagement({ canCreateCase = true }: { canCreateCase?: boolean }) {
  const [patients, setPatients] = useState<PatientRecord[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [query, setQuery] = useState(""), [showArchived, setShowArchived] = useState(false), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<PatientRecord | "new" | null>(null), [history, setHistory] = useState<PatientRecord | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busyId, setBusyId] = useState<string | null>(null);
  const patientTableScroll = useRef<HTMLDivElement>(null);
  const [canTableMoveBack, setCanTableMoveBack] = useState(false), [canTableMoveForward, setCanTableMoveForward] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try { const r = await fetch(`/api/clinic/patients?page=${page}&q=${encodeURIComponent(query)}&archived=${showArchived ? 1 : 0}`, { cache: "no-store", signal: controller.signal }); const data = await r.json(); if (!r.ok) throw new Error(data.message || "Unable to load patients."); setPatients(data.patients); setTotal(data.total); }
      catch (e) { if (!controller.signal.aborted) { setPatients([]); setError(e instanceof Error ? e.message : "Unable to load patients."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [page, query, showArchived, refresh]);
  useEffect(() => {
    const element = patientTableScroll.current;
    if (!element) return;
    const updateControls = () => {
      setCanTableMoveBack(element.scrollLeft > 2);
      setCanTableMoveForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
    };
    updateControls();
    element.addEventListener("scroll", updateControls, { passive: true });
    const observer = new ResizeObserver(updateControls);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", updateControls); observer.disconnect(); };
  }, [patients.length, loading, error]);
  function movePatientTable(direction: -1 | 1) {
    const element = patientTableScroll.current;
    if (element) element.scrollBy({ left: direction * Math.max(260, element.clientWidth * 0.82), behavior: "smooth" });
  }
  function search(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setQuery(String(new FormData(e.currentTarget).get("q") || "").trim()); setPage(1); }
  async function changeArchive(patient: PatientRecord, archive: boolean, confirmDuplicate = false) {
    if (archive && !window.confirm(`Archive ${patient.patientCode} — ${patient.fullName}? The record, its clinical information and its full history are kept and can be restored later.`)) return;
    setBusyId(patient.id); setMessage("");
    try {
      const r = await fetch(`/api/clinic/patients/${patient.id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: archive ? "ARCHIVE" : "RESTORE", revision: patient.revision, confirmDuplicate }) });
      const data = await r.json();
      if (!r.ok && !archive && !confirmDuplicate && ["POSSIBLE_DUPLICATE", "DOCTOR_NAME_MATCH"].includes(data.code)) {
        const matches = data.code === "POSSIBLE_DUPLICATE" ? (data.candidates || []).map((item: { patientCode: string; fullName: string }) => `${item.patientCode} — ${item.fullName}`).join("\n") : `Verified doctor account: ${data.matchedName}`;
        if (window.confirm(`${data.message}\n\n${matches}\n\nRestore this patient record anyway?`)) return await changeArchive(patient, false, true);
      }
      if (!r.ok) throw new Error(data.message || "Unable to change archive state.");
      setMessage(`${data.patient.patientCode} ${archive ? "archived" : "restored"}.`);
      setRefresh(v => v + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to change archive state."); }
    finally { setBusyId(null); }
  }
  const hasHorizontalPatientOverflow = patients.length > 0 && (canTableMoveBack || canTableMoveForward);
  return <section className="patient-management"><div className="patient-master-inner">
    <header className="patient-master-header"><div><span className="patient-master-kicker">PATIENT MASTER · MODULE 04</span><h1>Patient records</h1><p>One patient record connects identity, clinical history and every related case.</p></div><div className="patient-master-header-actions"><span className="patient-master-count"><strong>{total}</strong><small>{showArchived ? "archived records" : "matching records"}</small></span><button className="button" disabled={!!editor} onClick={() => { setEditor("new"); setMessage(""); }}>+ Add patient</button></div></header>
    <aside className="patient-master-guidance"><span aria-hidden="true">i</span><p>Each patient receives a unique Patient ID. Search before adding; possible duplicates are flagged for review. Use <strong>Cases &amp; History</strong> to follow all cases and recorded changes under the same patient.</p></aside>
    {message && <p role="status" className="notice">{message}</p>}
    {editor && <section className="panel padded"><h2>{editor === "new" ? "Register Patient" : `Edit ${editor.patientCode}`}</h2><PatientEditor key={editor === "new" ? "new" : `${editor.id}-${editor.revision}`} patient={editor === "new" ? undefined : editor} onCancel={() => setEditor(null)} onSaved={p => { setEditor(null); setHistory(null); setMessage(`Patient ${p.patientCode} saved successfully.`); setPage(1); setRefresh(v => v + 1); }} />{editor !== "new" && <button onClick={async () => { try { const r = await fetch(`/api/clinic/patients/${editor.id}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setEditor(data.patient); setMessage("Latest record loaded. Re-enter your intended changes."); } catch { setMessage("Unable to reload record."); } }}>Reload latest record (discards unsaved changes)</button>}</section>}
    {history && <HistoryPanel key={history.id} patient={history} onClose={() => setHistory(null)} canCreateCase={canCreateCase} />}
    <section className="panel patient-directory"><div className="patient-directory-heading"><div><span className="patient-master-kicker">CLINIC DIRECTORY</span><h2>Patient list{!loading && !error ? ` · ${total}` : ""}</h2><p>Search by name, Patient ID, phone, or email.</p></div><form className="patient-search" onSubmit={search}><label className="sr-only" htmlFor="patient-master-search">Search patient records</label><input id="patient-master-search" name="q" type="search" maxLength={100} placeholder="Name, Patient ID, phone, or email" /><button className="button secondary">Search</button></form></div>
      <div className="patient-directory-options"><label className="checkbox"><input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setPage(1); setMessage(""); }} />Show archived patients</label><span>Showing {patients.length} of {total}</span></div>
      {loading ? <p role="status">Loading patients…</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRefresh(v => v + 1)}>Retry</button></div> : <>
        <div className="patient-table-scroll" ref={patientTableScroll}><table className="patient-table"><thead><tr>{["Patient ID", "Full name", "Date of birth", "Phone", "Email", "Status", "Actions"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{patients.map(p => <tr key={p.id}>
          <td data-label="Patient ID"><strong className="patient-id-value">{p.patientCode}</strong></td>
          <td data-label="Full name"><strong>{p.fullName}</strong></td>
          <td data-label="Date of birth">{p.dateOfBirth?.slice(0, 10) || "—"}</td>
          <td data-label="Phone">{p.phone || "—"}</td>
          <td data-label="Email">{p.email || "—"}</td>
          <td data-label="Status"><span className={`patient-status ${p.archivedAt ? "is-archived" : "is-active"}`}>{p.archivedAt ? "Archived" : "Active"}</span></td>
          <td data-label="Actions" className="patient-row-actions">{p.archivedAt ? <>
            <button disabled={busyId === p.id} onClick={() => void changeArchive(p, false)}>{busyId === p.id ? "Restoring…" : "Restore"}</button>{" "}<button onClick={() => setHistory(p)}>Cases &amp; History</button>
          </> : <>
            <button disabled={!!editor} onClick={async () => { try { const r = await fetch(`/api/clinic/patients/${p.id}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setEditor(data.patient); setMessage(""); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load patient details."); } }}>Edit</button>{" "}<button onClick={() => setHistory(p)}>Cases &amp; History</button>{" "}<button disabled={busyId === p.id} onClick={() => void changeArchive(p, true)}>{busyId === p.id ? "Archiving…" : "Archive"}</button>{canCreateCase && <>{" "}<Link href={`/doctor-dashboard/cases/new?patientId=${p.id}`}>New case</Link></>}
          </>}</td>
        </tr>)}</tbody></table></div>
        {hasHorizontalPatientOverflow && (
          <div className="patient-table-navigation" aria-label="Navigate patient table columns">
            {canTableMoveBack ? (
              <button type="button" className="patient-table-arrow" onClick={() => movePatientTable(-1)} aria-label="Show previous patient columns"><span aria-hidden="true">←</span> Back</button>
            ) : <span className="patient-table-navigation-hint">More patient details</span>}
            {canTableMoveForward && <button type="button" className="patient-table-arrow" onClick={() => movePatientTable(1)} aria-label="Show more patient columns">Next <span aria-hidden="true">→</span></button>}
          </div>
        )}
        <p className="patient-empty" hidden={patients.length > 0}>{showArchived ? "No archived patients." : "No matching patients."}</p><div className="patient-pagination"><button className="button secondary small" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / 50))}</span><button className="button secondary small" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </>}
    </section>
  </div></section>;
}
