// Full database copy stays local. Fixtures are created only in the disposable clone, never live.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync,spawn}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),req=Module.createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),ts=req('typescript'),url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/allen_aligner')throw Error('Expected local allen_aligner database.');
const testName='allen_aligner_approval_test_'+randomBytes(6).toString('hex');
const backupDir=process.env.APPROVAL_BACKUP_DIR||path.join(root,'.private','database-backups');fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,`module15-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'allen_aligner'};
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
function pg(name,args){const r=spawnSync(path.join(bin,name+'.exe'),args,{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(name+': '+(r.stderr||r.error?.message));return r.stdout;}
const migrations=['20261028120000_doctor_treatment_approval.sql','20261028180000_independent_clinical_review.sql','20261028193000_reviewer_email_access.sql','20261029140000_reviewer_independent_identity.sql'];
let checks=0,token='',admin,sql,database;
function check(ok,label){assert.ok(ok,label);checks++;console.log('PASS '+label);}
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));cache.set(file,mod);
 mod.require=function(spec){
  if(spec==='server-only')return {};
  if(spec==='next/headers')return {cookies:async()=>({get:()=>token?{value:token}:undefined})};
  if(spec==='next/navigation')return {redirect:()=>{throw Error('Unexpected redirect')}};
  if(spec==='./hr-management')return {audit:async(tx,actor,scope,action,record)=>tx.query('INSERT INTO "ManagementAudit"("actorId",scope,action,"recordId") VALUES($1,$2,$3,$4)',[actor,scope,action,record])};
  if(spec.startsWith('@/')){const next=path.resolve(root,spec.slice(2));if(fs.existsSync(next+'.ts'))return load(next+'.ts');}
  if(spec.startsWith('.')){const next=path.resolve(path.dirname(file),spec);if(fs.existsSync(next+'.ts'))return load(next+'.ts');}
  return Module.prototype.require.call(this,spec);
 };
 mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,resolveJsonModule:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);return mod.exports;
}
async function run(){
 pg('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup]);
 check(pg('pg_restore',['--list',backup]).includes('TreatmentPlanVersionAudit'),'recoverable local backup includes version audit');
 admin=new Client({connectionString:url.toString()});await admin.connect();await admin.query(`CREATE DATABASE "${testName}"`);
 pg('pg_restore',['--no-owner','--no-privileges','--dbname',testName,backup]);
 const testUrl=new URL(url);testUrl.pathname='/'+testName;process.env.DATABASE_URL=testUrl.toString();
 sql=new Client({connectionString:testUrl.toString()});await sql.connect();for(const migration of migrations)await sql.query(fs.readFileSync(path.join(root,'database/migrations',migration),'utf8'));check(true,'approval and independent-review migrations apply on isolated copy');
 const q=async(s,v=[])=>(await sql.query(s,v)).rows;
 const before=await q(`SELECT (SELECT count(*)::int FROM "Patient") patients,(SELECT count(*)::int FROM "Doctor") doctors`);
 // Qualified-recipient fixtures exist only in this disposable database. Live access is unchanged.
 const staff=randomUUID(),unassigned=randomUUID();
 const staffAccounts={};
 for(const employee of [staff,unassigned]){const [record]=await q(`INSERT INTO "Employee"(id,"employeeCode","fullName",department,designation,"joinedOn") VALUES($1,'','Isolated clinical QA','QA','Clinical test reviewer','2026-01-01') RETURNING id`,[employee]);const [account]=await q(`UPDATE "WorkAccount" SET "passwordHash"=$2,"isActive"=true,"mustChangePassword"=false,"clinicalRole"=CASE WHEN "employeeId"=$3 THEN 'LEAD' ELSE 'REVIEWER' END WHERE "employeeId"=$1 RETURNING id`,[record.id,'$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu123456',staff]);staffAccounts[employee]=account.id;}
 const clinic=randomUUID(),otherClinic=randomUUID(),doctor=randomUUID(),wrong=randomUUID(),foreign=randomUUID();
 await q('INSERT INTO "Clinic"(id,name) VALUES($1,\'Isolated approval QA\'),($2,\'Isolated other clinic\')',[clinic,otherClinic]);
 for(const [id,c]of [[doctor,clinic],[wrong,clinic],[foreign,otherClinic]])await q(`INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt","registrationNumber") VALUES($1,'Isolated approval QA',$2,$3,$4,true,now(),$1)`,[id,id+'@example.invalid','$2b$04$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuu123456',c]);
 const tokens=new Map();for(const id of [doctor,wrong,foreign]){const value=randomBytes(32).toString('hex');tokens.set(id,value);await q('INSERT INTO "DoctorSession"("tokenHash","doctorId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[createHash('sha256').update(value).digest('hex'),id]);}
 database=load(path.join(root,'app/lib/database.ts'));
 const route=load(path.join(root,'app/api/portal/cases/[id]/route.ts'));
 const artifacts=load(path.join(root,'app/lib/treatment-approval.ts'));
 async function fixture({approved=true,files=true}={}){
  const caseId=randomUUID(),planId=randomUUID();await q(`INSERT INTO "PortalCase"(id,"doctorId","clinicId","patientReference",category,notes,"consentAt",status,"updatedAt") VALUES($1,$2,$3,$1,'QA','Isolated fixture',now(),'PLANNING',now())`,[caseId,doctor,clinic]);
  if(files)await q(`INSERT INTO "CaseFile"(id,"caseId",name,mime,size,data) VALUES($1,$2,'plan.pdf','application/pdf',8,$3)`,[randomUUID(),caseId,Buffer.from('%PDF-1.7')]);
  const preparer=staffAccounts[staff];await q(`WITH identity AS (SELECT set_config('allen.preparer_account',$3,true)) INSERT INTO "TreatmentPlan"(id,"caseId",version,summary,"changeSummary","createdById","createdByRole","preparedByAccountId","preparedByEmployeeId","preparedAt","authorName") SELECT $1,$2,1,'Isolated written treatment plan','QA version',$3::text,'LAB',$3::uuid,$4::text,now(),'Isolated QA preparer' FROM identity`,[planId,caseId,preparer,staff]);
  if(approved){const checklist=Object.fromEntries(['completeness','records','consistency','movement','attachments','ipr','staging','concerns','information'].map(key=>[key,{result:'CONFIRMED',note:''}]));await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$2,true),set_config('allen.clinical_action','assign',true),set_config('allen.clinical_name','Isolated clinical lead',true)) UPDATE "ClinicalReview" SET "assignedTo"=$2::uuid WHERE "planId"=$1`,[planId,staffAccounts[staff]]);await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$2,true),set_config('allen.clinical_action','start',true),set_config('allen.clinical_name','Isolated clinical reviewer',true)) UPDATE "ClinicalReview" SET status='IN_REVIEW',"startedAt"=now() WHERE "planId"=$1`,[planId,staffAccounts[unassigned]]);await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$3,true),set_config('allen.clinical_action','approve',true),set_config('allen.clinical_confirmed','true',true)) UPDATE "ClinicalReview" SET status='APPROVED',"completedAt"=now(),"decidedBy"=$3::uuid,checklist=$2::jsonb WHERE "planId"=$1`,[planId,JSON.stringify(checklist),staffAccounts[unassigned]]);await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$2,true),set_config('allen.clinical_action','assign',true)) UPDATE "ClinicalReview" SET "assignedTo"=$2::uuid,status='PENDING',"completedAt"=NULL,"decidedBy"=NULL,checklist='{}'::jsonb WHERE "planId"=$1`,[planId,staffAccounts[staff]]);await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$2,true),set_config('allen.clinical_action','start',true)) UPDATE "ClinicalReview" SET status='IN_REVIEW',"startedAt"=now() WHERE "planId"=$1`,[planId,staffAccounts[staff]]);await q(`WITH actor AS (SELECT set_config('allen.clinical_actor',$2,true),set_config('allen.clinical_action','approve',true),set_config('allen.clinical_confirmed','true',true)) UPDATE "ClinicalReview" SET status='APPROVED',"completedAt"=now(),"decidedBy"=$2::uuid,checklist=$3::jsonb WHERE "planId"=$1`,[planId,staffAccounts[staff],JSON.stringify(checklist)]);await q(`UPDATE "PortalCase" SET status='REVIEW' WHERE id=$1`,[caseId]);}
  return {caseId,planId};
 }
 async function post(f,action='approve',who=doctor,extra={}){
  token=who?tokens.get(who):'';
  const r=await route.POST(new Request('http://localhost/api/portal/cases/'+f.caseId,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({action,planId:f.planId,revision:0,confirmed:'yes',...extra})}),{params:Promise.resolve({id:f.caseId})});return {status:r.status,body:await r.json()};
 }
 let f=await fixture();
 check((await post(f,'approve',null)).status===401,'unauthenticated request denied');
 check((await post(f,'approve',wrong)).status===404,'wrong assigned doctor denied');
 check((await post(f,'approve',foreign)).status===404,'another clinic denied');
 check((await post(f,'approve',doctor,{confirmed:undefined})).status===400,'server enforces explicit review confirmation');
 check((await post(f,'approve',doctor,{doctorId:wrong})).status===400,'client identity injection rejected');
 const result=await post(f);check(result.status===200,'assigned doctor approves exact internally approved version: '+JSON.stringify(result.body));
 token=tokens.get(doctor);
 const originResult=await route.POST(new Request('http://localhost/api/portal/cases/'+f.caseId,{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:JSON.stringify({action:'comment',text:'Origin test'})}),{params:Promise.resolve({id:f.caseId})});
 check(originResult.status===403,'cross-origin authenticated mutation blocked');
 const [decision]=await q(`SELECT * FROM "TreatmentPlanVersionAudit" WHERE "planId"=$1 AND detail ? 'decision'`,[f.planId]);
 check(decision.detail.decision==='APPROVED'&&decision.actorId===doctor&&decision.detail.clinicId===clinic&&decision.detail.artifact.files.length===1&&/^[a-f0-9]{64}$/.test(decision.detail.artifactSha256),'immutable decision contains version, actor, clinic and verified artifact identity');
 check((await post(f)).status===409,'repeat submission conflicts without duplicate');
 check((await q(`SELECT * FROM "TreatmentPlanVersionAudit" WHERE "planId"=$1 AND detail ? 'decision'`,[f.planId])).length===1,'one decision record per version');
 const [recipients]=await q(`SELECT count(*)::int n FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId" WHERE w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' AND w."clinicalRole" IN ('LEAD','ADMIN')`);
 const [notified]=await q(`SELECT count(*)::int n FROM "WorkNotification" WHERE kind=$1`,['PLAN_DECISION:'+f.planId]);
 check(notified.n===recipients.n,'existing authorized clinical inbox recipients notified exactly once ('+recipients.n+' recipients)');
 check(!(await q(`SELECT n.id FROM "WorkNotification" n JOIN "WorkAccount" w ON w.id::text=n."recipientId" WHERE w."employeeId"=$1 AND n.kind=$2`,[unassigned,'PLAN_DECISION:'+f.planId])).length,'unassigned reviewer receives no decision notification');
 await database.db.transaction(tx=>artifacts.manufacturingApproval(tx,f.caseId));
 await q(`UPDATE "PortalCase" SET status='IN_PRODUCTION' WHERE id=$1`,[f.caseId]);check(true,'manufacturing accepts exact approved artifact');
 const [counts]=await q(`SELECT count(*)::int n FROM "CaseEvent" WHERE "caseId"=$1`,[f.caseId]);check(counts.n===2,'approval and manufacturing eligibility appear in timeline');
 async function denied(statement,values,label){let failed=false;try{await q(statement,values)}catch{failed=true}check(failed,label);}
 await denied(`UPDATE "TreatmentPlanVersionAudit" SET detail='{}' WHERE id=$1`,[decision.id],'decision history cannot be overwritten');
 await denied(`UPDATE "CaseFile" SET data=$2 WHERE "caseId"=$1`,[f.caseId,Buffer.from('tampered')],'bound artifact bytes cannot change');
 await denied(`INSERT INTO "TreatmentPlanFile"("planId","caseFileId") SELECT $1,id FROM "CaseFile" WHERE "caseId"=$2`,[f.planId,f.caseId],'approved file bindings cannot be extended');
 await q(`UPDATE "PortalCase" SET status='CHANGES_REQUESTED' WHERE id=$1`,[f.caseId]);
 const fresh=randomUUID();await q(`INSERT INTO "TreatmentPlan"(id,"caseId",version,summary) VALUES($1,$2,2,'Fresh revision requires fresh approvals')`,[fresh,f.caseId]);
 await denied(`UPDATE "PortalCase" SET status='IN_PRODUCTION' WHERE id=$1`,[f.caseId],'new version cannot inherit prior manufacturing eligibility');
 await q(`UPDATE "ClinicalReview" SET status='APPROVED',"completedAt"=now() WHERE "planId"=$1`,[fresh]);await q(`UPDATE "PortalCase" SET status='REVIEW' WHERE id=$1`,[f.caseId]);
 check((await post({caseId:f.caseId,planId:fresh},'approve',doctor,{revision:1})).status===200,'new internally approved version receives its own fresh doctor decision');
 check((await q(`SELECT id FROM "TreatmentPlanVersionAudit" WHERE "caseId"=$1 AND detail->>'decision'='APPROVED'`,[f.caseId])).length===2,'both exact-version approvals remain in immutable history');
 let incomplete=await fixture({approved:false});check((await post(incomplete)).status===409,'missing same-version internal approval blocked');
 let empty=await fixture({files:false});check((await post(empty)).status===409,'missing required files blocked');
 let concurrent=await fixture();const results=await Promise.all([post(concurrent),post(concurrent,'reject',doctor,{text:'Conflicting rejection'})]);check(results.filter(r=>r.status===200).length===1&&results.filter(r=>r.status===409).length===1,'concurrent conflicting decisions serialize to one winner');
 for(const action of ['adjustment','reject']){
  const next=await fixture();check((await post(next,action,doctor,{text:'Required clinical modifications'})).status===200,action+' decision accepted');
  const [p]=await q(`SELECT c.status,a.detail FROM "PortalCase" c JOIN "TreatmentPlanVersionAudit" a ON a."caseId"=c.id WHERE c.id=$1 AND a.detail ? 'decision'`,[next.caseId]);
  check(p.status==='CHANGES_REQUESTED'&&p.detail.decision===(action==='reject'?'REJECTED':'CHANGES_REQUESTED'),action+' returns to planning with explicit immutable decision');
  await denied(`UPDATE "PortalCase" SET status='IN_PRODUCTION' WHERE id=$1`,[next.caseId],action+' blocks manufacturing');
 }
 const revised=await fixture();await q(`UPDATE "PortalCase" SET status='PLANNING' WHERE id=$1`,[revised.caseId]);const v2=randomUUID();await q(`INSERT INTO "TreatmentPlan"(id,"caseId",version,summary) VALUES($1,$2,2,'New exact version')`,[v2,revised.caseId]);await q(`UPDATE "ClinicalReview" SET status='APPROVED' WHERE "planId"=$1`,[v2]);await q(`UPDATE "PortalCase" SET status='REVIEW' WHERE id=$1`,[revised.caseId]);check((await post(revised)).status===409,'outdated version decision blocked');
 const opened=await fixture();await post(opened,'opened');await post(opened,'opened');check((await q(`SELECT id FROM "TreatmentPlanVersionAudit" WHERE "planId"=$1 AND action='DOCTOR_OPENED'`,[opened.planId])).length===1,'opened event is idempotent');
 if(process.argv.includes('--ui')){
  const origin='http://127.0.0.1:3127';let output='',browser;
  const server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3127'],{cwd:root,env:{...process.env,ALLEN_TEST_BUILD:'true',APP_ORIGIN:origin},windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',d=>{output=(output+d).slice(-10000)});server.stderr.on('data',d=>{output=(output+d).slice(-10000)});
  try{
   const deadline=Date.now()+180000;while(!output.includes('Ready in')){if(server.exitCode!==null||Date.now()>deadline)throw Error('UI server failed: '+output);await new Promise(r=>setTimeout(r,500));}
   const {chromium}=require(process.env.APPROVAL_PLAYWRIGHT_PATH||'playwright');browser=await chromium.launch({channel:'msedge',headless:true});
   const context=await browser.newContext();await context.addCookies([{name:'allen_doctor_session',value:tokens.get(doctor),url:origin}]);const page=await context.newPage();
   for(const [width,height] of [[1440,1000],[768,1024],[390,844]]){
    await page.setViewportSize({width,height});await page.goto(origin+'/doctor-dashboard/cases/'+opened.caseId,{waitUntil:'networkidle',timeout:180000});
    await page.getByRole('button',{name:'Reject Treatment Plan',exact:true}).waitFor({timeout:30000});
    check(await page.getByRole('button',{name:/Approve Treatment Plan/}).count()===1,'approval control rendered at '+width+'px');
    check(await page.getByRole('link',{name:'View Case Timeline',exact:true}).count()===1,'timeline navigation rendered at '+width+'px');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);check(!overflow,'no horizontal viewport overflow at '+width+'px');
    if(process.env.APPROVAL_SCREENSHOT_DIR){fs.mkdirSync(process.env.APPROVAL_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.APPROVAL_SCREENSHOT_DIR,'doctor-approval-'+width+'.png'),fullPage:true});}
   }
   const form=page.locator('form').filter({has:page.getByRole('button',{name:'Reject Treatment Plan',exact:true})});await form.locator('textarea').fill('Reject this isolated test version for clinical revision.');await form.getByRole('button',{name:'Reject Treatment Plan',exact:true}).click();await form.getByRole('status').filter({hasText:'Case updated.'}).waitFor({timeout:30000});
   check((await q(`SELECT id FROM "TreatmentPlanVersionAudit" WHERE "planId"=$1 AND detail->>'decision'='REJECTED'`,[opened.planId])).length===1,'mobile browser rejection reaches immutable database decision');
  }finally{if(browser)await browser.close();if(server.exitCode===null)spawnSync('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
 }
 const [after]=await q(`SELECT (SELECT count(*)::int FROM "Patient") patients,(SELECT count(*)::int FROM "Doctor") doctors`);check(after.patients===before[0].patients&&after.doctors===before[0].doctors+3,'existing patient and doctor records preserved; no patient fixtures created');
 console.log(JSON.stringify({checks,backup,migrationTested:true,liveApplied:false}));
 if(process.argv.includes('--apply')){
  const live=new Client({connectionString:url.toString()});await live.connect();try{await live.query(migration);console.log('LIVE MIGRATION APPLIED after isolated checks passed.');}finally{await live.end();}
 }
}
run().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(async()=>{if(database)await database.closeDatabase();if(sql)await sql.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`).catch(()=>{});await admin.end();}});
