import test from "node:test";
import assert from "node:assert/strict";
import { navigationGroups } from "../app/lib/navigation.ts";

test("the Owner Portal menu exposes invitation-only registration to signed-out visitors", () => {
  const ownerMenu = navigationGroups({ doctor: false, hr: false, clinic: false, owner: false, clinicalRole: null })
    .find(group => group.id === "owner");
  assert.deepEqual(ownerMenu?.links, [
    ["/owner-login", "Owner Portal Login"],
    ["/owner-register", "Owner Registration · HR Code"]
  ]);
});

test("HR members can reach the HR-issued Owner invitation page", () => {
  const hrMenu = navigationGroups({ doctor: false, hr: true, clinic: false, owner: false, clinicalRole: null })
    .find(group => group.id === "hr");
  assert(hrMenu?.links.some(link => link[0] === "/hr/owner-invitations"));
});
