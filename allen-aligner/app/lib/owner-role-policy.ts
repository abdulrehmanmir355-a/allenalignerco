export const ownerInvitationHRRoles = ["HR_ADMIN", "HR_OFFICER", "HR_VIEWER"] as const;
export type OwnerInvitationHRRole = typeof ownerInvitationHRRoles[number];
export function canIssueOwnerInvitation(role: string | null | undefined): role is OwnerInvitationHRRole {
  return !!role && ownerInvitationHRRoles.includes(role as OwnerInvitationHRRole);
}
export function canRevokeOwnerInvitation(role: string | null | undefined): boolean {
  return role === "HR_ADMIN" || role === "HR_OFFICER";
}
export function ownerHRAuditEmail(ownerId: string): string {
  return `owner+${ownerId.toLowerCase()}@owner.invalid`;
}
export function matchesOwnerHRAuditActor(owner: { id: string; ownerId: string } | null, actor: { id: string; email: string; role: string; isActive: boolean } | null): boolean {
  return !!owner && !!actor && actor.id === owner.id && actor.email === ownerHRAuditEmail(owner.ownerId) && actor.role === "HR_ADMIN" && actor.isActive === false;
}

// Owner audit rows exist only to satisfy legacy HR foreign keys. They must
// never be resolved into an authenticated HR actor.
