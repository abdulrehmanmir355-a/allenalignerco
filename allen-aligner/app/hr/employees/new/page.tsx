import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { db } from "../../../lib/database";
import EmployeeForm from "../employee-form";
import { EmployeeNav } from "../employee-shell";
import styles from "../employee.module.css";
export const dynamic = "force-dynamic";
export default async function NewEmployeePage() {
  const hr = await currentHR();
  if (!hr) redirect("/hr/login");
  if (!["HR_ADMIN", "HR_OFFICER"].includes(hr.role)) return <main className={styles.page}><h1>Access Denied</h1><p>Your HR account cannot register employees.</p></main>;
  const [departments, designations] = await Promise.all([db.query('SELECT name FROM "HRDepartment" ORDER BY name'), db.query('SELECT name FROM "HRDesignation" ORDER BY name')]);
  return <main className={styles.page}><header className={styles.header}><p>ALLEN ALIGNER · HUMAN RESOURCES</p><h1>Add Employee</h1><p>Create an employee record, then manage their access, onboarding and employment documents from one profile.</p></header><EmployeeNav canCreate /><section className={styles.panel}><EmployeeForm departments={departments.map(row => String(row.name))} designations={designations.map(row => String(row.name))} /></section></main>;
}
