import Link from "next/link";
import styles from "./employee.module.css";
export function EmployeeNav({ active, canCreate = false }: { active?: string; canCreate?: boolean }) {
  const links = [["all", "/hr/employees/directory", "All Employees"], ["active", "/hr/employees/active", "Active Employees"], ["inactive", "/hr/employees/inactive", "Inactive Employees"], ["onboarding", "/hr/manage/onboarding", "Employee Onboarding"], ["offboarding", "/hr/manage/offboarding", "Employee Offboarding"], ["history", "/hr/employees/history", "Employee History"]];
  return <nav className={styles.nav} aria-label="Employee management">{links.map(([key, href, label]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</Link>)}{canCreate && <Link href="/hr/employees/new">Add Employee</Link>}<Link href="/hr/offboarding/dashboard">HR Dashboard</Link></nav>;
}
export function employeeDate(value: unknown) {
  if (!value) return "Not recorded";
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}
export function employeeValue(value: unknown) { return value === null || value === undefined || value === "" ? "Not recorded" : String(value); }
