"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import PatientEditor, { type PatientRecord } from "./patient-editor";
type History = { id: string; action: string; revision: number; createdAt: string; actorName: string; before: Record<string, string | null> | null; after: Record<string, string | null> };
type PatientCase = { id: string; patientReference: string; status: string; updatedAt: string };
function HistoryPanel({ patient, onClose, canCreateCase }: { patient: PatientRecord; onClose: () => void; canCreateCase: boolean }) {
  const [history, setHistory] = useState<History[]>([]), [cases, setCases] = useState<PatientCase[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try { const r = await fetch(`/api/clinic/patients/${patient.id}?page=${page}`, { cache: "no-store", signal: controller.signal }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setHistory(data.history); setCases(data.cases || []); setTotal(data.total); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load history."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [patient.id, page]);
  return <section className="panel padded" aria-label="Patient history"><h2>History: {patient.patientCode}</h2><button onClick={onClose}>Close history</button>{loading ? <p role="status">Loading history…</p> : error ? <p role="alert">{error}</p> : <>
    <h3>Linked cases ({cases.length})</h3>{cases.length ? <ul>{cases.map(c => <li key={c.id}>{canCreateCase ? <span>{c.patientReference} · {c.status} · updated {new Date(c.updatedAt).toLocaleDateString()}</span> : <Link href={`/clinic/cases/${encodeURIComponent(c.id)}/timeline`}>{c.patientReference} · {c.status} · updated {new Date(c.updatedAt).toLocaleDateString()}</Link>}</li>)}</ul> : <p>No cases are linked to this patient yet.</p>}
    {!history.length && <p>No recorded changes. Records created before history was enabled have no creation event.</p>}
    {history.map(h => <article key={h.id} style={{ borderBottom: "1px solid #cbd5e1", padding: "16px 0" }}><strong>{h.action} · Revision {h.revision}</strong><p>{h.actorName} · {new Date(h.createdAt).toLocaleString()}</p><ul>{Object.entries(h.after).filter(([key, value]) => !h.before || h.before[key] !== value).map(([key, value]) => <li key={key}>{key}: {h.before ? `${h.before[key] || "—"} → ` : ""}{value || "—"}</li>)}</ul></article>)}
    <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous history</button> <span>Page {page}</span> <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next history</button>
  </>}</section>;
}
export default function PatientManagement({ canCreateCase = true }: { canCreateCase?: boolean }) {
  const [patients, setPatients] = useState<PatientRecord[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [query, setQuery] = useState(""), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<PatientRecord | "new" | null>(null), [history, setHistory] = useState<PatientRecord | null>(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try { const r = await fetch(`/api/clinic/patients?page=${page}&q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal }); const data = await r.json(); if (!r.ok) throw new Error(data.message || "Unable to load patients."); setPatients(data.patients); setTotal(data.total); }
      catch (e) { if (!controller.signal.aborted) { setPatients([]); setError(e instanceof Error ? e.message : "Unable to load patients."); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [page, query, refresh]);
  function search(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setQuery(String(new FormData(e.currentTarget).get("q") || "").trim()); setPage(1); }
  return <section className="patient-management"><div style={{ maxWidth: 1180, margin: "auto", display: "grid", gap: 20 }}>
    <header><h1>Patient Master</h1><p>Search, register and update patients in your clinic.</p></header>{message && <p role="status" className="notice">{message}</p>}
    {editor && <section className="panel padded"><h2>{editor === "new" ? "Register Patient" : `Edit ${editor.patientCode}`}</h2><PatientEditor key={editor === "new" ? "new" : `${editor.id}-${editor.revision}`} patient={editor === "new" ? undefined : editor} onCancel={() => setEditor(null)} onSaved={p => { setEditor(null); setHistory(null); setMessage(`Patient ${p.patientCode} saved successfully.`); setPage(1); setRefresh(v => v + 1); }} />{editor !== "new" && <button onClick={async () => { try { const r = await fetch(`/api/clinic/patients/${editor.id}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setEditor(data.patient); setMessage("Latest record loaded. Re-enter your intended changes."); } catch { setMessage("Unable to reload record."); } }}>Reload latest record (discards unsaved changes)</button>}</section>}
    {history && <HistoryPanel key={history.id} patient={history} onClose={() => setHistory(null)} canCreateCase={canCreateCase} />}
    <section className="panel padded" style={{ minWidth: 0 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><h2>Patient Records{!loading && !error ? ` (${total})` : ""}</h2><button className="button" disabled={!!editor} onClick={() => { setEditor("new"); setMessage(""); }}>+ Add Patient</button></div>
      <form className="form-stack" onSubmit={search}><label>Search by name, Patient ID, phone or email<input name="q" type="search" maxLength={100} /></label><button className="button secondary">Search</button></form>
      {loading ? <p role="status">Loading patients…</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRefresh(v => v + 1)}>Retry</button></div> : <>
        <div style={{ overflowX: "auto", marginTop: 20 }}><table style={{ width: "100%", overflowWrap: "anywhere", textAlign: "left", borderCollapse: "collapse" }}><thead><tr>{["Patient ID", "Full name", "Date of birth", "Phone", "Email", "Actions"].map(h => <th key={h} style={{ padding: 12 }}>{h}</th>)}</tr></thead><tbody>{patients.map(p => <tr key={p.id} style={{ borderTop: "1px solid #e2e8f0" }}>{[p.patientCode, p.fullName, p.dateOfBirth?.slice(0, 10), p.phone, p.email].map((v, i) => <td key={i} data-label={["Patient ID", "Full name", "Date of birth", "Phone", "Email"][i]} style={{ padding: 12 }}>{v || "—"}</td>)}<td data-label="Actions" style={{ padding: 12 }}><button disabled={!!editor} onClick={async () => { try { const r = await fetch(`/api/clinic/patients/${p.id}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(data.message); setEditor(data.patient); setMessage(""); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load patient details."); } }}>Edit</button> <button onClick={() => setHistory(p)}>Cases &amp; History</button> {canCreateCase && <Link href={`/doctor-dashboard/cases/new?patientId=${p.id}`}>New case</Link>}</td></tr>)}</tbody></table></div>
        {!patients.length && <p>No matching patients.</p>}<div style={{ display: "flex", gap: 12, marginTop: 20 }}><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / 50))}</span><button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</button></div>
      </>}
    </section>
  </div></section>;
}

