// Uses synthetic records exclusively in the existing local clinical test database.
const root = require('node:path').resolve(__dirname, '..');
require(root + '/node_modules/dotenv').config({ path: root + '/.env', quiet: true });
const { Client } = require(root + '/node_modules/pg');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const url = new URL(process.env.CASE_TIMELINE_TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/allen_aligner_clinical_test_20261022') throw Error('Explicit isolated local clinical test database required.');
const base = 'http://127.0.0.1:3127';
const db = new Client({ connectionString: url.toString(), options: '-c timezone=UTC' });
const ids = { clinics: [randomUUID(), randomUUID()], doctors: [randomUUID(), randomUUID(), randomUUID()], users: [randomUUID(), randomUUID(), randomUUID(), randomUUID()] };
const digest = s => createHash('sha256').update(s).digest('hex');
let checks = 0, server, logs = '', caseId;
const ok = (v, label) => { assert(v, label); checks++; console.log('PASS ' + label); };
async function call(route, cookie = '', body, expected = 200, headers = {}) {
  const r = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  assert.equal(r.status, expected, route + ' ' + text.slice(0, 350)); checks++;
  return { r, data: text.startsWith('{') ? JSON.parse(text) : text };
}
async function main() {
  await db.connect();
  try {
    // Refuse to re-use a running server whose database configuration is unknown.
    try { await fetch(base, { signal: AbortSignal.timeout(1500) }); throw Error('Test port is already in use.'); } catch(e) { if(e.message === 'Test port is already in use.') throw e; }
    server = spawn(process.execPath, [root + '/node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3127'], { cwd: root, env: { ...process.env, DATABASE_URL: url.toString(), APP_ORIGIN: base, ALLEN_TEST_BUILD: 'true', ENABLE_PRIVATE_UPLOADS: 'true', NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', x => { logs = (logs + x).slice(-16000); }); server.stderr.on('data', x => { logs = (logs + x).slice(-16000); });
    const until = Date.now() + 120000;
    while (!logs.includes('Ready in')) { if (server.exitCode !== null) throw Error('Test server stopped: ' + logs); if (Date.now()>until) throw Error('Test server readiness timeout: '+logs); await new Promise(r=>setTimeout(r,300)); }
    for (const id of ids.clinics) await db.query('INSERT INTO "Clinic"(id,name) VALUES($1,$2)',[id,'Timeline synthetic clinic']);
    const doctors = [];
    for (let i=0;i<3;i++) {
      const token=randomBytes(32).toString('hex');
      await db.query('INSERT INTO "Doctor"(id,"fullName",email,"passwordHash","clinicId","isVerified","updatedAt","registrationNumber") VALUES($1,$2,$3,$4,$5,true,NOW(),$6)',[ids.doctors[i],'Timeline doctor '+i,randomUUID()+'@example.invalid','synthetic-unused-password',ids.clinics[i===2?1:0],randomUUID()]);
      await db.query('INSERT INTO "DoctorSession"("tokenHash","doctorId","expiresAt") VALUES($1,$2,NOW()+interval \'1 hour\')',[digest(token),ids.doctors[i]]);
      doctors.push('allen_doctor_session='+token);
    }
    const clinicUsers=[];
    for(let i=0;i<4;i++) {
      const token=randomBytes(32).toString('hex');
      await db.query('INSERT INTO "ClinicUser"(id,"clinicId","fullName",email,"passwordHash",role,"canAccessPatients","isActive") VALUES($1,$2,$3,$4,$5,$6,$7,true)',[ids.users[i],ids.clinics[i===3?1:0],'Timeline user '+i,randomUUID()+'@example.invalid','synthetic-unused-password',i===0?'CLINIC_ADMIN':i===1?'CLINIC_VIEWER':'CLINIC_STAFF',i!==2]);
      await db.query('INSERT INTO "ClinicSession"("tokenHash","userId","expiresAt") VALUES($1,$2,NOW()+interval \'1 hour\')',[digest(token),ids.users[i]]);
      clinicUsers.push('allen_clinic_session='+token);
    }
    const created=await call('/api/portal/cases',doctors[0],{patientReference:'SYNTHETIC TIMELINE',category:'Initial case',notes:'PRIVATE INITIAL NOTES',consent:'yes'},201);
    caseId=created.data.redirect.split('/').pop(); const portal='/api/portal/cases/'+caseId, clinic='/api/clinic/cases/'+caseId+'/timeline';
    await call(portal+'/timeline','',undefined,401);
    await call(portal+'/timeline',doctors[1],undefined,404);
    await call(portal+'/timeline',doctors[2],undefined,404);
    await call(clinic,'',undefined,401);await call(clinic,clinicUsers[2],undefined,403);await call(clinic,clinicUsers[3],undefined,404);
    await call(clinic,doctors[0],undefined,401); // No fallback from doctor to clinic identity.
    let t=(await call(portal+'/timeline',doctors[0])).data;
    ok(t.entries.some(e=>e.actor?.id===ids.doctors[0]&&e.status==='DRAFT'&&e.notes==='PRIVATE INITIAL NOTES'),'draft records real actor, persisted status and notes');
    ok(t.entries.some(e=>e.action==='created'&&e.actor===null&&e.status===null),'historical creator is not inferred');
    ok((await call(portal+'/timeline',doctors[0])).r.headers.get('cache-control').includes('no-store'),'timeline cannot be cached');
    const before=(await db.query('SELECT revision FROM "PortalCase" WHERE id=$1',[caseId])).rows[0].revision;
    await call(clinic,clinicUsers[0]);await call(clinic,clinicUsers[1]);
    ok((await db.query('SELECT revision FROM "PortalCase" WHERE id=$1',[caseId])).rows[0].revision===before,'timeline GET is read-only');
    await call(portal,doctors[0],{action:'submit',revision:0},409);
    // The standard upload API provides both private file and actor audit coverage.
    const form=new FormData();form.set('file',new Blob(['%PDF-1.7\nSynthetic record\n%%EOF']),'private-record.pdf');
    const upload=await fetch(base+portal+'/files',{method:'POST',headers:{Cookie:doctors[0],Origin:base},body:form});ok(upload.status===201,'record upload succeeds through existing API');
    t=(await call(portal+'/timeline',doctors[0])).data;
    await call(portal,doctors[0],{action:'submit'},409);
    await call(portal,doctors[0],{action:'submit',revision:0},409);
    await call(portal,doctors[0],{action:'submit',revision:t.case.revision},403,{Origin:'https://attacker.invalid'});
    await call(portal,doctors[0],{action:'submit',revision:String(t.case.revision)});
    await call(portal,doctors[0],{action:'comment',text:'PRIVATE MESSAGE'});
    const legacy=randomUUID();await db.query('INSERT INTO "CaseEvent"(id,"caseId",label,"createdAt") VALUES($1,$2,$3,$4)',[legacy,caseId,'Legacy event without actor','2026-01-01T01:02:03.456Z']);
    const labToken=randomBytes(32).toString('hex'),auth={Authorization:'Bearer '+labToken},lab='/api/lab/cases/'+caseId;
    await db.query('INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,NOW()+interval \'1 hour\')',[caseId,digest(labToken),'Timeline assigned lab']);
    let revision=(await call(portal+'/timeline',doctors[0])).data.case.revision;
    await call(lab,'',{action:'status',status:'IN_PRODUCTION',revision},409,auth);
    await call(lab,'',{action:'status',status:'PLANNING',revision:revision-1},409,auth);
    await call(lab,'',{action:'status',status:'PLANNING',revision},200,auth);
    await call(lab,'',{action:'status',status:'REVIEW',revision:revision+1},400,auth);
    const plan=randomUUID();
    await call(lab,'',{action:'plan',summary:'PRIVATE UNRELEASED PLAN SUMMARY',revision:revision+1},200,auth);
    const pending=(await db.query('SELECT id FROM "TreatmentPlan" WHERE "caseId"=$1',[caseId])).rows[0].id;
    t=(await call(portal+'/timeline',doctors[0])).data;
    ok(!JSON.stringify(t).includes('PRIVATE UNRELEASED PLAN SUMMARY'),'unreleased clinical plan stays hidden');
    await call(portal,doctors[0],{action:'approve',planId:pending,revision:t.case.revision},409);
    // Fixture review approval is set only in the explicitly guarded isolated database.
    await db.query('UPDATE "ClinicalReview" SET status=\'APPROVED\',"completedAt"=NOW() WHERE "planId"=$1',[pending]);
    await db.query('UPDATE "PortalCase" SET status=\'REVIEW\',revision=revision+1 WHERE id=$1',[caseId]);
    t=(await call(portal+'/timeline',doctors[0])).data;
    await call(portal,doctors[0],{action:'approve',planId:plan,revision:t.case.revision},409);
    // Concurrent decisions on the same revision: exactly one commits.
    const decide=()=>fetch(base+portal,{method:'POST',headers:{Cookie:doctors[0],Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'approve',planId:pending,revision:t.case.revision})});
    const decisions=await Promise.all([decide(),decide()]);ok(decisions.map(r=>r.status).sort().join(',')==='200,409','concurrent stale doctor decision is rejected');
    for(const status of ['IN_PRODUCTION','SHIPPED','COMPLETED']) { revision=(await call(portal+'/timeline',doctors[0])).data.case.revision;await call(lab,'',{action:'status',status,revision},200,auth); }
    revision=(await call(portal+'/timeline',doctors[0])).data.case.revision;
    await call(lab,'',{action:'status',status:'PLANNING',revision},409,auth);
    await call(portal,doctors[0],{action:'adjustment',planId:pending,text:'Cannot reopen completed',revision},409);
    t=(await call(portal+'/timeline',doctors[0])).data;
    ok(t.entries.some(e=>e.id==='event:'+legacy&&e.at==='2026-01-01T01:02:03.456Z'&&e.actor===null&&e.status===null),'legacy timestamps are preserved without fabricated history');
    ok(t.entries.some(e=>e.category==='FILE'&&e.title.includes('private-record.pdf'))&&t.entries.some(e=>e.notes==='PRIVATE MESSAGE'),'doctor sees file metadata and conversation notes');
    ok(t.entries.some(e=>e.actor?.role==='LAB'&&e.fromStatus==='APPROVED'&&e.status==='IN_PRODUCTION'),'lab status transition records actor and before/after status');
    for(let i=1;i<t.entries.length;i++) assert(t.entries[i-1].at<=t.entries[i].at);checks++;
    ok(JSON.stringify(t.entries)===JSON.stringify((await call(portal+'/timeline',doctors[0])).data.entries),'repeat reads retain deterministic order including tied timestamps');
    const ct=(await call(clinic,clinicUsers[0])).data;
    ok(!JSON.stringify(ct).includes('PRIVATE')&&!JSON.stringify(ct).includes('private-record.pdf')&&ct.entries.every(e=>e.notes===null),'clinic metadata excludes notes, messages, plan summaries and file details');
    ok(!JSON.stringify(t).includes('passwordHash')&&!JSON.stringify(t).includes('tokenHash')&&!JSON.stringify(t).includes('storageKey'),'timeline omits credentials and storage internals');
    const doctorPage=await call('/doctor-dashboard/cases/'+caseId,doctors[0]);ok(doctorPage.data.includes('Case timeline')&&doctorPage.data.includes('Doctor–lab conversation'),'doctor detail preserves existing sections and shared timeline');
    const clinicPage=await call('/clinic/cases/'+caseId+'/timeline',clinicUsers[0]);ok(clinicPage.data.includes('Case timeline')&&!clinicPage.data.includes('PRIVATE MESSAGE'),'clinic timeline UI renders scoped metadata');
    const list=await call('/clinic/manage/cases',clinicUsers[0]);ok(list.data.includes('/clinic/cases/'+caseId+'/timeline'),'clinic case list links to timeline');
    await db.query('UPDATE "ClinicUser" SET "canAccessPatients"=false WHERE id=$1',[ids.users[0]]);await call(clinic,clinicUsers[0],undefined,403);
    await db.query('UPDATE "Doctor" SET "isVerified"=false WHERE id=$1',[ids.doctors[0]]);await call(portal+'/timeline',doctors[0],undefined,401);
    console.log('Completed '+checks+' case timeline integration checks.');
    console.log('Synthetic fixtures retained only in the isolated clinical test database (immutable review audit).');
  } finally { await db.end(); if(server) server.kill(); }
}
main().catch(e=>{console.error(e.stack);if(logs)console.error(logs.slice(-6000));process.exitCode=1;});
