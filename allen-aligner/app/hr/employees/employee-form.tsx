"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EmployeeRecord } from "../../lib/employee-service";
import styles from "./employee.module.css";
const dateInput = (value: unknown) => value ? String(value instanceof Date ? value.toISOString() : value).slice(0, 10) : "";
export default function EmployeeForm({ employee, administrator = false, departments, designations }: { employee?: EmployeeRecord; administrator?: boolean; departments: string[]; designations: string[] }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<{ id: number; type: string; file: File | null }[]>([]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const selectedDocuments = employee ? [] : documents.filter((document): document is { id: number; type: string; file: File } => document.file !== null);
    if (selectedDocuments.some(({ file }) => file.size === 0 || file.size > 10 * 1024 * 1024)) {
      setError("Each document must be between 1 byte and 10 MB. The employee record has not been saved yet.");
      return;
    }
    const allowedExtensions = new Set(["pdf", "jpg", "jpeg", "png", "doc", "docx", "xlsx"]);
    if (selectedDocuments.some(({ file }) => !allowedExtensions.has(file.name.split(".").pop()?.toLowerCase() || ""))) {
      setError("Use PDF, JPG, PNG, DOC, DOCX or XLSX files. The employee record has not been saved yet.");
      return;
    }
    inFlight.current = true; setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    delete body.documents;
    delete body.documentType;
    delete body.documentFile;
    if (!employee) { requestId.current ||= crypto.randomUUID(); body.requestId = requestId.current; }
    try {
      const response = await fetch(employee ? "/api/hr/employees/" + encodeURIComponent(employee.id) : "/api/hr/employees", { method: employee ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.employee?.id) throw new Error(result.message || result.error || "Unable to save employee. Please retry.");
      if (!employee) {
        let uploaded = 0;
        for (const document of selectedDocuments) {
          const form = new FormData();
          form.append("employeeId", result.employee.id);
          form.append("documentType", document.type);
          form.append("file", document.file);
          try {
            const upload = await fetch("/api/hr/employee-documents", { method: "POST", credentials: "same-origin", body: form });
            const uploadResult = await upload.json().catch(() => ({}));
            if (!upload.ok || !uploadResult.success) throw new Error("Document upload failed");
          } catch {
            const remaining = selectedDocuments.length - uploaded;
            router.push("/hr/employees/" + encodeURIComponent(result.employee.id) + "?created=1&documents=failed&remaining=" + remaining);
            router.refresh();
            return;
          }
          uploaded += 1;
        }
      }
      router.push("/hr/employees/" + encodeURIComponent(result.employee.id) + (employee ? "?saved=1" : "?created=1"));
      router.refresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Unable to save employee. Please retry."); inFlight.current = false; setBusy(false); }
  }
  return <>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!employee && <p className={styles.muted}>Choose an existing value or type a new department or designation. New values are added to HR’s lists automatically when this employee is saved. Manage the lists from <Link href="/hr/manage/departments">Departments</Link> and <Link href="/hr/manage/designations">Designations</Link>.</p>}
    <form onSubmit={save} className={styles.form}>
      <fieldset disabled={busy}>
        <section className={styles.formSection} aria-labelledby="employee-details-heading">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>EMPLOYEE RECORD</p><h2 id="employee-details-heading">Personal and position details</h2></div><span className={styles.requiredNote}>* Required</span></div>
          <div className={styles.fieldGrid}>
            <label>Full Name *<input name="fullName" required minLength={2} maxLength={200} defaultValue={employee?.fullName || ""} autoComplete="name" placeholder="Enter employee’s full name" /></label>
            <label>Email *<input name="email" type="email" required maxLength={254} defaultValue={employee?.email || ""} autoComplete="email" placeholder="name@example.com" /></label>
            <label>Department *<input name="department" required maxLength={120} list="allen-hr-departments" defaultValue={employee?.department || ""} placeholder="Choose or type a department" /><datalist id="allen-hr-departments">{departments.map(name => <option key={name} value={name} />)}</datalist></label>
            <label>Designation *<input name="designation" required maxLength={120} list="allen-hr-designations" defaultValue={employee?.designation || ""} placeholder="Choose or type a designation" /><datalist id="allen-hr-designations">{designations.map(name => <option key={name} value={name} />)}</datalist></label>
            <label>Joining Date *<input name="joinedOn" type="date" required defaultValue={dateInput(employee?.joinedOn)} /></label>
            <label>Phone number <span className={styles.optionalLabel}>Optional</span><input name="phone" type="tel" maxLength={40} defaultValue={employee?.phone || ""} autoComplete="tel" placeholder="Add a contact number" /></label>
            {employee && administrator && <label>Employment Status<select name="status" defaultValue={employee.status} required><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>{employee.status === "OFFBOARDING" && <option value="OFFBOARDING">Offboarding — managed by exit workflow</option>}</select></label>}
          </div>
        </section>
        {!employee && <section className={styles.formSection} aria-labelledby="employee-documents-heading">
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>OPTIONAL</p><h2 id="employee-documents-heading">Employee documents</h2><p className={styles.sectionDescription}>Attach files now, or leave this section empty and add documents from the employee profile later.</p></div></div>
          <div className={styles.documentRows}>
            {documents.map((document, index) => <div className={styles.documentRow} key={document.id}>
              <label>Document category<select value={document.type} onChange={event => setDocuments(rows => rows.map(row => row.id === document.id ? { ...row, type: event.target.value } : row))}><option value="CV">CV / Resume</option><option value="CNIC">CNIC / Identity document</option><option value="CONTRACT">Employment contract</option><option value="CERTIFICATE">Educational certificate</option><option value="OTHER">Other document</option></select></label>
              <label className={styles.fileField}>Choose file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx" onChange={event => setDocuments(rows => rows.map(row => row.id === document.id ? { ...row, file: event.target.files?.[0] ?? null } : row))} /><span>{document.file ? document.file.name : "PDF, JPG, PNG, DOC, DOCX or XLSX · up to 10 MB"}</span></label>
              <button type="button" className={styles.removeDocument} aria-label={`Remove document ${index + 1}`} onClick={() => setDocuments(rows => rows.filter(row => row.id !== document.id))}>Remove</button>
            </div>)}
            <button type="button" className={styles.addDocument} onClick={() => setDocuments(rows => rows.length < 10 ? [...rows, { id: Date.now() + Math.random(), type: "OTHER", file: null }] : rows)} disabled={documents.length >= 10}>+ Add a document</button>
          </div>
          <p className={styles.fileNote}>Accepted formats: PDF, JPG, PNG, DOC, DOCX and XLSX. Each file can be up to 10 MB.</p>
        </section>}
        <div className={styles.formActions}><button className={styles.button} type="submit" disabled={busy}>{busy ? documents.some(document => document.file) ? "Saving employee and documents…" : "Saving employee…" : employee ? "Save Employee Changes" : "Save Employee Record"}<span aria-hidden="true"> →</span></button><span className={styles.muted}>Employee code is assigned when the record is saved.</span></div>
      </fieldset>
    </form>
  </>;
}
