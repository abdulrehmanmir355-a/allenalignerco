// Pre-approval regression: never applies migrations. Uses only isolated synthetic data.
const root=require('node:path').resolve(__dirname,'..');
require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require(root+'/node_modules/pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const url=new URL(process.env.CASE_TIMELINE_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/allen_aligner_clinical_test_20261022')throw Error('Explicit isolated local clinical test database required.');
const db=new Client({connectionString:url.toString()}),base='http://127.0.0.1:3147',clinic=randomUUID(),doctor=randomUUID(),id=randomUUID(),token=randomBytes(32).toString('hex'),labToken=randomBytes(32).toString('hex');
const digest=s=>createHash('sha256').update(s).digest('hex');let server,logs='',checks=0;
async function stop(){if(server){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;server=null;}}
async function start(enabled){logs='';server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3147'],{cwd:root,env:{...process.env,DATABASE_URL:url.toString(),APP_ORIGIN:base,ALLEN_TEST_BUILD:'true',ENABLE_EXTENDED_CASE_WORKFLOW:String(enabled),NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',x=>logs=(logs+x).slice(-8000));server.stderr.on('data',x=>logs=(logs+x).slice(-8000));const until=Date.now()+120000;while(!logs.includes('Ready in')){if(server.exitCode!==null||Date.now()>until)throw Error(logs);await new Promise(r=>setTimeout(r,300));}}
async function call(path,status,body,cookie='',headers={}){const r=await fetch(base+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert.equal(r.status,status,path+' '+text.slice(0,200));checks++;return {text,data:text.startsWith('{')?JSON.parse(text):null};}
(async()=>{await db.connect();try{
 try{await fetch(base,{signal:AbortSignal.timeout(1500)});throw Error('Preflight test port already in use');}catch(e){if(e.message==='Preflight test port already in use')throw e;}
 const schema=await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='PortalCase' AND column_name IN ('qcState','qcPlanId','careStage')`);assert.equal(schema.rowCount,0,'Preflight requires the original, unmigrated test schema');checks++;
 await db.query('INSERT INTO "Clinic"(id,name) VALUES($1,$2)',[clinic,'Synthetic workflow preflight']);
 await db.query('INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt","registrationNumber") VALUES($1,$2,$3,$4,$5,true,NOW(),$6)',[doctor,'Preflight doctor',randomUUID()+'@example.invalid','unused-test-fixture',clinic,randomUUID()]);
 await db.query('INSERT INTO "DoctorSession"("tokenHash","doctorId","expiresAt") VALUES($1,$2,NOW()+interval \'1 hour\')',[digest(token),doctor]);
 await db.query('INSERT INTO "PortalCase"(id,"doctorId","clinicId","patientReference",category,notes,"consentAt","updatedAt") VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())',[id,doctor,clinic,'WORKFLOW PREFLIGHT','Initial case','Synthetic preflight']);
 await db.query('INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[id,digest(labToken),'Preflight assigned lab']);
 const cookie='allen_doctor_session='+token,portal='/api/portal/cases/'+id,lab='/api/lab/cases/'+id+'/workflow',body={action:'enable',revision:0,notes:'Explicit test enrollment',confirmed:true};
 for(const enabled of [false,true]){
  await start(enabled);
  await call(portal+'/workflow',401);
  await call(portal+'/workflow',503,undefined,cookie);
  await call(portal+'/workflow',503,body,cookie);
  await call(portal+'/workflow',403,body,cookie,{Origin:'https://attacker.invalid'});
  await call(lab,401);await call(lab,403,undefined,'',{Authorization:'Bearer '+randomBytes(32).toString('hex')});
  await call(lab,503,undefined,'',{Authorization:'Bearer '+labToken});
  await call(lab,503,{action:'qc_pass',revision:0,notes:'Synthetic inspection',confirmed:true},'',{Authorization:'Bearer '+labToken});
  const page=await call('/doctor-dashboard/cases/'+id,200,undefined,cookie);assert(page.text.includes('Case timeline'));checks++;
  await call('/lab/cases/'+id+'/qc',404);
  const timeline=(await call(portal+'/timeline',200,undefined,cookie)).data;assert.equal(timeline.case.workflow,null);assert.equal(timeline.case.revision,0);checks++;
  const draft={patientReference:'GATE CREATE TEST',category:'Initial case',notes:'Synthetic draft',consent:'yes'};
  await call('/api/portal/cases',enabled?503:201,draft,cookie);
  assert.equal((await db.query('SELECT revision FROM "PortalCase" WHERE id=$1',[id])).rows[0].revision,0);checks++;
  await stop();
  console.log('PASS unmigrated workflow gate with feature flag '+enabled);
 }
 const unchanged=await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='PortalCase' AND column_name IN ('qcState','qcPlanId','careStage')`);assert.equal(unchanged.rowCount,0);checks++;
 console.log('Completed '+checks+' pre-approval checks; no migration applied.');
}finally{await stop();await db.query('DELETE FROM "PortalCase" WHERE "doctorId"=$1',[doctor]);await db.query('DELETE FROM "ManagementAudit" WHERE "actorId"=$1',[doctor]);await db.query('DELETE FROM "Doctor" WHERE id=$1',[doctor]);await db.query('DELETE FROM "Clinic" WHERE id=$1',[clinic]);await db.end();}})().catch(e=>{console.error(e.stack);if(logs)console.error(logs);process.exitCode=1;});
