"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import LargeClinicalUpload from "../../../components/large-clinical-upload";
import type { CaseIntake, CaseRecordType } from "../../../lib/case-intake";
import { requiredCaseRecordTypes } from "../../../lib/case-intake";

type Patient = { id: string; patientCode: string; fullName: string; dateOfBirth: string | null };
type CreatedCase = { id: string; patientReference: string };
type Draft = { id: string; patientId: string; category: string; notes: string; intake: CaseIntake; records: Partial<Record<CaseRecordType, number>> };
const initial: Omit<CaseIntake, "reviewed"> = { product: "Clear aligner", arch: "Both", treatmentGoal: "", extraction: "No", ipr: "Planner to assess", attachments: "Planner to assess", medicalHistory: "", dentalHistory: "", allergies: "", specialInstructions: "" };
const labels = ["Patient", "Case type", "Prescription", "Clinical information", "Scans", "Photos", "X-rays", "Instructions", "Review", "Submit"];
const recordLabel: Record<CaseRecordType, string> = { scan: "3D scan", photo: "Clinical photos", xray: "X-rays" };

export default function NewCaseWizard({ patients, verifiedDoctorNames, uploadsEnabled, initialPatientId, initialDraft }: { patients: Patient[]; verifiedDoctorNames: string[]; uploadsEnabled: boolean; initialPatientId: string; initialDraft: Draft | null }) {
  const router = useRouter();
  const [step, setStep] = useState(initialDraft ? 5 : 1);
  const [patientId, setPatientId] = useState(initialDraft?.patientId ?? initialPatientId);
  const [patientQuery, setPatientQuery] = useState(() => {
    const chosen = patients.find(item => item.id === (initialDraft?.patientId ?? initialPatientId));
    return chosen?.fullName ?? "";
  });
  const [category, setCategory] = useState(initialDraft?.category ?? "Initial case");
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [intake, setIntake] = useState<Omit<CaseIntake, "reviewed">>(initialDraft?.intake ?? initial);
  const [caseInfo, setCaseInfo] = useState<CreatedCase | null>(initialDraft ? { id: initialDraft.id, patientReference: patients.find(p => p.id === initialDraft.patientId)?.patientCode ?? "" } : null);
  const [records, setRecords] = useState<Partial<Record<CaseRecordType, number>>>(initialDraft?.records ?? {});
  const [doctorPatientConfirmed, setDoctorPatientConfirmed] = useState(false);
  const [consent, setConsent] = useState(Boolean(initialDraft));
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const patient = patients.find(p => p.id === patientId);
  const patientMatches = useMemo(() => {
    const query = patientQuery.trim().toLocaleLowerCase();
    if (!query || patient?.fullName === patientQuery) return [];
    return patients.filter(item => `${item.fullName} ${item.patientCode} ${item.dateOfBirth ?? ""}`.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [patients, patientQuery, patient]);
  const selectedNameMatchesDoctor = !!patient && verifiedDoctorNames.some(name => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() === patient.fullName.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase());
  const required = useMemo(() => requiredCaseRecordTypes(intake.arch), [intake.arch]);
  const completeRecords = required.every(type => (records[type] || 0) > 0);
  const activeRecord = step === 5 ? "scan" : step === 6 ? "photo" : step === 7 ? "xray" : null;
  const activeStepLabel = labels[step - 1];
  function update<K extends keyof typeof intake>(key: K, value: (typeof intake)[K]) { setIntake(old => ({ ...old, [key]: value })); }
  function stepClass(n: number) { return step === n ? "is-active" : step > n ? "is-complete" : ""; }
  async function readResponse(response: Response) { const result = await response.json(); if (!response.ok) throw new Error(result.message || "Unable to save this case step."); return result; }
  async function persistDraft() {
    if (!patient || !consent) return;
    const payload = { patientId, category, notes, consent: "yes", intake: { ...intake, reviewed: "yes" } };
    if (!caseInfo) {
      const result = await readResponse(await fetch("/api/portal/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      const id = String(result.redirect).split("/").pop();
      if (!id) throw new Error("The draft was created, but its reference could not be read.");
      setCaseInfo({ id, patientReference: patient.patientCode });
      window.history.replaceState(null, "", `/doctor-dashboard/cases/new?caseId=${encodeURIComponent(id)}`);
      return id;
    }
    await readResponse(await fetch(`/api/portal/cases/${caseInfo.id}/intake`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, notes, intake: { ...intake, reviewed: "yes" } }) }));
    return caseInfo.id;
  }
  async function continueFromClinical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await persistDraft(); setStep(5); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save the case draft."); }
    finally { setSaving(false); }
  }
  async function saveInstructions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { await persistDraft(); setStep(9); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save case instructions."); }
    finally { setSaving(false); }
  }
  async function refreshRecord(type: CaseRecordType) {
    if (!caseInfo) return;
    try {
      const response = await fetch(`/api/portal/cases/${caseInfo.id}/large-uploads?recordType=${type}`, { cache: "no-store" });
      const data = await readResponse(response);
      const count = (data.files || []).filter((file: { recordType?: string }) => file.recordType === type).length;
      setRecords(old => ({ ...old, [type]: count }));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to refresh uploaded record status."); }
  }
  async function submitCase() {
    if (!caseInfo || !completeRecords || !reviewConfirmed) return;
    setSaving(true); setError("");
    try {
      const current = await readResponse(await fetch(`/api/portal/cases/${caseInfo.id}`, { cache: "no-store" }));
      if (current.status !== "DRAFT") throw new Error("This draft is no longer available for submission.");
      const result = await readResponse(await fetch(`/api/portal/cases/${caseInfo.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", revision: current.revision }) }));
      void result;
      router.push(`/doctor-dashboard/cases/${caseInfo.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to submit the case."); }
    finally { setSaving(false); }
  }
  function goNextRecord() { setError(""); if (step === 5) setStep(6); else if (step === 6) setStep(7); else if (step === 7) setStep(8); }
  const recordIsRequired = activeRecord ? required.includes(activeRecord) : false;
  const recordReady = activeRecord ? (records[activeRecord] || 0) > 0 : false;

  return <main className="new-case-wizard">
    <Link className="breadcrumb" href="/doctor-dashboard/cases">← All cases</Link>
    <div className="page-heading"><div><span className="eyebrow">NEW CLINICAL CASE</span><h1>Create a new case</h1><p>Complete each stage in order. Your case remains a private draft until you submit it.</p></div></div>
    <section className="case-wizard-progress" aria-label={`Step ${step} of ${labels.length}: ${activeStepLabel}`}>
      <div><span>STEP {String(step).padStart(2, "0")} / {String(labels.length).padStart(2, "0")}</span><strong>{activeStepLabel}</strong></div>
      <progress value={step} max={labels.length} aria-label={`Step ${step} of ${labels.length}`} />
    </section>
    <nav className="case-wizard-steps" aria-label="Case intake progress">{labels.map((label, i) => <span key={label} className={stepClass(i + 1)} aria-current={step === i + 1 ? "step" : undefined}><b>{i + 1}</b>{label}</span>)}</nav>
    {step === 1 && <form className="panel padded form-stack" onSubmit={e => { e.preventDefault(); setStep(2); }}><h2>Add patient name</h2>
      <label htmlFor="case-patient-search">Patient name</label>
      <div className="case-patient-search">
        <input id="case-patient-search" type="search" autoComplete="off" placeholder="Type a patient name" value={patientQuery} onChange={e => { setPatientQuery(e.target.value); setPatientId(""); setDoctorPatientConfirmed(false); }} aria-controls="case-patient-results" aria-expanded={patientMatches.length > 0} />
        {patientMatches.length > 0 && <ul id="case-patient-results" className="case-patient-results" role="listbox" aria-label="Matching patients">{patientMatches.map(item => <li key={item.id}><button type="button" role="option" aria-selected={patientId === item.id} onClick={() => { setPatientId(item.id); setPatientQuery(item.fullName); setDoctorPatientConfirmed(false); }}>{item.fullName}<small>ID {item.patientCode}{item.dateOfBirth ? ` · DOB ${item.dateOfBirth}` : ""}</small></button></li>)}</ul>}
      </div>
      {patientQuery.trim() && !patient && patientMatches.length === 0 && <p role="status">No matching patient found. Register the patient in Patient Master first.</p>}
      {patient && <p className="case-patient-selected" role="status">Selected: <strong>{patient.fullName}</strong> · Patient ID {patient.patientCode}</p>}
      {selectedNameMatchesDoctor && <div className="notice" role="alert"><p>This name matches a verified doctor at your clinic. Check the Patient ID carefully.</p><label className="checkbox"><input type="checkbox" checked={doctorPatientConfirmed} onChange={e => setDoctorPatientConfirmed(e.target.checked)} />I verified this is the patient’s record, not a doctor record entered by mistake.</label></div>}
      {!patients.length && <p role="status">No active patients found. <Link href="/clinic/patients">Register a patient</Link> before starting a case.</p>}
      <div className="wizard-actions"><span /><button className="button" disabled={!patientId || (selectedNameMatchesDoctor && !doctorPatientConfirmed)}>Continue</button></div>
    </form>}
    {step === 2 && <section className="panel padded form-stack"><h2>Choose the case type</h2><label>Case type<select value={category} onChange={e => setCategory(e.target.value)}><option>Initial case</option><option>Follow-up</option><option>Refinement</option></select></label><div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(1)}>Back</button><button className="button" type="button" onClick={() => setStep(3)}>Continue to prescription</button></div></section>}
    {step === 3 && <form className="panel padded form-stack" onSubmit={e => { e.preventDefault(); setStep(4); }}><h2>Digital prescription</h2>
      <label>Product<select value={intake.product} onChange={e => update("product", e.target.value as typeof intake.product)}><option>Clear aligner</option><option>Retainer</option><option>Refinement</option></select></label>
      <label>Treatment arch<select value={intake.arch} onChange={e => update("arch", e.target.value as typeof intake.arch)}><option>Upper</option><option>Lower</option><option>Both</option></select></label>
      <label>Primary treatment goal<textarea required minLength={5} maxLength={2000} value={intake.treatmentGoal} onChange={e => update("treatmentGoal", e.target.value)} rows={4} /></label>
      <div className="form-grid"><label>Extractions<select value={intake.extraction} onChange={e => update("extraction", e.target.value as typeof intake.extraction)}><option>No</option><option>Yes</option><option>Under discussion</option></select></label><label>IPR<select value={intake.ipr} onChange={e => update("ipr", e.target.value as typeof intake.ipr)}><option>No</option><option>Yes</option><option>Planner to assess</option></select></label><label>Attachments<select value={intake.attachments} onChange={e => update("attachments", e.target.value as typeof intake.attachments)}><option>No</option><option>Yes</option><option>Planner to assess</option></select></label></div>
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(2)}>Back</button><button className="button">Continue to clinical information</button></div>
    </form>}
    {step === 4 && <form className="panel padded form-stack" onSubmit={continueFromClinical}><h2>Clinical information</h2>
      <label>Medical history<textarea value={intake.medicalHistory} onChange={e => update("medicalHistory", e.target.value)} maxLength={3000} rows={3} /></label>
      <label>Dental history<textarea value={intake.dentalHistory} onChange={e => update("dentalHistory", e.target.value)} maxLength={3000} rows={3} /></label>
      <label>Allergies and relevant sensitivities<textarea value={intake.allergies} onChange={e => update("allergies", e.target.value)} maxLength={2000} rows={2} /></label>
      <label className="checkbox"><input required type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I am authorized to share these patient records with Allen and the assigned laboratory.</label>
      <p className="fine-print">Enter only information needed for this case. This intake does not provide diagnosis or treatment advice.</p>
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(3)}>Back</button><button className="button" disabled={saving || !consent}>{saving ? "Saving private draft…" : "Save draft and continue to scans"}</button></div>
    </form>}
    {activeRecord && caseInfo && <section className="panel padded form-stack"><h2>{recordLabel[activeRecord]}</h2><p>{recordIsRequired ? "At least one file in this category is required." : "This category is optional for the selected arch, but you can add records here."} Supported file types and upload limits are checked before storage.</p>
      {!uploadsEnabled && <p className="notice" role="alert">Private uploads are not enabled in this environment. Configure private storage before submitting this case.</p>}
      <LargeClinicalUpload key={activeRecord} action={`/api/portal/cases/${caseInfo.id}/large-uploads`} recordType={activeRecord} canUpload={uploadsEnabled} patientReference={caseInfo.patientReference} uploaderLabel={patient?.fullName || "Doctor"} onUploadComplete={() => { void refreshRecord(activeRecord); }} />
      <p role="status">{recordReady ? `${records[activeRecord]} file(s) saved in this draft.` : recordIsRequired ? "Upload a file to continue." : "No file uploaded. You may continue."}</p>
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(step - 1)}>Back</button><button className="button" type="button" disabled={(recordIsRequired && !recordReady) || (activeRecord === "xray" && recordIsRequired && !recordReady)} onClick={goNextRecord}>Continue</button></div>
    </section>}
    {step === 8 && <form className="panel padded form-stack" onSubmit={saveInstructions}><h2>Instructions for the planning team</h2><label>Clinical instructions<textarea value={intake.specialInstructions} onChange={e => update("specialInstructions", e.target.value)} maxLength={3000} rows={5} placeholder="Add relevant preferences or planning instructions" /></label><label>Additional case notes<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={5000} rows={4} placeholder="Context for the Allen team" /></label><div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(7)}>Back</button><button className="button" disabled={saving}>{saving ? "Saving instructions…" : "Save and review"}</button></div></form>}
    {step === 9 && <section className="panel padded"><span className="eyebrow">STEP 9 OF 10</span><h2>Review the complete case</h2><dl className="case-review-list"><dt>Patient</dt><dd>{patient?.fullName} · {patient?.patientCode}</dd><dt>Case type</dt><dd>{category}</dd><dt>Product / arch</dt><dd>{intake.product} · {intake.arch}</dd><dt>Treatment goal</dt><dd>{intake.treatmentGoal}</dd><dt>Extraction / IPR / attachments</dt><dd>{intake.extraction} · {intake.ipr} · {intake.attachments}</dd><dt>Medical history</dt><dd>{intake.medicalHistory || "Not supplied"}</dd><dt>Dental history</dt><dd>{intake.dentalHistory || "Not supplied"}</dd><dt>Allergies</dt><dd>{intake.allergies || "Not supplied"}</dd><dt>Clinical instructions</dt><dd>{intake.specialInstructions || "None"}</dd><dt>Additional notes</dt><dd>{notes || "None"}</dd><dt>Records</dt><dd>{(["scan", "photo", "xray"] as const).map(type => `${recordLabel[type]}: ${records[type] || 0}`).join(" · ")}</dd></dl>
      {!completeRecords && <p role="alert">Required records are missing: {required.filter(type => !records[type]).map(type => recordLabel[type]).join(", ")}.</p>}
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(8)}>Edit instructions</button><button className="button" type="button" disabled={!completeRecords} onClick={() => { setReviewConfirmed(false); setStep(10); }}>Continue to final submission</button></div>
    </section>}
    {step === 10 && <section className="panel padded form-stack"><span className="eyebrow">STEP 10 OF 10</span><h2>Submit case to Allen</h2><p>Submitting sends this case and its saved records to the clinical team for review. Check the patient and required files before continuing.</p><p><strong>{patient?.fullName} · {patient?.patientCode}</strong><br />{category} · {intake.product} · {intake.arch} arch</p><label className="checkbox"><input type="checkbox" checked={reviewConfirmed} onChange={e => setReviewConfirmed(e.target.checked)} />I reviewed this case and confirm its details and records are correct.</label><div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep(9)}>Back to review</button><button className="button" type="button" disabled={!reviewConfirmed || !completeRecords || saving || !uploadsEnabled} onClick={() => void submitCase()}>{saving ? "Submitting…" : "Submit case"}</button></div></section>}
    {error && <p className="notice" role="alert">{error}</p>}
  </main>;
}
