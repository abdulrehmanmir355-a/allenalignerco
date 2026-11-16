import test from "node:test";
import assert from "node:assert/strict";

import {
  approveDoctor
} from "../app/lib/doctor-approval-service.mjs";

function makeRepository(options = {}) {
  const events = [];

  const doctor = {
    id: "doctor-001",
    fullName: "Test Doctor",
    email: "doctor@example.com",
    registrationNumber: "TEST-001",
    isVerified: false,
    clinicId: null,
    ...options.doctor
  };

  const repository = {
    inTransaction: async (work) => {
      events.push("BEGIN");

      try {
        const result = await work({
          getDoctorForUpdate: async () => {
            events.push("LOCK_DOCTOR");
            return doctor;
          },
          getClinic: async () => {
            events.push("GET_CLINIC");
            return { id: "clinic-001" };
          },
          setDoctorApproved: async () => {
            events.push("APPROVE");
            return options.updated ?? 1;
          },
          writeAudit: async () => {
            events.push("AUDIT");

            if (options.auditFails) {
              throw new Error("AUDIT_FAILED");
            }
          }
        });

        events.push("COMMIT");
        return result;
      } catch (error) {
        events.push("ROLLBACK");
        throw error;
      }
    }
  };

  return { repository, events };
}

const base = {
  ownerAuthorized: true,
  ownerId: "owner-001",
  doctorId: "doctor-001",
  clinicId: "clinic-001"
};

test("Approves doctor and writes audit", async () => {
  const { repository, events } = makeRepository();

  const result = await approveDoctor({
    ...base,
    repository
  });

  assert.equal(result.status, "APPROVED");
  assert.deepEqual(events, [
    "BEGIN",
    "LOCK_DOCTOR",
    "GET_CLINIC",
    "APPROVE",
    "AUDIT",
    "COMMIT"
  ]);
});

test("Rejects unauthorized owner", async () => {
  const { repository, events } = makeRepository();

  await assert.rejects(
    approveDoctor({
      ...base,
      ownerAuthorized: false,
      repository
    }),
    /OWNER_ACCESS_REQUIRED/
  );

  assert.deepEqual(events, []);
});

test("Rejects doctor already verified", async () => {
  const { repository, events } = makeRepository({
    doctor: { isVerified: true }
  });

  await assert.rejects(
    approveDoctor({ ...base, repository }),
    /DOCTOR_ALREADY_VERIFIED/
  );

  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("APPROVE"));
});

test("Rejects different clinic", async () => {
  const { repository } = makeRepository({
    doctor: { clinicId: "other-clinic" }
  });

  await assert.rejects(
    approveDoctor({ ...base, repository }),
    /CLINIC_MISMATCH/
  );
});

test("Rejects concurrent approval conflict", async () => {
  const { repository, events } = makeRepository({
    updated: 0
  });

  await assert.rejects(
    approveDoctor({ ...base, repository }),
    /APPROVAL_CONFLICT/
  );

  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("AUDIT"));
});

test("Audit failure rolls transaction back", async () => {
  const { repository, events } = makeRepository({
    auditFails: true
  });

  await assert.rejects(
    approveDoctor({ ...base, repository }),
    /AUDIT_FAILED/
  );

  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("COMMIT"));
});
