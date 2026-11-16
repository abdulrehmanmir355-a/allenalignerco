const test=require('node:test'),assert=require('node:assert/strict');
const {transitionWorkflow,managedLabProblem,workflowActionSchema,availableWorkflowActions,workflowActions}=require('../app/lib/extended-workflow-policy.ts');
const production=()=>({status:'IN_PRODUCTION',qcState:'PENDING',qcPlanId:null,careStage:'NOT_STARTED',latestPlanId:'p2',clinicalApproved:true,doctorApproved:true});
const released=()=>({...production(),status:'SHIPPED',qcState:'PASSED',qcPlanId:'p2'});
const legacy=()=>({...production(),status:'COMPLETED',qcState:null,qcPlanId:null,careStage:null,latestPlanId:null,clinicalApproved:false,doctorApproved:false});
function blocked(fn,status=409){assert.throws(fn,e=>e.status===status);}
test('only case lab grants may record QC and only assigned-doctor role may record care actions',()=>{
 for(const role of ['CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER','ADMIN','LEAD','REVIEWER','UNKNOWN'])for(const action of workflowActions)blocked(()=>transitionWorkflow(role,production(),action),403);
 blocked(()=>transitionWorkflow('DOCTOR',production(),'qc_pass'),403);
 blocked(()=>transitionWorkflow('LAB',released(),'start_treatment'),403);
 assert.deepEqual(availableWorkflowActions('LAB',production()),['qc_pass','qc_fail']);
});
test('QC release requires every finding, current revision, notes and explicit confirmation',()=>{
 const complete={caseAndPlan:true,prescription:true,inspection:true,packaging:true};
 const body={action:'qc_pass',revision:'5',notes:'Inspection recorded',confirmed:'yes',checklist:complete};
 assert.equal(workflowActionSchema.parse(body).revision,5);
 for(const key of Object.keys(complete))assert(!workflowActionSchema.safeParse({...body,checklist:{...complete,[key]:false}}).success);
 for(const v of [{...body,checklist:undefined},{...body,confirmed:false},{...body,notes:' '},{...body,revision:-1},{...body,revision:''},{...body,revision:'9007199254740992'},{...body,actor:'spoofed'},{...body,status:'SHIPPED'}])assert(!workflowActionSchema.safeParse(v).success);
 assert(workflowActionSchema.safeParse({...body,action:'qc_fail',checklist:undefined}).success);
});
test('QC is bound to the current internally and doctor-approved manufacturing plan',()=>{
 for(const override of [{status:'APPROVED'},{status:'SHIPPED'},{clinicalApproved:false},{doctorApproved:false},{latestPlanId:null}])blocked(()=>transitionWorkflow('LAB',{...production(),...override},'qc_pass'));
 const passed=transitionWorkflow('LAB',production(),'qc_pass');assert.equal(passed.qcPlanId,'p2');assert.equal(passed.qcState,'PASSED');
 const failed=transitionWorkflow('LAB',{...production(),...passed},'qc_fail');assert.equal(failed.qcState,'FAILED');assert(managedLabProblem({...production(),...failed},'SHIPPED'));
});
test('enrolled cases cannot dispatch with failed, missing or obsolete QC, or bypass doctor completion',()=>{
 for(const override of [{qcState:'PENDING'},{qcState:'FAILED'},{qcPlanId:'p1'},{clinicalApproved:false},{doctorApproved:false},{latestPlanId:null}])assert(managedLabProblem({...released(),...override},'SHIPPED'));
 assert.equal(managedLabProblem(released(),'SHIPPED'),null);
 assert(managedLabProblem(released(),'COMPLETED'));
 assert.equal(managedLabProblem(legacy(),'COMPLETED'),null);
});
test('treatment starts only after dispatch, with current QC evidence and doctor confirmation',()=>{
 assert.equal(transitionWorkflow('DOCTOR',released(),'start_treatment').careStage,'ACTIVE');
 for(const override of [{status:'IN_PRODUCTION'},{qcState:'FAILED'},{qcPlanId:'p1'},{clinicalApproved:false},{careStage:'RETENTION'}])blocked(()=>transitionWorkflow('DOCTOR',{...released(),...override},'start_treatment'));
});
test('untracked cases require explicit enrollment without backfilling or asserting historical QC',()=>{
 const snapshot=legacy();const enrolled=transitionWorkflow('DOCTOR',snapshot,'enable');
 assert.equal(enrolled.qcState,'NOT_RECORDED');assert.equal(enrolled.careStage,'NOT_STARTED');assert.equal(enrolled.status,'COMPLETED');assert.equal(snapshot.careStage,null);
 assert.equal(transitionWorkflow('DOCTOR',{...snapshot,...enrolled},'start_treatment').careStage,'ACTIVE');
 assert.equal(transitionWorkflow('DOCTOR',{...snapshot,status:'DRAFT'},'enable').qcState,'PENDING');
 blocked(()=>transitionWorkflow('DOCTOR',legacy(),'start_treatment'));
 blocked(()=>transitionWorkflow('DOCTOR',released(),'enable'));
});
test('refinement retains the existing case and resets QC for a new approval/manufacturing cycle',()=>{
 const active={...released(),careStage:'ACTIVE'};const refine=transitionWorkflow('DOCTOR',active,'request_refinement');
 assert.equal(refine.status,'CHANGES_REQUESTED');assert.equal(refine.careStage,'REFINEMENT');assert.equal(refine.qcState,'PENDING');assert.equal(refine.qcPlanId,null);
 blocked(()=>transitionWorkflow('DOCTOR',{...active,...refine},'resume_treatment'));
 blocked(()=>transitionWorkflow('DOCTOR',{...active,careStage:'REFINEMENT',qcPlanId:'p1'},'resume_treatment'));
 blocked(()=>transitionWorkflow('DOCTOR',{...active,careStage:'REFINEMENT',qcState:'NOT_RECORDED',qcPlanId:null},'resume_treatment'));
 assert.equal(transitionWorkflow('DOCTOR',{...released(),careStage:'REFINEMENT'},'resume_treatment').careStage,'ACTIVE');
 assert.deepEqual(active,{...released(),careStage:'ACTIVE'});
});
test('retention requires clinical completion and cannot be skipped, reopened or automatically completed',()=>{
 const active={...released(),careStage:'ACTIVE'};
 blocked(()=>transitionWorkflow('DOCTOR',active,'start_retention'));
 const completed={...active,...transitionWorkflow('DOCTOR',active,'complete_treatment')};assert.equal(completed.status,'COMPLETED');
 blocked(()=>transitionWorkflow('DOCTOR',completed,'complete_retention'));
 const retention={...completed,...transitionWorkflow('DOCTOR',completed,'start_retention')};
 assert.equal(transitionWorkflow('DOCTOR',retention,'retention_review').careStage,'RETENTION');
 const done={...retention,...transitionWorkflow('DOCTOR',retention,'complete_retention')};assert.equal(done.careStage,'RETENTION_COMPLETED');
 assert.deepEqual(availableWorkflowActions('DOCTOR',done),[]);
 blocked(()=>transitionWorkflow('DOCTOR',done,'request_refinement'));
});
test('progress notes and review notes are available only in the appropriate active stage',()=>{
 const active={...released(),careStage:'ACTIVE'};assert.deepEqual(transitionWorkflow('DOCTOR',active,'progress'),{status:'SHIPPED',qcState:'PASSED',qcPlanId:'p2',careStage:'ACTIVE'});
 blocked(()=>transitionWorkflow('DOCTOR',released(),'progress'));
 blocked(()=>transitionWorkflow('DOCTOR',active,'retention_review'));
 assert(!workflowActionSchema.safeParse({action:'progress',revision:0,notes:'Recorded review',confirmed:true,checklist:{caseAndPlan:true,prescription:true,inspection:true,packaging:true}}).success);
});
