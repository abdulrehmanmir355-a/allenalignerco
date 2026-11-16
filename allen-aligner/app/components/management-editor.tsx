"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type Field = { name: string; label: string; type?: string; options?: { value: string; label: string }[]; required?: boolean; defaultValue?: string };
export default function ManagementEditor({ endpoint, fields, records, transitions = [], canWrite = true, employeeLinks = false, layout = "table", transitionGroups = [] }: { endpoint: string; fields: Field[]; records: Record<string, unknown>[]; transitions?: string[]; canWrite?: boolean; employeeLinks?: boolean; layout?: "table" | "cards"; transitionGroups?: { label: string; statuses: string[] }[] }) {
  const router = useRouter(); const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function save(data: unknown, method = "POST") {
    if (busy) return; setBusy(true); setMessage("");
    try { const r = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const result = await r.json(); if (!r.ok) throw Error(result.message || "Unable to save."); setMessage("Saved."); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); }
  }
  const columns = Array.from(new Set(records.flatMap(r => Object.keys(r)))).filter(k => !["recordedBy", "reviewedBy", "completedBy", "clearedBy"].includes(k));
  const clinicManagement = endpoint.startsWith("/api/clinic/manage/");
  const hrManagement = endpoint.startsWith("/api/hr/manage/");
  const visibleColumns = clinicManagement ? columns.filter(key => key !== "id") : hrManagement ? columns.filter(key => !["id", "employeeId", "offboardingId"].includes(key)) : columns;
  if (hrManagement) {
    const order = ["employeeCode", "fullName", "task", "status"];
    visibleColumns.sort((a, b) => (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)));
  }
  const columnLabels: Record<string, string> = { patientCode: "Patient ID", employeeCode: "Employee ID", fullName: "Full name", dateOfBirth: "Date of birth", canAccessPatients: "Patient access", isActive: "Account status", startsAt: "Appointment date and time", updatedAt: "Last updated", createdAt: "Created", lastWorkingDay: "Last working day", exitType: "Exit type", employee: "Employee", task: "Task", status: "Status", doctor: "Assigned doctor", patient: "Patient", registrationAuthority: "Registration authority", registrationNumber: "Registration number" };
  const formatCell = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string" && (/(?:At|Date|Day)$/.test(key) || key.toLowerCase() === "day") && !Number.isNaN(Date.parse(value))) {
      const date = new Date(value);
      return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", ...(key.endsWith("At") ? { timeStyle: "short" as const } : {}), timeZone: "Asia/Karachi" }).format(date);
    }
    if (typeof value === "string" && /^[A-Z][A-Z_]+$/.test(value)) return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
    return String(value);
  };
  const clinicUserLayout = layout === "cards" || endpoint === "/api/clinic/manage/users";
  const actionGroups = transitionGroups.length ? transitionGroups : endpoint === "/api/clinic/manage/users" ? [{ label: "Account status", statuses: ["ACTIVE", "INACTIVE"] }, { label: "Patient access", statuses: ["PATIENT_ACCESS", "NO_PATIENT_ACCESS"] }, { label: "Clinic role", statuses: ["CLINIC_ADMIN", "CLINIC_STAFF", "CLINIC_VIEWER"] }] : [];
  const transitionLabels: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", PATIENT_ACCESS: "Patient access", NO_PATIENT_ACCESS: "No patient access", CLINIC_ADMIN: "Clinic administrator", CLINIC_STAFF: "Clinic staff", CLINIC_VIEWER: "Clinic viewer" };
  const transitionLabel = (status: string) => transitionLabels[status] || status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  const currentTransition = (row: Record<string, unknown>, status: string) => {
    if (status === "ACTIVE" || status === "INACTIVE") return Boolean(row.isActive) === (status === "ACTIVE");
    if (status === "PATIENT_ACCESS" || status === "NO_PATIENT_ACCESS") return Boolean(row.canAccessPatients) === (status === "PATIENT_ACCESS");
    return row.role === status;
  };
  return <><p className="management-status" role="status">{message}</p>{canWrite && fields.length > 0 && <form className={`management-form${clinicManagement ? " clinic-management-form" : ""}`} onSubmit={e => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); for (const field of fields) if (field.type === "datetime-local" && data[field.name]) { const date = new Date(String(data[field.name])); if (Number.isNaN(date.valueOf())) { setMessage("Enter a valid appointment date and time."); return; } data[field.name] = date.toISOString(); } void save(data); }}><fieldset disabled={busy}><legend>{clinicManagement ? "Add or update record" : "Save record"}</legend>{fields.map(f => <label key={f.name}>{f.label}{f.options ? <select name={f.name} required={f.required !== false} defaultValue={f.defaultValue || ""}><option value="">Select…</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <input name={f.name} type={f.type || "text"} required={f.required !== false} defaultValue={f.defaultValue || ""} maxLength={1000} />}</label>)}<button className="button" disabled={busy}>{busy ? "Saving…" : clinicManagement ? "Save changes" : "Save"}</button></fieldset></form>}<p className={clinicUserLayout || clinicManagement ? "management-record-count" : undefined}>{clinicManagement ? `${records.length} ${records.length === 1 ? "record" : "records"}` : "Showing up to 500 records."}</p>{clinicUserLayout ? <div className="clinic-user-grid">
    {records.map((row, i) => <article className="clinic-user-card" key={String(row.id || i)}>
      <header className="clinic-user-card-header">
        <div className="clinic-user-identity"><span className="clinic-user-avatar" aria-hidden="true">{String(row.fullName || "U").trim().slice(0, 1).toUpperCase()}</span><div><h2>{String(row.fullName || "Clinic user")}</h2><p>{String(row.email || "No email")}</p></div></div>
        <span className={`clinic-user-state ${row.isActive ? "is-active" : "is-inactive"}`}><span aria-hidden="true" />{row.isActive ? "Active" : "Inactive"}</span>
      </header>
      <dl className="clinic-user-facts">
        <div><dt>Clinic role</dt><dd>{transitionLabel(String(row.role || "—"))}</dd></div>
        <div><dt>Patient access</dt><dd><span className={`clinic-access-state ${row.canAccessPatients ? "has-access" : "no-access"}`} />{row.canAccessPatients ? "Allowed" : "Not allowed"}</dd></div>
      </dl>
      {canWrite && actionGroups.length > 0 && <div className="clinic-user-controls">
        {actionGroups.map(group => <section className="clinic-user-control-group" key={group.label}><h3>{group.label}</h3><div className="clinic-user-control-options">{group.statuses.map(status => { const selected = currentTransition(row, status); return <button key={status} type="button" className={`clinic-user-control ${selected ? "is-selected" : ""}`} aria-pressed={selected} disabled={busy || selected} onClick={() => void save({ id: row.id, status }, "PATCH")}>{transitionLabel(status)}{selected ? <span>Current</span> : null}</button>; })}</div></section>)}
      </div>}
    </article>)}
    {!records.length && <p className="clinic-user-empty">No clinic users found.</p>}
  </div> : <div className={hrManagement ? "hr-management-table-wrap" : clinicManagement ? "clinic-management-table-wrap" : undefined} style={{ overflowX: "auto" }}><table className={hrManagement ? "hr-management-table" : clinicManagement ? "clinic-management-table" : undefined} cellPadding={12}><thead><tr>{visibleColumns.map(k => <th key={k}>{columnLabels[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase()).trim()}</th>)}{employeeLinks && <th>Employee Profile</th>}{canWrite && transitions.length > 0 && <th>Actions</th>}</tr></thead><tbody>{records.map((row, i) => <tr key={String(row.id || i)}>{visibleColumns.map(k => <td key={k} data-column={k}>{hrManagement && k === "status" ? <span className={`hr-status-pill is-${String(row[k] || "unknown").toLowerCase()}`}>{formatCell(k, row[k])}</span> : formatCell(k, row[k])}</td>)}{employeeLinks && <td>{(row.employeeId || endpoint === "/api/hr/manage/employees" && row.id) ? <Link href={"/hr/employees/" + encodeURIComponent(String(row.employeeId || row.id))}>View profile →</Link> : "—"}</td>}{canWrite && transitions.length > 0 && <td><div className="hr-management-actions">{transitions.map(status => <button className="button" key={status} disabled={busy} onClick={() => void save({ id: row.id, status }, "PATCH")}>{transitionLabel(status)}</button>)}</div></td>}</tr>)}</tbody></table>{!records.length && <p>No records yet.</p>}</div>}</>;
}
