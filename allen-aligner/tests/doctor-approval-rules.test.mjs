import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDoctorApproval
} from "../app/lib/doctor-approval-rules.mjs";

const doctor = {
  id: "doctor-001",
  fullName: "Test Doctor",
  email: "doctor@example.com",
  registrationNumber: "TEST-001",
  isVerified: false,
  clinicId: null
};

const clinic = {
  id: "clinic-001"
};

test("Authorized owner can review valid doctor", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor,
    clinic
  });

  assert.equal(result.allowed, true);
  assert.equal(result.clinicId, "clinic-001");
});

test("Unauthorized user cannot approve", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: false,
    doctor,
    clinic
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OWNER_ACCESS_REQUIRED");
});

test("Missing doctor is rejected", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor: null,
    clinic
  });

  assert.equal(result.allowed, false);
});

test("Already verified doctor is rejected", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor: { ...doctor, isVerified: true },
    clinic
  });

  assert.equal(result.allowed, false);
});

test("Wrong clinic assignment is rejected", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor: {
      ...doctor,
      clinicId: "another-clinic"
    },
    clinic
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "CLINIC_MISMATCH");
});

test("Incomplete registration is rejected", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor: {
      ...doctor,
      registrationNumber: null
    },
    clinic
  });

  assert.equal(result.allowed, false);
});

test("Missing clinic is rejected", () => {
  const result = validateDoctorApproval({
    ownerAuthorized: true,
    doctor,
    clinic: null
  });

  assert.equal(result.allowed, false);
});
