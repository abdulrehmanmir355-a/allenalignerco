const test=require('node:test'),assert=require('node:assert/strict');
const {approvalProblem,clinicalActionSchema,checklistLabels}=require('../app/lib/clinical-validation.ts');
const complete=()=>Object.fromEntries(Object.keys(checklistLabels).map(k=>[k,{result:'CONFIRMED',note:''}]));
test('approval requires all reviewer checklist findings',()=>{assert(approvalProblem({}));assert.equal(approvalProblem(complete()),null);});
test('unresolved concern cannot be approved',()=>{const c=complete();c.movement.result='CONCERN';assert(approvalProblem(c));});
test('not-applicable findings require eligibility and written reasons',()=>{const c=complete();c.ipr.result='NOT_APPLICABLE';assert(approvalProblem(c));c.ipr.note='No IPR in supplied plan';assert.equal(approvalProblem(c),null);c.records.result='NOT_APPLICABLE';c.records.note='Missing';assert(approvalProblem(c));});
test('decision requires plan identity, revision and written reason',()=>{assert(!clinicalActionSchema.safeParse({action:'escalate',revision:0,reason:''}).success);assert(!clinicalActionSchema.safeParse({action:'approve',revision:0,reason:'Reviewed'}).success);assert(clinicalActionSchema.safeParse({action:'escalate',planId:'plan-1',revision:0,reason:'Lead assessment required'}).success);});
