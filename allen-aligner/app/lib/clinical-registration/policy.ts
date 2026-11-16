/** Editable registration policy. Change these values instead of scattering rules through pages. */
export const clinicalRegistrationPolicy = {
  /** Registration invitation codes only. Password-reset codes use hrPasswordCodeHours. */
  invitationHours: 168,
  hrPasswordCodeHours: 24,
  resetHours: 1,
  passwordMin: 12,
  passwordMax: 72,
  invitationRoles: ["REVIEWER", "LEAD"] as const,
  /** A valid HR invitation for a verified employee activates clinical access without a second approval. */
  hrInvitationActivatesAccess: true,
  /** Direct registration stays pending until an Admin or Owner decides it. */
  standardRequiresApproval: true,
  /** HR invitations cannot grant clinical administration. */
  hrCanGrantAdmin: false,
  suspendClearsClinicalRole: true,
  suspendDisablesEmployeePortal: false,
};

export type ClinicalRegistrationStatus =
  | "INVITED"
  | "PENDING_VERIFICATION"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "REVOKED";

export type RequestedClinicalRole = (typeof clinicalRegistrationPolicy.invitationRoles)[number];

export function passwordProblems(password: string) {
  const problems: string[] = [];
  if (password.length < clinicalRegistrationPolicy.passwordMin || password.length > clinicalRegistrationPolicy.passwordMax) {
    problems.push(`Use ${clinicalRegistrationPolicy.passwordMin}–${clinicalRegistrationPolicy.passwordMax} characters.`);
  }
  if (Buffer.byteLength(password, "utf8") > 72) problems.push("Use a password of at most 72 UTF-8 bytes.");
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) problems.push("Include at least one letter and one number.");
  return problems;
}

export function registrationFields() {
  return [
    { name: "employeeId", label: "Employee ID", required: true, type: "text" },
    { name: "email", label: "Official employee email", required: true, type: "email" },
    { name: "fullName", label: "Full name", required: false, type: "text" },
    { name: "department", label: "Department", required: false, type: "text" },
    { name: "jobTitle", label: "Job title", required: false, type: "text" },
    { name: "employeeStatus", label: "Employee status", required: false, type: "text" },
    { name: "invitationCode", label: "HR invitation code", required: false, type: "text" },
    { name: "password", label: "Password", required: true, type: "password" },
    { name: "confirmPassword", label: "Confirm password", required: true, type: "password" },
    { name: "role", label: "Requested clinical role", required: true, type: "select", options: ["REVIEWER", "LEAD"] },
    { name: "reason", label: "Reason for access", required: false, type: "textarea" },
  ] as const;
}
