import test from "node:test";
import assert from "node:assert/strict";

import {
  canClinicUserAccess,
  requireClinicPermission,
  availableClinicActions
} from "../app/lib/clinic-permissions.mjs";

const admin = {
  id: "admin-1",
  clinicId: "clinic-A",
  role: "CLINIC_ADMIN",
  isActive: true,
  canAccessPatients: true
};

const staff = {
  ...admin,
  id: "staff-1",
  role: "CLINIC_STAFF"
};

const viewer = {
  ...admin,
  id: "viewer-1",
  role: "CLINIC_VIEWER"
};

function allowed(user, action, clinicId = "clinic-A") {
  return canClinicUserAccess({
    user,
    clinicId,
    action
  });
}

test("Admin may manage clinic team", () => {
  assert.equal(allowed(admin, "team:manage"), true);
});

test("Staff cannot manage clinic team", () => {
  assert.equal(allowed(staff, "team:manage"), false);
});

test("Viewer cannot modify patients", () => {
  assert.equal(allowed(viewer, "patients:write"), false);
});

test("Viewer can read patients when permitted", () => {
  assert.equal(allowed(viewer, "patients:read"), true);
});

test("Staff can create cases when permitted", () => {
  assert.equal(allowed(staff, "cases:create"), true);
});

test("Cross-clinic access is denied", () => {
  assert.equal(
    allowed(admin, "patients:read", "clinic-B"),
    false
  );
});

test("Inactive user is denied", () => {
  assert.equal(
    allowed({ ...admin, isActive: false }, "team:read"),
    false
  );
});

test("Unassigned clinic user is denied", () => {
  assert.equal(
    allowed({ ...admin, clinicId: null }, "clinic:read"),
    false
  );
});

test("Patient permission flag is enforced", () => {
  const restricted = {
    ...staff,
    canAccessPatients: false
  };

  assert.equal(
    allowed(restricted, "patients:read"),
    false
  );

  assert.equal(
    allowed(restricted, "cases:read"),
    false
  );

  assert.equal(
    allowed(restricted, "documents:read"),
    false
  );
});

test("Unknown actions are denied", () => {
  assert.equal(
    allowed(admin, "database:delete"),
    false
  );
});

test("Unknown roles are denied", () => {
  assert.equal(
    allowed({
      ...admin,
      role: "UNKNOWN_ROLE"
    }, "clinic:read"),
    false
  );
});

test("Denied permission throws 403", () => {
  assert.throws(
    () => requireClinicPermission({
      user: viewer,
      clinicId: "clinic-A",
      action: "team:manage"
    }),
    error => error.status === 403
  );
});

test("Available actions respect the role", () => {
  const actions = availableClinicActions({
    user: viewer,
    clinicId: "clinic-A"
  });

  assert.ok(actions.includes("patients:read"));
  assert.ok(!actions.includes("patients:write"));
  assert.ok(!actions.includes("team:manage"));
});
