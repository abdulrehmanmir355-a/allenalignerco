// Run only AFTER approval and application of the proposal to this isolated test DB.
// This script never executes DDL, backfills data or applies a migration itself.
const root=require('node:path').resolve(__dirname,'..');
require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require(root+'/node_modules/pg');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const url=new URL(process.env.CASE_TIMELINE_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/allen_aligner_clinical_test_20261022')throw Error('Explicit isolated local clinical test database required.');
const db=new Client({connectionString:url.toString(),options:'-c timezone=UTC'}),base='http://127.0.0.1:3149';
let server,logs='',checks=0;
const digest=s=>createHash('sha256').update(s).digest('hex');
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;console.log('PASS '+label);}
async function api(path,cookie='',body,status=200,headers={}) {
  const r=await fetch(base+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();assert.equal(r.status,status,path+' '+text.slice(0,300));checks++;return {r,b:text.startsWith('{')?JSON.parse(text):text};
}
async function blockedSQL(sql,args,label){let denied=false;try{await db.query(sql,args);}catch(e){denied=!!e.code;}equal(denied,true,label);}
async function main(){
  await db.connect();try{
    const schema=await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='PortalCase' AND column_name IN ('qcState','qcPlanId','careStage')`);
    if(schema.rowCount!==3)throw Error('Reviewed migration is not installed in the isolated test DB. Stop here; no migration is applied by this test.');
    try{await fetch(base,{signal:AbortSignal.timeout(1500)});throw Error('Integration test port already in use');}catch(e){if(e.message==='Integration test port already in use')throw e;}
    server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3149'],{cwd:root,env:{...process.env,DATABASE_URL:url.toString(),APP_ORIGIN:base,ALLEN_TEST_BUILD:'true',ENABLE_EXTENDED_CASE_WORKFLOW:'true',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',x=>logs=(logs+x).slice(-10000));server.stderr.on('data',x=>logs=(logs+x).slice(-10000));
    const until=Date.now()+120000;while(!logs.includes('Ready in')){if(server.exitCode!==null||Date.now()>until)throw Error(logs);await new Promise(r=>setTimeout(r,300));}
    const clinics=[randomUUID(),randomUUID()],doctors=[randomUUID(),randomUUID(),randomUUID()],cookies=[];
    for(const id of clinics)await db.query('INSERT INTO "Clinic"(id,name) VALUES($1,$2)',[id,'Synthetic extended workflow']);
    for(let i=0;i<doctors.length;i++){
      await db.query('INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt","registrationNumber") VALUES($1,$2,$3,$4,$5,true,NOW(),$6)',[doctors[i],'Extended workflow doctor '+i,randomUUID()+'@example.invalid','unused-fixture-password',clinics[i===2?1:0],randomUUID()]);
      const token=randomBytes(32).toString('hex');await db.query('INSERT INTO "DoctorSession"("tokenHash","doctorId","expiresAt") VALUES($1,$2,NOW()+interval \'1 hour\')',[digest(token),doctors[i]]);cookies.push('allen_doctor_session='+token);
    }
    const created=await api('/api/portal/cases',cookies[0],{patientReference:'SYNTHETIC EXTENDED WORKFLOW',category:'Initial case',notes:'PRIVATE WORKFLOW NOTES',consent:'yes'},201);
    const id=created.b.redirect.split('/').pop(),portal='/api/portal/cases/'+id,workflow=portal+'/workflow',lab='/api/lab/cases/'+id;
    const token=randomBytes(32).toString('hex'),auth={Authorization:'Bearer '+token};
    await db.query('INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[id,digest(token),'Extended workflow lab']);
    const view=async()=>(await api(workflow,cookies[0])).b;
    const doc=async(action,status=200,extra={})=>api(workflow,cookies[0],{action,revision:(await view()).revision,notes:'PRIVATE '+action+' reviewed and confirmed',confirmed:true,...extra},status);
    const labAction=async(body,status=200)=>api(lab,'',{revision:(await view()).revision,...body},status,auth);
    const qc=async(action,status=200,extra={})=>api(lab+'/workflow','',{action,revision:(await view()).revision,notes:'Synthetic current-plan inspection',confirmed:true,...extra},status,auth);
    let s=await view();equal([s.qcState,s.careStage],['PENDING','NOT_STARTED'],'new cases are enrolled only after activation');
    await api(workflow,'',undefined,401);await api(workflow,cookies[1],undefined,404);await api(workflow,cookies[2],undefined,404);
    await api(workflow,cookies[2],{action:'progress',revision:s.revision,notes:'Other clinic attempt',confirmed:true},404);
    await doc('qc_pass',403,{checklist:{caseAndPlan:true,prescription:true,inspection:true,packaging:true}});
    await api(lab+'/workflow','',{action:'start_treatment',revision:s.revision,notes:'Lab cannot perform clinical action',confirmed:true},403,auth);
    await doc('start_treatment',409);await doc('start_retention',409);
    await api(workflow,cookies[0],{action:'enable',revision:s.revision,notes:'Spoof actor is rejected',confirmed:true,actor:'ADMIN'},400);
    await db.query('INSERT INTO "CaseFile"(id,"caseId",name,mime,size,data) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,'synthetic.pdf','application/pdf',8,Buffer.from('%PDF-1.7')]);
    await api(portal,cookies[0],{action:'submit',revision:(await view()).revision});
    async function publishAndApprove(version){
      await labAction({action:'plan',summary:'Synthetic refinement-capable plan version '+version});
      const plan=(await db.query('SELECT id FROM "TreatmentPlan" WHERE "caseId"=$1 ORDER BY version DESC LIMIT 1',[id])).rows[0].id;
      await api(portal,cookies[0],{action:'approve',planId:plan,revision:(await view()).revision},409);
      // Approval fixture only; real reviewer authorization has its separate regression suite.
      await db.query('UPDATE "ClinicalReview" SET status=\'APPROVED\',"completedAt"=NOW() WHERE "planId"=$1',[plan]);
      await db.query('UPDATE "PortalCase" SET status=\'REVIEW\',revision=revision+1 WHERE id=$1',[id]);
      await api(portal,cookies[0],{action:'approve',planId:plan,revision:(await view()).revision});return plan;
    }
    const plan1=await publishAndApprove(1);
    await qc('qc_pass',409,{checklist:{caseAndPlan:true,prescription:true,inspection:true,packaging:true}});
    await labAction({action:'status',status:'IN_PRODUCTION'});
    await labAction({action:'status',status:'SHIPPED'},409);
    await qc('qc_fail');equal((await view()).qcState,'FAILED','failed QC holds dispatch');
    await blockedSQL('UPDATE "PortalCase" SET status=\'SHIPPED\' WHERE id=$1',[id],'database blocks dispatch without passed QC');
    await qc('qc_pass',400,{checklist:{caseAndPlan:true,prescription:true,inspection:true,packaging:false}});
    const checklist={caseAndPlan:true,prescription:true,inspection:true,packaging:true};
    s=await view();const concurrent=await Promise.all([1,2].map(()=>fetch(base+lab+'/workflow',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({action:'qc_pass',revision:s.revision,notes:'Concurrent QC confirmation',confirmed:true,checklist})})));
    equal(concurrent.map(r=>r.status).sort(),[200,409],'one current QC decision commits; stale concurrent decision fails');
    equal((await view()).qcPlanId,plan1,'QC binds to plan v1');
    await labAction({action:'status',status:'SHIPPED'});await labAction({action:'status',status:'COMPLETED'},409);
    await doc('start_treatment');await doc('progress');equal((await view()).careStage,'ACTIVE','assigned doctor controls active treatment');
    await doc('request_refinement');s=await view();equal([s.status,s.careStage,s.qcState,s.qcPlanId],['CHANGES_REQUESTED','REFINEMENT','PENDING',null],'refinement reuses case, resets QC and opens the existing approval cycle');
    await doc('resume_treatment',409);
    const plan2=await publishAndApprove(2);assert.notEqual(plan2,plan1);checks++;
    await labAction({action:'status',status:'IN_PRODUCTION'});
    await blockedSQL('UPDATE "PortalCase" SET "qcState"=\'PASSED\',"qcPlanId"=$2 WHERE id=$1',[id,plan1],'database rejects earlier-plan QC evidence');
    await labAction({action:'status',status:'SHIPPED'},409);
    await qc('qc_pass',200,{checklist});await labAction({action:'status',status:'SHIPPED'});await doc('resume_treatment');
    await doc('complete_treatment');s=await view();equal([s.status,s.careStage],['COMPLETED','TREATMENT_COMPLETED'],'only clinician-confirmed treatment completion closes an enrolled case');
    await doc('complete_retention',409);await doc('start_retention');await doc('retention_review');await doc('complete_retention');
    s=await view();equal(s.careStage,'RETENTION_COMPLETED','retention follows a separate confirmed review/completion sequence');
    await doc('progress',409);await doc('request_refinement',409);
    await blockedSQL('UPDATE "PortalCase" SET "careStage"=NULL,"qcState"=NULL,"qcPlanId"=NULL WHERE id=$1',[id],'enrollment cannot be removed to bypass QC');
    const timeline=(await api(portal+'/timeline',cookies[0])).b;
    equal(timeline.case.workflow.careStage,'RETENTION_COMPLETED','timeline includes current care phase');
    equal(timeline.entries.some(e=>e.workflow?.qcPlanId===plan2&&e.actor?.role==='LAB'),true,'QC audit includes current plan and original actor');
    equal(timeline.entries.some(e=>e.workflow?.careStage==='REFINEMENT'&&e.notes?.startsWith('PRIVATE')),true,'refinement decisions retain their recorded notes and stage');
    const page=await api('/doctor-dashboard/cases/'+id,cookies[0]);equal(page.b.includes('Treatment and retention'),true,'doctor UI renders activated treatment/retention panel');
    const qcPage=await api('/lab/cases/'+id+'/qc');equal(qcPage.b.includes('Case access token'),true,'QC page requires a case grant before retrieving data');
    await db.query('UPDATE "LabAccess" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE "caseId"=$1',[id]);await api(lab+'/workflow','',undefined,403,auth);
    console.log('Completed '+checks+' enabled-workflow integration checks. Synthetic records retained only in the isolated clinical test database.');
  } finally {await db.end();if(server)server.kill();}
}
main().catch(e=>{console.error(e.stack);if(logs)console.error(logs.slice(-6000));process.exitCode=1;});
