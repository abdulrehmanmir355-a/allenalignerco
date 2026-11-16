import test from "node:test";
import assert from "node:assert/strict";

import {
  approveDoctor
} from "../app/lib/doctor-approval-service.mjs";

import {
  createDoctorApprovalRepository
} from "../app/lib/doctor-approval-pg.mjs";

const base = {
  ownerAuthorized: true,
  ownerId: "owner-test",
  doctorId: "doctor-test",
  clinicId: "clinic-test"
};

function mockPool(options = {}) {
  const events = [];

  const doctor = {
    id: "doctor-test",
    fullName: "Test Doctor",
    email: "doctor@example.com",
    registrationNumber: "TEST-123",
    isVerified: false,
    clinicId: null,
    ...options.doctor
  };

  const client = {
    async query(sql, params = []) {
      if (sql === "BEGIN") {
        events.push("BEGIN");
        return {};
      }

      if (sql === "COMMIT") {
        events.push("COMMIT");
        return {};
      }

      if (sql === "ROLLBACK") {
        events.push("ROLLBACK");
        return {};
      }

      if (sql.includes('FROM "Doctor"')) {
        events.push("LOCK_DOCTOR");
        assert.deepEqual(params, ["doctor-test"]);
        return { rows: [doctor], rowCount: 1 };
      }

      if (sql.includes('FROM "Clinic"')) {
        events.push("GET_CLINIC");
        return {
          rows: [{ id: "clinic-test", name: "Test Clinic" }],
          rowCount: 1
        };
      }

      if (sql.includes('UPDATE "Doctor"')) {
        events.push("UPDATE_DOCTOR");
        assert.deepEqual(params, [
          "doctor-test",
          "clinic-test"
        ]);
        return { rowCount: options.updated ?? 1 };
      }

      if (sql.includes('INSERT INTO "DoctorApprovalAudit"')) {
        events.push("INSERT_AUDIT");

        assert.equal(params[0], "owner-test");
        assert.equal(params[1], "doctor-test");
        assert.equal(params[2], "clinic-test");
        assert.equal(params[3], "DOCTOR_APPROVED");

        if (options.auditFails) {
          throw new Error("AUDIT_WRITE_FAILED");
        }

        return { rowCount: 1 };
      }

      throw new Error("UNEXPECTED_SQL");
    },

    release() {
      events.push("RELEASE");
    }
  };

  return {
    pool: {
      async connect() {
        events.push("CONNECT");
        return client;
      }
    },
    events
  };
}

test("Successful approval commits doctor and audit", async () => {
  const { pool, events } = mockPool();

  const result = await approveDoctor({
    ...base,
    repository: createDoctorApprovalRepository(pool)
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "APPROVED");

  assert.deepEqual(events, [
    "CONNECT",
    "BEGIN",
    "LOCK_DOCTOR",
    "GET_CLINIC",
    "UPDATE_DOCTOR",
    "INSERT_AUDIT",
    "COMMIT",
    "RELEASE"
  ]);
});

test("Wrong clinic causes rollback", async () => {
  const { pool, events } = mockPool({
    doctor: { clinicId: "another-clinic" }
  });

  await assert.rejects(
    approveDoctor({
      ...base,
      repository: createDoctorApprovalRepository(pool)
    }),
    /CLINIC_MISMATCH/
  );

  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("UPDATE_DOCTOR"));
  assert.ok(!events.includes("COMMIT"));
  assert.ok(events.includes("RELEASE"));
});

test("Audit failure causes rollback", async () => {
  const { pool, events } = mockPool({
    auditFails: true
  });

  await assert.rejects(
    approveDoctor({
      ...base,
      repository: createDoctorApprovalRepository(pool)
    }),
    /AUDIT_WRITE_FAILED/
  );

  assert.ok(events.includes("UPDATE_DOCTOR"));
  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("COMMIT"));
  assert.ok(events.includes("RELEASE"));
});

test("Approval conflict prevents audit entry", async () => {
  const { pool, events } = mockPool({
    updated: 0
  });

  await assert.rejects(
    approveDoctor({
      ...base,
      repository: createDoctorApprovalRepository(pool)
    }),
    /APPROVAL_CONFLICT/
  );

  assert.ok(events.includes("ROLLBACK"));
  assert.ok(!events.includes("INSERT_AUDIT"));
  assert.ok(events.includes("RELEASE"));
});

test("Unauthorized caller does not open transaction", async () => {
  const { pool, events } = mockPool();

  await assert.rejects(
    approveDoctor({
      ...base,
      ownerAuthorized: false,
      repository: createDoctorApprovalRepository(pool)
    }),
    /OWNER_ACCESS_REQUIRED/
  );

  assert.deepEqual(events, []);
});
