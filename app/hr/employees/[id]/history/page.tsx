import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentHR } from "../../../../lib/hr-auth";
import { employeeDetail, employeeHistory } from "../../../../lib/employee-service";
import { PortalError } from "../../../../lib/portal-http";
import { EmployeeNav, employeeDate, employeeValue } from "../../employee-shell";
import styles from "../../employee.module.css";
export const dynamic = "force-dynamic";
type RecordValue = Record<string, unknown>;
function auditChanges(detail: unknown) {
  if (!detail || typeof detail !== "object" || !("after" in detail) || !detail.after || typeof detail.after !== "object") return [];
  const after = detail.after as RecordValue;
  const before = "before" in detail && detail.before && typeof detail.before === "object" ? detail.before as RecordValue : {};
  const labels: Record<string, string> = { fullName: "Full Name", email: "Email", department: "Department", designation: "Designation", joinedOn: "Joining Date", phone: "Phone", status: "Status" };
  return Object.entries(labels).filter(([key]) => key in after && before[key] !== after[key]).map(([key, label]) => label + ": " + employeeValue(before[key]) + " → " + employeeValue(after[key]));
}
export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await currentHR(); if (!hr) redirect("/hr/login");
  const { id } = await params;
  const employee = await employeeDetail(id, hr).catch(error => { if (error instanceof PortalError && error.status === 404) notFound(); throw error; });
  const history = await employeeHistory(id, hr);
  const event = (row: RecordValue, index: number, children: React.ReactNode) => <article className={styles.history} key={String(row.id || index)}>{children}</article>;
  return <main className={styles.page}><header className={styles.header}><p>ALLEN ALIGNER · EMPLOYEE HISTORY</p><h1>{employee.fullName}</h1><p>{employee.employeeCode}</p></header><EmployeeNav active="history" canCreate={["HR_ADMIN", "HR_OFFICER"].includes(hr.role)} /><p><Link href={"/hr/employees/" + encodeURIComponent(employee.id)}>Back to Employee Profile</Link></p><p className={styles.muted}>Showing the latest 200 records in each category.</p>
    <section className={styles.panel}><h2>Profile Changes</h2>{!history.profile.length && <p>No profile changes recorded.</p>}{history.profile.map((row, i) => event(row, i, <><p><strong>{employeeDate(row.changedAt)}</strong></p><p>Name: {employeeValue(row.oldFullName)} → {employeeValue(row.newFullName)}</p><p>Email: {employeeValue(row.oldEmail)} → {employeeValue(row.newEmail)}</p><p>Status: {employeeValue(row.oldStatus)} → {employeeValue(row.newStatus)}</p><p>Changed by HR user: {employeeValue(row.actorEmail || row.changedBy)}</p></>))}</section>
    <section className={styles.panel}><h2>Department & Designation History</h2>{!history.position.length && <p>No position changes recorded.</p>}{history.position.map((row, i) => event(row, i, <><p><strong>{employeeDate(row.effectiveDate || row.changedAt)}</strong></p><p>Department: {employeeValue(row.previousDepartment)} → {employeeValue(row.newDepartment)}</p><p>Designation: {employeeValue(row.previousDesignation)} → {employeeValue(row.newDesignation)}</p><p>Reason: {employeeValue(row.reason)}</p><p>Approval reference: {employeeValue(row.approvalReference)}</p><p>Changed by HR user: {employeeValue(row.actorEmail || row.changedBy)}</p></>))}</section>
    <section className={styles.panel}><h2>Onboarding</h2>{!history.onboarding.length && <p>No onboarding tasks recorded.</p>}{history.onboarding.map((row, i) => event(row, i, <><p><strong>{employeeValue(row.task)}</strong> · {employeeValue(row.status)}</p>{Boolean(row.completedBy) && <p>Completed by HR user: {employeeValue(row.completedBy)}</p>}</>))}</section>
    <section className={styles.panel}><h2>Offboarding</h2>{!history.offboarding.length && <p>No offboarding records.</p>}{history.offboarding.map((row, i) => event(row, i, <><p><strong>{employeeValue(row.exitType)}</strong> · {employeeValue(row.status)}</p><p>Last working day: {employeeDate(row.lastWorkingDay)}</p><p>Created: {employeeDate(row.createdAt)}</p></>))}</section>
    <section className={styles.panel}><h2>HR Audit Log</h2>{!history.audit.length && <p>No HR audit events recorded.</p>}{history.audit.map((row, i) => event(row, i, <><p><strong>{employeeValue(row.action)}</strong></p><p>{employeeDate(row.createdAt)} · {employeeValue(row.actorEmail)}</p>{auditChanges(row.detail).length > 0 && <ul>{auditChanges(row.detail).map(change => <li key={change}>{change}</li>)}</ul>}</>))}</section>
  </main>;
}
