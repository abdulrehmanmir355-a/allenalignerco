export function nextPlanVersion(latestVersion = 0) {
  if (!Number.isSafeInteger(latestVersion) || latestVersion < 0) throw new Error('INVALID_LATEST_VERSION');
  return latestVersion + 1;
}

export function restoredPlanMetadata(source, reason) {
  if (!source || typeof source.id !== 'string' || !source.id || !Number.isSafeInteger(source.version) || source.version < 1) throw new Error('INVALID_SOURCE_VERSION');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 5 || text.length > 1000) throw new Error('RESTORE_REASON_REQUIRED');
  return {
    summary: source.summary,
    parentPlanId: source.id,
    changeSummary: `Restored from version ${source.version}: ${text}`,
    decision: 'PENDING'
  };
}

export function isCurrentPlanDecision({ caseStatus, latestPlan, requestedPlanId }) {
  return caseStatus === 'REVIEW' && !!latestPlan && latestPlan.id === requestedPlanId && latestPlan.decision === 'PENDING';
}
