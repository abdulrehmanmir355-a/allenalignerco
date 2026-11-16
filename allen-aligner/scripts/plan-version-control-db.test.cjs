// Runs only in the disposable clone created by verify-plan-version-control.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const u=new URL(process.env.PLAN_VERSION_TEST_DATABASE_URL||'');
if(!['127.0.0.1','localhost'].includes(u.hostname)||!/^\/allen_aligner_plan_test_\d{8}_[a-f0-9]{8}$/.test(u.pathname))throw Error('Disposable local plan-version database required.');
process.env.DATABASE_URL=u.toString();process.env.APP_ORIGIN='http://localhost';
const root=path.resolve(__dirname,'..'),ts=require('typescript'),cache=new Map(),jar=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));cache.set(file,mod);
 mod.require=function(spec){
  if(spec==='server-only')return {};
  if(spec==='next/headers')return {cookies:async()=>({get:name=>jar.has(name)?{value:jar.get(name)}:undefined})};
  if(spec==='next/navigation')return {redirect:()=>{throw Error('Unexpected redirect')}};
  let next=spec.startsWith('@/')?path.join(root,spec.slice(2)):spec.startsWith('.')?path.resolve(path.dirname(file),spec):null;
  if(next&&fs.existsSync(next+'.ts'))return load(next+'.ts');
  return Module.prototype.require.call(this,spec);
 };
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true}}).outputText,file);return mod.exports;
}
let checks=0,database;const db=new Client({connectionString:u.toString()});
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS '+label);};
const q=async(sql,v=[])=>(await db.query(sql,v)).rows;
const hash=x=>createHash('sha256').update(x).digest('hex');
async function blocked(sql,v,label){await assert.rejects(()=>q(sql,v));check(true,label);}
(async()=>{await db.connect();try{
 const clinic=randomUUID(),doctor=randomUUID(),otherDoctor=randomUUID(),caseId=randomUUID();
 await q('INSERT INTO "Clinic"(id,name) VALUES($1,\'Synthetic Module12 QA\')',[clinic]);
 for(const id of [doctor,otherDoctor])await q(`INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt","registrationNumber") VALUES($1,'Synthetic QA',$2,$3,$4,true,now(),$1)`,[id,id+'@example.invalid','$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu123456',clinic]);
 const doctorToken=randomBytes(32).toString('hex'),otherToken=randomBytes(32).toString('hex');
 for(const [id,t]of [[doctor,doctorToken],[otherDoctor,otherToken]])await q('INSERT INTO "DoctorSession"("tokenHash","doctorId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[hash(t),id]);
 const actors={};for(const role of ['LEAD','REVIEWER','PLANNER']){
  const employee=randomUUID(),token=randomBytes(32).toString('hex');
  await q(`INSERT INTO "Employee"(id,"employeeCode","fullName",department,designation,"joinedOn") VALUES($1,'',$2,'QA','Clinical QA','2026-01-01')`,[employee,'Synthetic '+role]);
  const [a]=await q(`UPDATE "WorkAccount" SET "passwordHash"='$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu123456',"isActive"=true,"mustChangePassword"=false,"clinicalRole"=$2 WHERE "employeeId"=$1 RETURNING id`,[employee,role==='PLANNER'?'REVIEWER':role]);
  await q('INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[hash(token),a.id]);actors[role]={id:a.id,employee,token};
 }
 await q(`INSERT INTO "PortalCase"(id,"doctorId","clinicId","patientReference",category,notes,"consentAt",status,"updatedAt") VALUES($1,$2,$3,'Synthetic version QA','QA','Synthetic fixture',now(),'PLANNING',now())`,[caseId,doctor,clinic]);
 const labToken=randomBytes(32).toString('hex');await q(`INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,'Synthetic QA',now()+interval '1 hour')`,[caseId,hash(labToken)]);
 const addFile=async()=>{const id=randomUUID();await q(`INSERT INTO "CaseFile"(id,"caseId",name,mime,size,data) VALUES($1,$2,'scan.pdf','application/pdf',8,$3)`,[id,caseId,Buffer.from('%PDF-1.7')]);return id;};const file1=await addFile();
 database=load(path.join(root,'app/lib/database.ts'));
 const lab=load(path.join(root,'app/api/lab/cases/[id]/route.ts')),clinical=load(path.join(root,'app/api/clinical/cases/[id]/route.ts')),portal=load(path.join(root,'app/api/portal/cases/[id]/route.ts'));
 const ctx={params:Promise.resolve({id:caseId})};
 async function call(route,body,{work,doc,bearer}={}){
  jar.clear();if(work)jar.set('allen_work_session',work);if(doc)jar.set('allen_doctor_session',doc);
  const request=new Request('http://localhost/api/cases/'+caseId,{method:body?'POST':'GET',headers:{origin:'http://localhost','content-type':'application/json',...(bearer?{authorization:'Bearer '+bearer}:{})},body:body?JSON.stringify(body):undefined});
  const r=await route[body?'POST':'GET'](request,ctx);return {status:r.status,body:await r.json()};
 }
 const state=async()=>(await q('SELECT * FROM "PortalCase" WHERE id=$1',[caseId]))[0];
 const plans=()=>q('SELECT * FROM "TreatmentPlan" WHERE "caseId"=$1 ORDER BY version',[caseId]);
 const asPlanner={work:actors.PLANNER.token,bearer:labToken};
 async function publish(extra={},expected=200){const r=await call(lab,{action:'plan',summary:'Synthetic treatment plan summary',changeSummary:'Revise staging for clinical review',revision:(await state()).revision,...extra},asPlanner);check(r.status===expected,'plan API '+expected+': '+JSON.stringify(r.body));return r;}
 check((await call(lab,{action:'plan',summary:'Unauthorized plan',revision:0})).status===401,'plan creation requires case authorization');
 check((await call(lab,{action:'plan',summary:'Unauthorized plan',revision:0},{bearer:labToken})).status===401,'case grant alone cannot create a plan without employee identity');
 await publish();let [v1]=await plans();check(v1.version===1&&v1.createdById===actors.PLANNER.id&&v1.parentPlanId===null,'V1 records exact creator and starts without a parent');
 const firstSnapshot=JSON.stringify(v1);await publish({changeSummary:undefined},400);await publish();let [,v2]=await plans();check(v2.version===2&&v2.parentPlanId===v1.id,'V2 links to V1');
 const file2=await addFile();await publish();let [,,v3]=await plans();check(v3.version===3&&v3.parentPlanId===v2.id,'V3 links to V2');
 check((await q('SELECT 1 FROM "TreatmentPlanFile" WHERE "planId"=$1 AND "caseFileId"=$2',[v3.id,file2])).length===1,'ordinary revision snapshots newly uploaded files despite parent lineage');
 check(JSON.stringify((await plans())[0])===firstSnapshot,'V1 remains byte-for-byte unchanged after V2 and V3');
 await blocked('UPDATE "TreatmentPlan" SET summary=\'Overwrite\' WHERE id=$1',[v1.id],'historical content overwrite denied');
 await blocked('DELETE FROM "TreatmentPlan" WHERE id=$1',[v1.id],'historical record deletion denied');
 await blocked('TRUNCATE "TreatmentPlan" CASCADE',[],'truncate cannot erase version history');
 await blocked('UPDATE "CaseFile" SET data=$2 WHERE id=$1',[file1,Buffer.from('tampered')],'version-bound file bytes remain immutable');
 // Direct inserts include legitimate preparer identity so failures test version invariants.
 const insert=async(client,version,parent,reason='Synthetic revision reason',decision='PENDING')=>{
  await client.query("SELECT set_config('allen.preparer_account',$1,true)",[actors.PLANNER.id]);
  return client.query(`INSERT INTO "TreatmentPlan"(id,"caseId",version,summary,"changeSummary",decision,"parentPlanId","createdByRole","createdById","authorName","preparedByAccountId","preparedByEmployeeId","preparedAt") VALUES($1,$2,$3,'Synthetic new plan',$4,$5,$6,'LAB',$7,'Synthetic planner',$7::uuid,$8,now())`,[randomUUID(),caseId,version,reason,decision,parent,actors.PLANNER.id,actors.PLANNER.employee]);
 };
 for(const [version,parent,reason,decision,label]of [[3,v2.id,'Valid duplicate reason','PENDING','duplicate version rejected'],[5,v3.id,'Valid gap reason','PENDING','version gaps rejected'],[4,null,'Valid revision reason','PENDING','missing revision parent rejected'],[4,v3.id,'','PENDING','missing revision reason rejected'],[4,v3.id,'Valid revision reason','APPROVED','approval cannot be inherited at creation']]){
  await db.query('BEGIN');try{await assert.rejects(()=>insert(db,version,parent,reason,decision));check(true,label);}finally{await db.query('ROLLBACK');}
 }
 const raceBody={action:'plan',summary:'Concurrent treatment revision',changeSummary:'Concurrent revision reason',revision:(await state()).revision};
 // Shared cookie jar contains the same actor for both requests throughout this race.
 const race=await Promise.all([call(lab,raceBody,asPlanner),call(lab,raceBody,asPlanner)]);check(race.map(r=>r.status).sort().join(',')==='200,409','concurrent API creation commits one next version and rejects stale request');
 let v4=(await plans()).at(-1);check(v4.version===4,'concurrent creation leaves no duplicate or skipped versions');
 let result=await call(lab,{action:'restore',sourcePlanId:v1.id,changeSummary:'Restore original staging for independent reassessment',revision:(await state()).revision},asPlanner);check(result.status===200,'authorized restoration creates a new version');
 let v5=(await plans()).at(-1);check(v5.version===5&&v5.parentPlanId===v1.id&&v5.decision==='PENDING','restoration records actual source and resets approval');
 const refs=await q('SELECT "caseFileId" FROM "TreatmentPlanFile" WHERE "planId"=$1',[v5.id]);check(refs.length===1&&refs[0].caseFileId===file1,'restoration copies source files only');
 check((await q('SELECT label FROM "CaseEvent" WHERE "caseId"=$1 ORDER BY "createdAt" DESC',[caseId])).some(e=>e.label.includes('v5 restored from v1')),'restore event names the actual source version');
 const getReview=async()=>(await q('SELECT * FROM "ClinicalReview" WHERE "planId"=$1',[v5.id]))[0];
 async function review(role,body,expected=200){const r=await call(clinical,{planId:v5.id,revision:(await getReview()).revision,...body},{work:actors[role].token});check(r.status===expected,'clinical '+body.action+' '+expected+': '+JSON.stringify(r.body));}
 check((await getReview()).status==='PENDING','new version automatically enters existing clinical review queue');
 await review('LEAD',{action:'assign',assignedTo:actors.PLANNER.id,priority:'NORMAL'},409);
 await review('LEAD',{action:'assign',assignedTo:actors.LEAD.id,priority:'NORMAL'});
 await review('PLANNER',{action:'start'},404);
 await review('LEAD',{action:'assign',assignedTo:actors.REVIEWER.id,priority:'NORMAL'});
 await review('REVIEWER',{action:'start'});
 const checklist=Object.fromEntries(['completeness','records','consistency','movement','attachments','ipr','staging','concerns','information'].map(k=>[k,{result:'CONFIRMED',note:'Synthetic reviewer finding'}]));
 await review('REVIEWER',{action:'save',checklist,notes:'Synthetic review complete'});
 await review('REVIEWER',{action:'approve',reason:'Independent review completed',confirmed:true});
 check((await getReview()).independenceVerified&&(await state()).status==='REVIEW','independent clinical approval releases exact current version');
 const decide=async(planId,doc=doctorToken)=>call(portal,{action:'approve',planId,revision:(await state()).revision,confirmed:'yes'},{doc});
 check((await decide(v5.id,otherToken)).status===404,'another doctor cannot decide this case');
 check((await decide(v1.id)).status===409,'doctor cannot approve an older version');
 result=await decide(v5.id);check(result.status===200,'doctor approves exact independently released version: '+JSON.stringify(result.body));
 const [decision]=await q(`SELECT * FROM "TreatmentPlanVersionAudit" WHERE "planId"=$1 AND detail->>'decision'='APPROVED'`,[v5.id]);
 check(decision.actorId===doctor&&decision.detail.version===5&&!!decision.detail.decidedAt&&/^[a-f0-9]{64}$/.test(decision.detail.artifactSha256),'doctor decision records exact version, identity, timestamp and artifact evidence');
 const artifacts=load(path.join(root,'app/lib/treatment-approval.ts'));await database.db.transaction(tx=>artifacts.manufacturingApproval(tx,caseId));check(true,'manufacturing verifies exact approved artifact');
 await db.query('BEGIN');try{await q(`UPDATE "PortalCase" SET status='IN_PRODUCTION' WHERE id=$1`,[caseId]);check(true,'database manufacturing transition accepts the exact fully approved version');}finally{await db.query('ROLLBACK');}
 const approvedSnapshot=JSON.stringify((await plans()).at(-1));
 await review('LEAD',{action:'request_new_version',reason:'New staging required before production'});
 await publish();const v6=(await plans()).at(-1);
 check(v6.version===6&&v6.decision==='PENDING'&&(await q('SELECT status FROM "ClinicalReview" WHERE "planId"=$1',[v6.id]))[0].status==='PENDING','revision after approval requires fresh clinical and doctor decisions');
 check(JSON.stringify((await plans()).find(p=>p.id===v5.id))===approvedSnapshot,'previous approved version remains unchanged and traceable');
 check((await decide(v6.id)).status===409,'unreleased revision is blocked from doctor approval');
 await assert.rejects(()=>database.db.transaction(tx=>artifacts.manufacturingApproval(tx,caseId)));check(true,'unapproved revision cannot inherit manufacturing eligibility');
 await blocked(`UPDATE "PortalCase" SET status='IN_PRODUCTION' WHERE id=$1`,[caseId],'database also blocks manufacturing for new unapproved version');
 await blocked('UPDATE "TreatmentPlanVersionAudit" SET detail=\'{}\' WHERE "planId"=$1',[v5.id],'version audit cannot be overwritten');
 await blocked('DELETE FROM "ClinicalReviewAudit" WHERE "reviewId"=$1',[(await getReview()).id],'clinical audit cannot be erased');
 check((await call(lab,undefined,asPlanner)).status===200,'existing laboratory GET route still works');
 check((await call(clinical,undefined,{work:actors.LEAD.token})).status===200,'existing clinical GET route still works');
 const created=await q(`SELECT "planId",detail FROM "TreatmentPlanVersionAudit" WHERE "caseId"=$1 AND action='VERSION_CREATED' ORDER BY id`,[caseId]);
 check(created.length===6&&created.every((e,i)=>e.detail.version===i+1),'audit has one correctly numbered creation event for each version');
 console.log('Completed '+checks+' current-schema plan-version checks.');
}finally{if(database)await database.closeDatabase();await db.end();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
