const test = require('node:test');
const assert = require('node:assert/strict');
const { nextPlanVersion, restoredPlanMetadata, isCurrentPlanDecision } = require('../app/lib/plan-version-policy.mjs');

test('plan versions advance sequentially from the latest case version', () => {
  assert.equal(nextPlanVersion(0), 1);
  assert.equal(nextPlanVersion(1), 2);
  assert.equal(nextPlanVersion(7), 8);
  assert.throws(() => nextPlanVersion(-1), /INVALID_LATEST_VERSION/);
});

test('restoring a prior plan creates pending next-version metadata without mutating its source', () => {
  const source = { id: 'plan-v2', version: 2, summary: 'Original specialist plan' };
  const restored = restoredPlanMetadata(source, 'Reopen staging details');
  assert.deepEqual(restored, {
    summary: source.summary,
    parentPlanId: source.id,
    changeSummary: 'Restored from version 2: Reopen staging details',
    decision: 'PENDING'
  });
  assert.equal(source.version, 2);
  assert.throws(() => restoredPlanMetadata(source, ''), /RESTORE_REASON_REQUIRED/);
});

test('doctor decision accepts only the pending latest version in doctor review', () => {
  const current = { id: 'plan-v3', decision: 'PENDING' };
  assert.equal(isCurrentPlanDecision({ caseStatus: 'REVIEW', latestPlan: current, requestedPlanId: 'plan-v3' }), true);
  assert.equal(isCurrentPlanDecision({ caseStatus: 'REVIEW', latestPlan: current, requestedPlanId: 'plan-v2' }), false);
  assert.equal(isCurrentPlanDecision({ caseStatus: 'PLANNING', latestPlan: current, requestedPlanId: 'plan-v3' }), false);
  assert.equal(isCurrentPlanDecision({ caseStatus: 'REVIEW', latestPlan: { ...current, decision: 'APPROVED' }, requestedPlanId: 'plan-v3' }), false);
});
