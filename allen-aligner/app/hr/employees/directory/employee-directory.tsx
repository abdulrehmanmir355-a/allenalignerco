import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { employeeList } from "../../../lib/employee-service";
import { EmployeeNav } from "../employee-shell";
import LiveDirectory from "./live-directory";
import styles from "../employee.module.css";
export type EmployeeSearch = { q?: string; status?: string; page?: string };
export default async function EmployeeDirectory({ search, fixedStatus }: { search: EmployeeSearch; fixedStatus?: "ACTIVE" | "INACTIVE" }) {
  const hr = await currentHR();
  if (!hr) redirect("/hr/login");
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 200) : "";
  const status = fixedStatus || (["ACTIVE", "INACTIVE", "OFFBOARDING"].includes(search.status || "") ? search.status : undefined);
  const rawPage = Number(search.page);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const data = await employeeList(hr, { q, status, page });
  const title = fixedStatus === "ACTIVE" ? "Active Employees" : fixedStatus === "INACTIVE" ? "Inactive Employees" : "All Employees";
  return <main className={styles.page}>
    <header className={styles.header}><p>ALLEN ALIGNER · HUMAN RESOURCES</p><h1>{title}</h1><p>Employee profiles and employment records</p></header>
    <EmployeeNav active={fixedStatus === "ACTIVE" ? "active" : fixedStatus === "INACTIVE" ? "inactive" : "all"} canCreate={["HR_ADMIN", "HR_OFFICER"].includes(hr.role)} />
    <LiveDirectory initialEmployees={data.employees} initialTotal={data.total} initialPage={data.page} pageSize={data.pageSize} initialQuery={q} initialStatus={status || ""} fixedStatus={fixedStatus} />
  </main>;
}
