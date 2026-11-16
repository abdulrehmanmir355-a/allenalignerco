export type PayrollRole = "HR_ADMIN" | "HR_OFFICER" | "HR_VIEWER";

const payrollRoles: readonly PayrollRole[] = [
  "HR_ADMIN",
  "HR_OFFICER",
  "HR_VIEWER"
];

export function canAccessPayroll(role: unknown): role is PayrollRole {
  return typeof role === "string" && payrollRoles.includes(role as PayrollRole);
}

export function canGeneratePayroll(role: unknown): role is PayrollRole {
  return role === "HR_ADMIN" || role === "HR_OFFICER";
}

// Salary policy changes remain reserved to HR administrators.
export function canEditPayrollSalary(role: unknown): role is "HR_ADMIN" {
  return role === "HR_ADMIN";
}

export function canApprovePayroll(role: unknown): role is "HR_ADMIN" {
  return role === "HR_ADMIN";
}

export function canRecordPayrollPayment(role: unknown): role is "HR_ADMIN" {
  return role === "HR_ADMIN";
}
