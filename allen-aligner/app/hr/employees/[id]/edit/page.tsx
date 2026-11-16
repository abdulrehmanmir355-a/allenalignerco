import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentHR } from "../../../../lib/hr-auth";
import { db } from "../../../../lib/database";
import { employeeDetail } from "../../../../lib/employee-service";
import { PortalError } from "../../../../lib/portal-http";
import EmployeeForm from "../../employee-form";
import { EmployeeNav } from "../../employee-shell";
import styles from "../../employee.module.css";
export const dynamic = "force-dynamic";
export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await currentHR(); if (!hr) redirect("/hr/login");
  if (!["HR_ADMIN", "HR_OFFICER"].includes(hr.role)) return <main className={styles.page}><h1>Access Denied</h1><p>Your HR account cannot edit employees.</p></main>;
  const { id } = await params;
  const employee = await employeeDetail(id, hr).catch(error => { if (error instanceof PortalError && error.status === 404) notFound(); throw error; });
  const [departments, designations] = await Promise.all([db.query('SELECT name FROM "HRDepartment" ORDER BY name'), db.query('SELECT name FROM "HRDesignation" ORDER BY name')]);
  return <main className={styles.page}><header className={styles.header}><p>ALLEN ALIGNER · HUMAN RESOURCES</p><h1>Edit Employee</h1><p>{employee.employeeCode} · {employee.fullName}</p></header><EmployeeNav canCreate /><section className={styles.panel}><p><Link href={"/hr/employees/" + encodeURIComponent(employee.id)}>Back to Employee Profile</Link></p><p>Employee code: <strong>{employee.employeeCode}</strong>. The employee identity remains unchanged.</p><EmployeeForm employee={JSON.parse(JSON.stringify(employee))} administrator={hr.role === "HR_ADMIN"} departments={departments.map(row => String(row.name))} designations={designations.map(row => String(row.name))} /><p className={styles.muted}>Use the offboarding workflow for exit requests, clearance and settlement.</p></section></main>;
}
