import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { employeeDetail } from "../../../lib/employee-service";
import { PortalError } from "../../../lib/portal-http";
import DocumentList from "../../documents/document-list";
import { EmployeeNav, employeeDate, employeeValue } from "../employee-shell";
import styles from "../employee.module.css";
export const dynamic = "force-dynamic";
export default async function EmployeeProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; documents?: string; remaining?: string }> }) {
  const hr = await currentHR(); if (!hr) redirect("/hr/login");
  const { id } = await params; const query = await searchParams;
  const employee = await employeeDetail(id, hr).catch(error => { if (error instanceof PortalError && error.status === 404) notFound(); throw error; });
  const href = "/hr/employees/" + encodeURIComponent(employee.id);
  const canWrite = ["HR_ADMIN", "HR_OFFICER"].includes(hr.role);
  const fields: [string, unknown][] = [["Employee ID (login)", employee.permanentId], ["Employee Code", employee.employeeCode], ["Internal Employee ID", employee.id], ["Full Name", employee.fullName], ["Email", employee.email], ["Phone", employee.phone], ["Department", employee.department], ["Designation", employee.designation], ["Employment Status", employee.status], ["Joining Date", employeeDate(employee.joinedOn)], ["Created", employeeDate(employee.createdAt)], ["Last Updated", employeeDate(employee.updatedAt)]];
  return <main className={styles.page}><header className={styles.header}><p>ALLEN ALIGNER · EMPLOYEE PROFILE</p><h1>{employee.fullName}</h1><p>{employee.employeeCode} · {employee.status}</p></header><EmployeeNav canCreate={canWrite} />
    {(query.created === "1" || query.saved === "1") && <p role="status" className={styles.notice}>{query.created === "1" ? "Employee saved successfully." : "Employee profile updated successfully."} Employee code: <strong>{employee.employeeCode}</strong>.</p>}
    {query.documents === "failed" && <p role="alert" className={styles.error}>The employee record was saved, but one or more documents could not be uploaded{query.remaining ? " (" + query.remaining + " file" + (query.remaining === "1" ? "" : "s") + " need attention)" : ""}. You can retry from <Link href={"/hr/documents?employeeId=" + encodeURIComponent(employee.id)}>Upload Employee Documents</Link>. The employee was not duplicated.</p>}
    <section className={styles.panel}><h2>Employee Details</h2><dl className={styles.details}>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{employeeValue(value)}</dd></div>)}</dl><div className={styles.actions}>{canWrite && <Link className={styles.button} href={href + "/edit"}>Edit Employee</Link>}<Link className={styles.button} href={href + "/history"}>Employee History</Link><Link className={styles.button} href={"/hr/manage/onboarding?employeeId=" + encodeURIComponent(employee.id)}>Employee Onboarding</Link><Link className={styles.button} href={"/hr/manage/offboarding?employeeId=" + encodeURIComponent(employee.id)}>Employee Offboarding</Link></div></section>
    <section className={styles.panel}><h2>Employee Documents</h2>{canWrite && <p><Link href={"/hr/documents?employeeId=" + encodeURIComponent(employee.id)}>Upload Employee Documents</Link></p>}{hr.role === "HR_ADMIN" && <p><Link href={"/hr/documents/manage?employeeId=" + encodeURIComponent(employee.id)}>Manage Documents & Audit</Link></p>}<DocumentList employeeId={employee.id} refreshKey={0} /></section>
  </main>;
}
