const test = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, lifecycleStages, activityDetail } = require('../app/lib/case-lifecycle.ts');
const { CaseStatus } = require('../app/lib/db-models.ts');
const { labTransitions } = require('../app/lib/lab-workflow.ts');
test('only explicit actor/state transitions are permitted', () => {
  const allowed = new Set(['DOCTOR:DRAFT:SUBMITTED','DOCTOR:REVIEW:APPROVED','DOCTOR:REVIEW:CHANGES_REQUESTED','LAB:SUBMITTED:PLANNING','LAB:APPROVED:IN_PRODUCTION','LAB:IN_PRODUCTION:SHIPPED','LAB:SHIPPED:COMPLETED']);
  for (const role of ['DOCTOR','LAB','CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER','ADMIN','REVIEWER','UNKNOWN'])
    for (const from of Object.keys(CaseStatus)) for (const to of Object.keys(CaseStatus))
      assert.equal(canTransition(role, from, to), allowed.has(`${role}:${from}:${to}`), `${role}:${from}:${to}`);
});
test('lifecycle mapping covers exactly the persisted enum without inventing treatment or retention', () => {
  assert.deepEqual(lifecycleStages.flatMap(s => s.statuses).sort(), Object.keys(CaseStatus).sort());
  for (const [from, targets] of Object.entries(labTransitions)) for (const to of targets) assert(canTransition('LAB', from, to));
});
test('legacy or malformed audit details never acquire a fabricated actor/status', () => {
  for (const value of [null, 'Doctor approved', '{}', '{broken', '{"type":"case_activity"}']) assert.equal(activityDetail(value), null);
  const v = { type: 'case_activity', actor: {id:'doctor-1',name:'Recorded doctor',role:'DOCTOR'},action:'approve',fromStatus:'REVIEW',status:'APPROVED',notes:'Reviewed records' };
  assert.deepEqual(activityDetail(JSON.stringify(v)),v);
  assert.equal(activityDetail(JSON.stringify({...v,status:'RETENTION'})),null);
});
