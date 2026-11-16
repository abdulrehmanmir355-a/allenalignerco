import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPayroll,
  canEditPayrollSalary,
  canGeneratePayroll
} from "../app/lib/payroll-access.ts";

const hrRoles = ["HR_ADMIN", "HR_OFFICER", "HR_VIEWER"];

test("all authorized HR team roles have equal payroll access and draft processing", () => {
  for (const role of hrRoles) {
    assert.equal(canAccessPayroll(role), true);
    assert.equal(canGeneratePayroll(role), true);
  }
});

test("payroll access rejects non-HR and missing roles", () => {
  for (const role of ["OWNER", "DOCTOR", "EMPLOYEE", "CLINIC", "", null, undefined]) {
    assert.equal(canAccessPayroll(role), false);
    assert.equal(canGeneratePayroll(role), false);
  }
});

test("salary policy changes remain restricted to HR administrators", () => {
  assert.equal(canEditPayrollSalary("HR_ADMIN"), true);
  for (const role of ["HR_OFFICER", "HR_VIEWER", "OWNER", "DOCTOR", null]) {
    assert.equal(canEditPayrollSalary(role), false);
  }
});
