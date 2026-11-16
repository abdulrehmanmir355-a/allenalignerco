import { PortalError } from "./portal-http";

// Ordinary Clinical Administrators decide REVIEWER and LEAD registrations.
// They cannot grant those roles directly, and they cannot appoint or remove ADMIN.
export function assertOrdinaryTeamChange(role: "REVIEWER" | "LEAD" | "ADMIN" | null) {
  if (role === "ADMIN") {
    throw new PortalError(403, "Clinical ADMIN appointment and removal are reserved for the Owner or an authorized database administrator.");
  }
  if (role !== null) {
    throw new PortalError(403, "Reviewer and Lead access is granted only by deciding a registration request.");
  }
}
