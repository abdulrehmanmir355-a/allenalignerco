import "server-only";
import { currentHR } from "./hr-auth";

// Payroll uses the database-backed HR session, including its expiry and
// account-active checks. It never trusts the old localhost-only file login.
export async function currentFinance() {
  return currentHR();
}

export async function financeActionActor() {
  return currentHR();
}
