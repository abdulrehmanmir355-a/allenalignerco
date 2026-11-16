"use client";
import { useRef, useState, type FormEvent } from "react";
export type PatientRecord = { id: string; patientCode: string; fullName: string; dateOfBirth: string | null; phone: string | null; email: string | null; clinicalNotes?: string | null; medicalHistory?: string | null; dentalHistory?: string | null; revision: number };
type Candidate = { id: string; patientCode: string; fullName: string; archivedAt: string | null };
export default function PatientEditor({ patient, onSaved, onCancel }: { patient?: PatientRecord; onSaved: (patient: PatientRecord) => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [candidates, setCandidates] = useState<Candidate[]>([]), [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    const fields = Object.fromEntries(new FormData(e.currentTarget)); delete fields["duplicate-confirm"];
    try {
      const r = await fetch(patient ? `/api/clinic/patients/${patient.id}` : "/api/clinic/patients", { method: patient ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, confirmDuplicate: confirmed, ...(patient ? { revision: patient.revision } : {}) }) });
      const data = await r.json();
      if (!r.ok) { if (data.code === "POSSIBLE_DUPLICATE") { setCandidates(data.candidates); setConfirmed(false); } throw new Error(data.message || "Unable to save patient."); }
      onSaved(data.patient);
    } catch (e) { setError(e instanceof Error ? e.message : "Save could not be confirmed. Check the list before retrying."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form className="form-stack" onSubmit={submit} onChange={e => { if (!(e.target instanceof HTMLInputElement) || e.target.name !== "duplicate-confirm") { setCandidates([]); setConfirmed(false); } }}><fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><div className="form-stack">
    {patient ? <label>Patient ID<input name="patientCode" value={patient.patientCode} readOnly /></label> : <p>A unique Patient ID will be assigned automatically when you save.</p>}
    <label>Full name<input name="fullName" defaultValue={patient?.fullName} required minLength={2} maxLength={200} /></label>
    <label>Date of birth (optional)<input name="dateOfBirth" type="date" defaultValue={patient?.dateOfBirth?.slice(0, 10) ?? ""} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} /></label>
    <label>Phone (optional)<input name="phone" type="tel" defaultValue={patient?.phone ?? ""} maxLength={40} /></label>
    <label>Email Address{patient ? " (optional for existing records)" : " *"}<input name="email" type="email" defaultValue={patient?.email ?? ""} maxLength={254} required={!patient} autoComplete="email" /></label>
    <label>Relevant clinical notes<textarea name="clinicalNotes" defaultValue={patient?.clinicalNotes ?? ""} maxLength={10000} rows={4} /></label>
    <label>Medical history<textarea name="medicalHistory" defaultValue={patient?.medicalHistory ?? ""} maxLength={10000} rows={4} /></label>
    <label>Dental history<textarea name="dentalHistory" defaultValue={patient?.dentalHistory ?? ""} maxLength={10000} rows={4} /></label>
    {candidates.length > 0 && <div className="notice"><strong>Possible existing patients</strong><ul>{candidates.map(c => <li key={c.id}>{c.patientCode} — {c.fullName}{c.archivedAt ? " (archived)" : ""}</li>)}</ul><label className="checkbox"><input type="checkbox" name="duplicate-confirm" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed these matches and confirm this is a different person.</label></div>}
    {error && <p role="alert" className="notice">{error}</p>}
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="button" disabled={busy || (candidates.length > 0 && !confirmed)}>{busy ? "Saving…" : patient ? "Save Changes" : "Save Patient"}</button><button className="button secondary" type="button" onClick={onCancel}>Cancel</button></div>
  </div></fieldset></form>;
}

