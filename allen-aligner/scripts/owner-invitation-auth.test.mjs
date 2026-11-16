import test from "node:test";
import assert from "node:assert/strict";
import { canIssueOwnerInvitation, canRevokeOwnerInvitation, matchesOwnerHRAuditActor, ownerHRAuditEmail, resolveHRAuthorizationActor } from "../app/lib/owner-role-policy.ts";

test("every authorized HR team role can issue Owner invitations", () => {
  for (const role of ["HR_ADMIN", "HR_OFFICER", "HR_VIEWER"]) assert.equal(canIssueOwnerInvitation(role), true);
});

test("non-HR and unauthenticated roles cannot issue Owner invitations", () => {
  for (const role of ["DOCTOR", "EMPLOYEE", "CLINIC", "OWNER", "", null, undefined]) assert.equal(canIssueOwnerInvitation(role), false);
});

test("HR Viewers can issue by request but retain read-only revocation access", () => {
  assert.equal(canIssueOwnerInvitation("HR_VIEWER"), true);
  assert.equal(canRevokeOwnerInvitation("HR_VIEWER"), false);
  assert.equal(canRevokeOwnerInvitation("HR_ADMIN"), true);
  assert.equal(canRevokeOwnerInvitation("HR_OFFICER"), true);
  assert.equal(canRevokeOwnerInvitation("OWNER"), false);
});

test("only the inactive, non-login HR audit actor for a valid Owner session bridges HR permissions", () => {
  const owner = { id: "owner-uuid", ownerId: "AA-OWN-ABCDEF1234" };
  const proxy = { id: owner.id, ownerId: owner.ownerId };
  assert.equal(ownerHRAuditEmail(owner.ownerId), "owner+aa-own-abcdef1234@owner.invalid");
  assert.equal(matchesOwnerHRAuditActor(proxy, { id: owner.id, email: ownerHRAuditEmail(owner.ownerId), role: "HR_ADMIN", isActive: false }), true);
  assert.equal(matchesOwnerHRAuditActor(proxy, { id: owner.id, email: ownerHRAuditEmail(owner.ownerId), role: "HR_ADMIN", isActive: true }), false);
  assert.equal(matchesOwnerHRAuditActor(proxy, { id: owner.id, email: ownerHRAuditEmail(owner.ownerId), role: "HR_OFFICER", isActive: false }), false);
  assert.equal(matchesOwnerHRAuditActor(proxy, { id: "other", email: ownerHRAuditEmail(owner.ownerId), role: "HR_ADMIN", isActive: false }), false);
});

test("an authenticated Owner reaches HR pages without an HR session or registration", () => {
  const owner = { id: "owner-uuid", ownerId: "AA-OWN-ABCDEF1234", email: "owner@example.test" };
  const auditActor = { id: owner.id, email: ownerHRAuditEmail(owner.ownerId), role: "HR_ADMIN", isActive: false };
  assert.deepEqual(resolveHRAuthorizationActor(null, owner, auditActor), {
    id: owner.id,
    email: owner.email,
    role: "HR_ADMIN"
  });
});

test("invalid Owner audit actors and unauthenticated visitors do not gain HR access", () => {
  const owner = { id: "owner-uuid", ownerId: "AA-OWN-ABCDEF1234", email: "owner@example.test" };
  assert.equal(resolveHRAuthorizationActor(null, null, null), null);
  assert.equal(resolveHRAuthorizationActor(null, owner, {
    id: owner.id,
    email: ownerHRAuditEmail(owner.ownerId),
    role: "HR_ADMIN",
    isActive: true
  }), null);
});
