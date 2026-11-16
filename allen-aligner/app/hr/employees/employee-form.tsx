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
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (!employee) { requestId.current ||= crypto.randomUUID(); body.requestId = requestId.current; }
    try {
      const response = await fetch(employee ? "/api/hr/employees/" + encodeURIComponent(employee.id) : "/api/hr/employees", { method: employee ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.employee?.id) throw new Error(result.message || result.error || "Unable to save employee. Please retry.");
      router.push("/hr/employees/" + encodeURIComponent(result.employee.id) + (employee ? "?saved=1" : "?created=1"));
      router.refresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Unable to save employee. Please retry."); inFlight.current = false; setBusy(false); }
  }
  return <>{error && <p role="alert" className={styles.error}>{error}</p>}<p className={styles.muted}>Choose an existing value or type a new department or designation. New values are added to HR’s lists automatically when this employee is saved. You can also manage the lists from <Link href="/hr/manage/departments">Departments</Link> and <Link href="/hr/manage/designations">Designations</Link>.</p><form onSubmit={save} className={styles.form}><fieldset disabled={busy}>
    <label>Full Name *<input name="fullName" required minLength={2} maxLength={200} defaultValue={employee?.fullName || ""} autoComplete="name" /></label>
    <label>Email *<input name="email" type="email" required maxLength={254} defaultValue={employee?.email || ""} autoComplete="email" /></label>
    <label>Department *<input name="department" required maxLength={120} list="allen-hr-departments" defaultValue={employee?.department || ""} placeholder="Choose or type a department" /><datalist id="allen-hr-departments">{departments.map(name => <option key={name} value={name} />)}</datalist></label>
    <label>Designation *<input name="designation" required maxLength={120} list="allen-hr-designations" defaultValue={employee?.designation || ""} placeholder="Choose or type a designation" /><datalist id="allen-hr-designations">{designations.map(name => <option key={name} value={name} />)}</datalist></label>
    <label>Joining Date *<input name="joinedOn" type="date" required defaultValue={dateInput(employee?.joinedOn)} /></label>
    <label>Phone<input name="phone" type="tel" maxLength={40} defaultValue={employee?.phone || ""} autoComplete="tel" /></label>
    {employee && administrator && <label>Employment Status<select name="status" defaultValue={employee.status} required><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>{employee.status === "OFFBOARDING" && <option value="OFFBOARDING">Offboarding — managed by exit workflow</option>}</select></label>}
    <button className={styles.button} type="submit" disabled={busy}>{busy ? "Saving…" : employee ? "Save Employee Changes" : "Save Employee"}</button>
  </fieldset></form></>;
}
