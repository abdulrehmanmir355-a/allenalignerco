// Synthetic fixtures only, isolated by random clinic IDs and removed in finally.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const base = process.env.PORTAL_TEST_ORIGIN || 'http://127.0.0.1:3107';
const dburl = new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert(['localhost','127.0.0.1'].includes(dburl.hostname) && dburl.port === '5432' && dburl.pathname === '/allen_aligner_codex_test');
const db = new Client({options: "-c timezone=UTC",  connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const clinics = [randomUUID(), randomUUID()];
const doctors = Array.from({length:5}, () => randomUUID());
const tokens = doctors.map(() => randomBytes(32).toString('hex'));
let checks = 0;
function eq(actual, expected, label) { assert.equal(actual, expected, label); checks++; console.log('PASS', label); }
async function call(body, who, origin = base, suffix = '') {
  return fetch(base + '/api/clinic/patients' + suffix, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type':'application/json', ...(who === undefined ? {} : { Cookie:'allen_doctor_session=' + tokens[who] }) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function main() {
  await db.connect();
  try {
    for (const id of clinics) await db.query('INSERT INTO "Clinic" (id,name) VALUES ($1,$2)', [id,'SYNTHETIC PATIENT TEST']);
    for (let i=0;i<doctors.length;i++) {
      await db.query('INSERT INTO "Doctor" (id,"clinicId","fullName",email,"passwordHash","isVerified","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())', [doctors[i],i===4?null:clinics[i===1?1:0],'SYNTHETIC TEST',doctors[i]+'@example.invalid','unusable-test-hash',i!==3]);
      await db.query('INSERT INTO "DoctorSession" ("tokenHash","doctorId","expiresAt") VALUES ($1,$2,NOW()+interval \'1 hour\')', [createHash('sha256').update(tokens[i]).digest('hex'),doctors[i]]);
    }
    const data = {fullName:'SYNTHETIC PATIENT',dateOfBirth:'2000-02-29',phone:'+92 300 1234567',email:'Test@Example.invalid'};
    eq((await call()).status,401,'anonymous list denied');
    eq((await call(data)).status,401,'anonymous create denied');
    for(const i of [3,4]) { eq((await call(undefined,i)).status,401,'unverified/clinicless list denied'); eq((await call(data,i)).status,401,'unverified/clinicless create denied'); }
    eq((await call(data,0,'https://attacker.invalid')).status,403,'cross-origin write denied');
    eq((await call({...data,clinicId:clinics[1]},0)).status,400,'ownership injection rejected');
    eq((await call({...data,dateOfBirth:'2025-02-29'},0)).status,400,'invalid birth date rejected');
    let r=await call(data,0); eq(r.status,201,'patient saved'); const patient=(await r.json()).patient;
    assert.match(patient.patientCode,/^AA-P-[A-F0-9]{32}$/); eq(patient.patientCode,'AA-P-'+patient.id.replaceAll('-','').toUpperCase(),'display ID tied to globally unique patient key');
    const stored=(await db.query('SELECT * FROM "Patient" WHERE id=$1',[patient.id])).rows[0];
    eq(stored.clinicId,clinics[0],'database ownership from session'); eq(stored.normalizedEmail,'test@example.invalid','database normalization');
    eq((await call({...data,patientCode:'FORGED'},0)).status,400,'manual ID injection rejected');
    const otherResponse=await call(data,1);eq(otherResponse.status,201,'other clinic registration'); const otherPatient=(await otherResponse.json()).patient; assert.notEqual(otherPatient.patientCode,patient.patientCode); checks++; console.log('PASS IDs differ across clinics');
    const concurrent=await Promise.all([call({...data,fullName:'Parallel One',confirmDuplicate:true},0),call({...data,fullName:'Parallel Two',confirmDuplicate:true},0)]);
    assert.deepEqual(concurrent.map(r=>r.status),[201,201]); const concurrentPatients=await Promise.all(concurrent.map(async r=>(await r.json()).patient)); eq(new Set([patient.patientCode,otherPatient.patientCode,...concurrentPatients.map(p=>p.patientCode)]).size,4,'concurrent and cross-clinic IDs unique');
    r=await call(undefined,2); eq(r.status,200,'same clinic doctor can list'); assert(r.headers.get('cache-control').includes('no-store'));
    let list=await r.json(); eq(list.total,3,'same-clinic persisted records'); assert(list.patients.some(p=>p.id===patient.id));
    list=await (await call(undefined,1)).json(); eq(list.total,1,'other-clinic isolated list'); assert(!list.patients.some(p=>p.id===patient.id));
    eq((await call(undefined,0,base,'?page=0')).status,400,'invalid page rejected');
    eq((await (await call(undefined,0,base,'?page=2')).json()).patients.length,0,'pagination');
    for (const q of [patient.patientCode,'synthetic patient','3001234567','TEST@EXAMPLE.INVALID']) {
      const result=await (await call(undefined,0,base,'?q='+encodeURIComponent(q))).json();
      assert(result.patients.some(p=>p.id===patient.id)); checks++; console.log('PASS scoped search '+q);
    }
    eq((await call(undefined,0,base,'?q='+('x'.repeat(101)))).status,400,'bounded search');
    r=await call(data,0); eq(r.status,409,'possible duplicate warning');
    const warning=await r.json(); eq(warning.code,'POSSIBLE_DUPLICATE','duplicate warning distinguished from code conflict'); assert(warning.candidates.every(p=>p.id!==list.patients[0].id));
    async function detail(who, body, method=body?'PATCH':'GET') {
      return fetch(base+'/api/clinic/patients/'+patient.id,{method,headers:{Origin:base,'Content-Type':'application/json',...(who===undefined?{}:{Cookie:'allen_doctor_session='+tokens[who]})},body:body?JSON.stringify(body):undefined});
    }
    eq((await detail()).status,401,'anonymous history denied');
    eq((await detail(1)).status,404,'other clinic history denied');
    let details=await (await detail(0)).json(); eq(details.history.length,1,'create audit persisted'); eq(details.history[0].action,'CREATED','create event');
    const edit={...data,patientCode:patient.patientCode,fullName:'SYNTHETIC UPDATED',revision:0,confirmDuplicate:true};
    eq((await detail(0,{...edit,patientCode:'CHANGED'})).status,400,'Patient ID immutable');
    eq((await detail(1,edit)).status,404,'other clinic edit denied');
    eq((await detail(0,{...edit,clinicId:clinics[1]})).status,400,'edit ownership injection denied');
    const edits=await Promise.all([detail(0,edit),detail(0,{...edit,fullName:'SYNTHETIC CONCURRENT'})]);
    assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);checks++;console.log('PASS concurrent edit conflict');
    details=await (await detail(0)).json(); eq(details.patient.revision,1,'revision incremented once');eq(details.history.length,2,'only successful edit audited');eq(details.history[0].before.fullName,'SYNTHETIC PATIENT','previous value retained');
    eq((await detail(0,edit)).status,409,'stale edit rejected');
    async function createCase(who,pid) {return fetch(base+'/api/portal/cases',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:'allen_doctor_session='+tokens[who]},body:JSON.stringify({patientId:pid,patientReference:'forged reference',category:'Initial case',notes:'',consent:'yes'})});}
    eq((await createCase(1,patient.id)).status,404,'cross-clinic patient case linkage denied');
    r=await createCase(0,patient.id);eq(r.status,201,'linked case saved');const caseId=(await r.json()).redirect.split('/').pop();
    const linked=(await db.query('SELECT "patientId","patientReference" FROM "PortalCase" WHERE id=$1',[caseId])).rows[0];eq(linked.patientId,patient.id,'database patient link');eq(linked.patientReference,patient.patientCode,'reference resolved server-side');
    for(const route of ['/doctor-dashboard/profile','/doctor-dashboard/clinic','/doctor-dashboard/patients','/clinic/patients','/clinic/dashboard','/clinic/team','/clinic/permissions','/clinic/assignments','/clinic/collaboration','/lab','/doctor-dashboard/cases/new?patientId='+patient.id]) { const page=await fetch(base+route,{headers:{Cookie:'allen_doctor_session='+tokens[0]}});eq(page.status,200,'render '+route); }
    if(process.env.PATIENT_BROWSER_QA==='true') {
      const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
      const browser=await chromium.launch({headless:true,channel:'msedge'});
      try {
        const context=await browser.newContext();
        await context.addCookies([{name:'allen_doctor_session',value:tokens[0],url:base,httpOnly:true,sameSite:'Lax'}]);
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base+'/doctor-dashboard/patients');await page.getByRole('button',{name:'+ Add Patient',exact:true}).click();
        eq(await page.locator('input[name=patientCode]').count(),0,'new patient requires no manual ID');await page.getByLabel('Full name',{exact:true}).fill('Synthetic Browser Patient');
        await page.getByRole('button',{name:'Save Patient',exact:true}).click();await page.getByRole('status').filter({hasText:'saved successfully'}).waitFor();checks++;console.log('PASS browser patient saved');
        await page.getByLabel('Search by name, Patient ID, phone or email').fill('Synthetic Browser');await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).waitFor();
        await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Full name',{exact:true}).fill('Synthetic Browser Updated');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('cell',{name:'Synthetic Browser Updated',exact:true}).waitFor();checks++;console.log('PASS browser edit persisted');
        await page.getByRole('button',{name:'History',exact:true}).click();await page.getByRole('region',{name:'Patient history'}).getByText('UPDATED · Revision 1',{exact:true}).waitFor();checks++;console.log('PASS browser history visible');
        await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:process.env.PATIENT_SCREENSHOT||'patient-qa.png',fullPage:true});eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'patient mobile viewport fits');
        await page.getByRole('link',{name:'New case',exact:true}).click();await page.getByRole('button',{name:'Create private draft'}).waitFor();checks++;console.log('PASS browser patient case link');
        const labToken=randomBytes(32).toString('hex');await db.query('UPDATE "PortalCase" SET status=\'SUBMITTED\' WHERE id=$1',[caseId]);await db.query('INSERT INTO "LabAccess" ("caseId","tokenHash",label,"expiresAt") VALUES ($1,$2,$3,NOW()+interval \'1 hour\')',[caseId,createHash('sha256').update(labToken).digest('hex'),'Synthetic Browser Lab']);
        await page.goto(base+'/lab');await page.getByLabel('Assigned case ID').fill(caseId);await page.getByLabel('Case access token').fill(labToken);await page.getByRole('button',{name:'Open assigned case'}).click();await page.getByRole('heading',{name:patient.patientCode,exact:true}).waitFor();checks++;console.log('PASS browser lab authorization');
        await page.getByLabel('New written plan summary').fill('Synthetic browser treatment plan for testing only');await page.getByRole('button',{name:'Publish for doctor review'}).click();await page.getByRole('heading',{name:'Version 1 · PENDING'}).waitFor();eq(await page.getByRole('button',{name:'Move to IN PRODUCTION'}).count(),0,'lab browser cannot bypass doctor review');
        await page.getByLabel('Message to doctor').fill('Synthetic browser message');await page.getByRole('button',{name:'Send case message'}).click();await page.getByText('Synthetic browser message',{exact:true}).waitFor();checks++;console.log('PASS browser lab message persisted');
        await db.query('DELETE FROM "LabAccess" WHERE "caseId"=$1',[caseId]);await page.getByRole('button',{name:'Refresh case'}).click();await page.getByLabel('Case access token').waitFor();eq(await page.getByRole('heading',{name:patient.patientCode,exact:true}).count(),0,'revoked lab token clears browser record');
        eq(errors.length,0,'no browser runtime errors');await context.close();
      } finally {await browser.close();}
    }
    async function profile(body, who=0, origin=base) {
      return fetch(base+'/api/portal/profile',{method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',...(who===null?{}:{Cookie:'allen_doctor_session='+tokens[who]})},body:JSON.stringify(body)});
    }
    const priorProfile=(await db.query(`SELECT "updatedAt" AT TIME ZONE 'UTC' AS "updatedAt" FROM "Doctor" WHERE id=$1`,[doctors[0]])).rows[0];
    const profileData={fullName:'Synthetic Profile Updated',phone:'+92 300 1112233',updatedAt:priorProfile.updatedAt.toISOString()};
    eq((await profile(profileData,null)).status,401,'profile requires authentication');
    eq((await profile(profileData,0,'https://attacker.invalid')).status,403,'profile origin protected');
    eq((await profile({...profileData,isVerified:true})).status,400,'profile cannot self-verify');
    eq((await profile({...profileData,clinicId:clinics[1]})).status,400,'profile cannot transfer clinic');
    eq((await profile(profileData)).status,200,'own profile saved');
    eq((await profile(profileData)).status,409,'stale profile edit rejected');
    const savedProfile=(await db.query('SELECT "fullName","clinicId" FROM "Doctor" WHERE id=$1',[doctors[0]])).rows[0];
    eq(savedProfile.fullName,profileData.fullName,'profile persisted');eq(savedProfile.clinicId,clinics[0],'profile retains clinic');
    await db.query('UPDATE "DoctorSession" SET "expiresAt"=NOW()-interval \'1 minute\' WHERE "doctorId"=$1',[doctors[0]]);
    eq((await call(undefined,0)).status,401,'expired session denied');
    await db.query('DELETE FROM "DoctorSession" WHERE "doctorId"=$1',[doctors[2]]);
    eq((await call(data,2)).status,401,'revoked session denied');
    console.log(`Completed ${checks} patient integration checks.`);
  } finally {
    await db.query('DELETE FROM "PortalCase" WHERE "doctorId"=ANY($1::text[])',[doctors]);
    await db.query('DELETE FROM "PatientHistory" WHERE "clinicId"=ANY($1::text[])',[clinics]);
    await db.query('DELETE FROM "Patient" WHERE "clinicId"=ANY($1::text[])',[clinics]);
    await db.query('DELETE FROM "Doctor" WHERE id=ANY($1::text[])',[doctors]);
    await db.query('DELETE FROM "Clinic" WHERE id=ANY($1::text[])',[clinics]);
    await db.end(); console.log('Synthetic patient fixtures removed.');
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
