export type OffboardingEvidence = {
  accountDisabled: boolean;
  sessionsRevoked: boolean;
  openWorkTransferred: boolean;
  assetsCleared: boolean;
  auditRecorded: boolean;
};

export function checkOffboardingReadiness(
  evidence: Partial<OffboardingEvidence> | null | undefined
) {
  const blockers: string[] = [];

  if (evidence?.accountDisabled !== true)
    blockers.push("Employee account is still active.");

  if (evidence?.sessionsRevoked !== true)
    blockers.push("Active sessions have not been revoked.");

  if (evidence?.openWorkTransferred !== true)
    blockers.push("Open work handover is incomplete.");

  if (evidence?.assetsCleared !== true)
    blockers.push("Company asset clearance is incomplete.");

  if (evidence?.auditRecorded !== true)
    blockers.push("Required audit evidence is missing.");

  return {
    canComplete: blockers.length === 0,
    blockers,
  };
}
