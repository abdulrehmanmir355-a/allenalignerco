import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { employeeList } from "../../../lib/employee-service";
import { EmployeeNav } from "../employee-shell";
import styles from "../employee.module.css";
export const dynamic = "force-dynamic";
export default async function HistoryDirectory({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const hr = await currentHR(); if (!hr) redirect("/hr/login");
  const search = await searchParams;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 200) : "";
  const requestedPage = Number(search.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const data = await employeeList(hr, { q, page });
  const pageURL = (number: number) => "?" + new URLSearchParams({ q, page: String(number) });
  return <main className={styles.page}><header className={styles.header}><p>ALLEN ALIGNER · HUMAN RESOURCES</p><h1>Employee History</h1><p>Choose an employee to review profile changes, position changes, onboarding, offboarding and HR audit events.</p></header><EmployeeNav active="history" canCreate={["HR_ADMIN", "HR_OFFICER"].includes(hr.role)} /><section className={styles.panel}><form className={styles.search} method="get"><label>Find employee<input name="q" type="search" defaultValue={q} placeholder="Name or employee code" maxLength={200} /></label><button className={styles.button}>Search</button></form><p>{data.total} employee{data.total === 1 ? "" : "s"} found.</p><div className={styles.table}><table><thead><tr><th>Employee Code</th><th>Employee</th><th>Department</th><th>Actions</th></tr></thead><tbody>{data.employees.map(employee => <tr key={employee.id}><td>{employee.employeeCode}</td><td>{employee.fullName}</td><td>{employee.department}</td><td><Link href={"/hr/employees/" + encodeURIComponent(employee.id) + "/history"}>View History</Link>{" · "}<Link href={"/hr/employees/" + encodeURIComponent(employee.id)}>View Profile</Link></td></tr>)}</tbody></table></div>{!data.employees.length && <p>No employees match this search.</p>}<nav className={styles.actions} aria-label="Employee history pages">{data.page > 1 && <Link className={styles.button} href={pageURL(data.page - 1)}>Previous</Link>}{data.page * data.pageSize < data.total && <Link className={styles.button} href={pageURL(data.page + 1)}>Next</Link>}</nav></section></main>;
}
