// Requires an application server using the SAME isolated identity test database.
const root=require('path').resolve(__dirname,'..');require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('crypto'),assert=require('assert/strict');
const u=new URL(process.env.IDENTITY_TEST_DATABASE_URL||process.env.DATABASE_URL);u.pathname='/allen_aligner_identity_test_20261023';if(!['127.0.0.1','localhost'].includes(u.hostname))throw Error('Local isolated test database required');
const base=process.env.IDENTITY_TEST_ORIGIN||'http://127.0.0.1:3123';if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local test server required');
const db=new Client({connectionString:u.toString()}),password='Synthetic-test-password-123!',hash=s=>createHash('sha256').update(s).digest('hex');let checks=0;
function ok(v,msg){assert(v,msg);checks++;console.log('PASS',msg);}
async function api(path,cookie='',body,status=200,origin=base){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(b));checks++;return {r,b};}
const work=(cookie,action,data,status=200)=>api('/api/work',cookie,{action,data},status);
(async()=>{await db.connect();try{
 const before=(await db.query('SELECT id,"employeeCode","permanentId" FROM "Employee" ORDER BY id')).rows;
 async function hr(role){const id=randomUUID(),token=randomBytes(32).toString('hex');await db.query('INSERT INTO "HRUser"(id,email,"passwordHash",role,"isActive") VALUES($1,$2,$3,$4,true)',[id,id+'@example.invalid','test-only',role]);await db.query('INSERT INTO "HRSession"("tokenHash","hrUserId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[hash(token),id]);return {id,cookie:'allen_hr_session='+token};}
 const admin=await hr('HR_ADMIN'),officer=await hr('HR_OFFICER');
 const created=await Promise.all(Array.from({length:3},(_,index)=>db.query('INSERT INTO "Employee"(id,"employeeCode","fullName",department,designation,"joinedOn","createdBy") VALUES($1,\'\',$2,\'QA\',\'Tester\',\'2026-01-01\',$3) RETURNING *',[randomUUID(),'Synthetic Identity '+index,admin.id])));const [e,other,manager]=created.map(r=>r.rows[0]);
 ok(new Set(created.map(r=>r.rows[0].employeeCode)).size===3,'Concurrent creation produces unique sequential IDs');ok(e.employeeCode===e.permanentId,'New employee uses one code for directory and login');
 try{await db.query('UPDATE "Employee" SET "employeeCode"=\'CHANGED\' WHERE id=$1',[e.id]);assert.fail('Identity changed');}catch(error){ok(!!error.code,'Permanent code mutation rejected');}
 const reg='/api/work/registration',identity='/api/work/identity';
 const invite=(employeeId,reason='Identity verified by test HR')=>api(reg,admin.cookie,{action:'invite',employeeId,reason,method:'PRINTED'});
 await api(identity,'',undefined,401);await api(reg,officer.cookie,{action:'invite',employeeId:e.permanentId,reason:'No issue permission'},403);
 await api(reg,admin.cookie,{action:'invite',employeeId:e.permanentId,reason:'Cross-origin denied'},403,'https://invalid.example');
 const first=(await invite(e.permanentId)).b;
 ok(first.token.length===64,'High-entropy invitation issued');const account=(await db.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=$1',[e.id])).rows[0];ok(account.registrationTokenHash===hash(first.token),'Only token hash stored on linked account');
 await api(identity,officer.cookie,{invitationId:first.invitationId,action:'handover'},404);
 await api(identity,admin.cookie,{invitationId:first.invitationId,action:'handover',remarks:'Printed slip handed over'});
 await api(identity,admin.cookie,{invitationId:first.invitationId,action:'receive',receivedBy:e.fullName,acknowledgementMethod:'Signed slip',remarks:'Manual receipt recorded'});
 const enrollment={action:'register',employeeId:e.permanentId,token:first.token,password,confirmPassword:password};
 await api(reg,'',{...enrollment,confirmPassword:'Different-password'},400);
 await db.query('UPDATE "WorkAccount" SET "registrationExpiresAt"=now()-interval \'1 second\' WHERE "employeeId"=$1',[e.id]);await api(reg,'',enrollment,400);
 const second=(await invite(e.permanentId)).b;await api(reg,'',enrollment,400);
 await api(reg,admin.cookie,{action:'revoke',employeeId:e.permanentId,reason:'Revoke for test'});await api(reg,'',{...enrollment,token:second.token},400);
 const third=(await invite(e.permanentId)).b;
 const concurrent=await Promise.all([1,2].map(()=>fetch(base+reg,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...enrollment,token:third.token})})));ok(concurrent.map(r=>r.status).sort().join(',')==='201,400','Concurrent activation permits exactly one redemption');
 await api(reg,'',{...enrollment,token:third.token},400);await invite(e.permanentId).then(()=>assert.fail('Duplicate invitation accepted'),error=>ok(error.message.includes('409'),'Already activated account cannot be recreated'));
 const signed=await api('/api/work/auth','',{employeeId:e.permanentId,password}),cookie=signed.r.headers.get('set-cookie').split(';')[0];
 ok(signed.r.headers.get('set-cookie').includes('HttpOnly'),'Session cookie is HttpOnly');
 await api(identity,cookie,{invitationId:third.invitationId,action:'acknowledge'});await api(identity,cookie,{invitationId:third.invitationId,action:'acknowledge'},409);
 const state=(await api(identity,cookie)).b;ok(state.employees.length===1&&state.employees[0].id===e.id,'Employee identity API only returns self');ok(!JSON.stringify(state).includes(third.token)&&!JSON.stringify(state).includes(password),'Identity history never exposes secrets');ok(state.events.some(v=>v.action==='ACTIVATED'),'Activation recorded in immutable history');
 const [activated]=(await db.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=$1',[e.id])).rows;ok(activated.registrationTokenHash===null&&activated.passwordHash.startsWith('$2'),'Activation consumes token and hashes password');ok((await db.query('SELECT count(*)::int n FROM "WorkAccount" WHERE "employeeId"=$1',[e.id])).rows[0].n===1,'One linked account per employee');
 const another=(await invite(other.permanentId)).b;await api(identity,cookie,{invitationId:another.invitationId,action:'acknowledge'},404);
 const fields={reportingDate:'2026-10-22',taskId:null,workDescription:'Synthetic aligner work',workCompleted:'Design checked',pendingWork:'Review',timeSpent:60,remarks:'Additional comments',workStartTime:'09:30',taskStatus:'BLOCKED',blockers:'Waiting for review'};
 const report=(await work(cookie,'draft',fields)).b;await work(cookie,'draft',fields,409);await work(cookie,'submit',{id:report.id});await work(cookie,'approve',{id:report.id},403);await work(admin.cookie,'requestRevision',{id:report.id,reason:'Add quality evidence'});
 const revision=(await work(cookie,'revise',{id:report.id,reason:'Provide evidence'})).b;await work(cookie,'draft',{...fields,id:revision.id,taskStatus:'COMPLETED',blockers:'',workCompleted:'All checks passed'});await work(cookie,'submit',{id:revision.id});await work(admin.cookie,'review',{id:revision.id,reason:'Evidence verified'});await work(admin.cookie,'approve',{id:revision.id,reason:'Accepted'});
 await work(cookie,'draft',{...fields,id:revision.id},409);
 const history=(await api('/api/work',cookie)).b;ok(history.reports.length===2&&history.reports.find(r=>r.id===report.id).blockers===fields.blockers,'Submitted report versions retain original content');ok(history.auditTrail.some(v=>v.action==='APPROVED'&&v.actorId===admin.id),'Review records identity and timestamp');
 await api('/api/hr/assets',admin.cookie,{employeeId:e.id,action:'ISSUE',assetName:'Synthetic Laptop',serialNumber:'TEST-ONLY'});const assets=(await api('/api/work',cookie)).b.assets;ok(assets.length===1,'Employee sees assigned assets');
 const exit=(await api('/api/hr/manage/offboarding',admin.cookie,{employeeId:e.id,exitType:'TERMINATION',lastWorkingDay:'2026-10-23',reason:'Synthetic offboarding test'})).b;
 await api('/api/work',cookie,undefined,401);await api('/api/work/auth','',{employeeId:e.permanentId,password},401);ok((await db.query('SELECT count(*)::int n FROM "WorkSession" WHERE "accountId"=$1',[activated.id])).rows[0].n===0,'Offboarding invalidates sessions');
 const offboarding=(await db.query('SELECT id FROM "EmployeeOffboarding" WHERE "employeeId"=$1',[e.id])).rows[0];
 const clearances=(await db.query('SELECT id FROM "OffboardingClearance" WHERE "offboardingId"=$1',[offboarding.id])).rows;
 for(const c of clearances){const r=await fetch(base+'/api/hr/manage/clearance',{method:'PATCH',headers:{Origin:base,Cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({id:c.id,status:'CLEARED'})});assert.equal(r.status,200);checks++;}
 async function finish(status){const r=await fetch(base+'/api/hr/manage/offboarding',{method:'PATCH',headers:{Origin:base,Cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({id:offboarding.id,status:'COMPLETED'})});assert.equal(r.status,status,await r.text());checks++;}
 await finish(409);const asset=(await api('/api/hr/assets?employeeId='+e.id,admin.cookie)).b.assets[0];await api('/api/hr/assets',admin.cookie,{employeeId:e.id,action:'RETURN',assetId:asset.id});await finish(200);ok((await db.query('SELECT status FROM "Employee" WHERE id=$1',[e.id])).rows[0].status==='INACTIVE','Existing offboarding completion remains functional');
 ok(JSON.stringify(before)===JSON.stringify((await db.query('SELECT id,"employeeCode","permanentId" FROM "Employee" WHERE id=ANY($1::text[]) ORDER BY id',[before.map(e=>e.id)])).rows),'Pre-existing employee codes unchanged');
 for(const page of ['/hr/employee-access','/employee/register','/employee/login','/hr/performance','/hr/assets','/hr/documents/manage']){const r=await fetch(base+page,{headers:{Cookie:admin.cookie}});ok(r.status===200,'Page renders '+page);}
 console.log('PASSED '+checks+' identity, delivery, activation, authorization, reporting and offboarding checks. Synthetic data remains only in the isolated test database.');
}finally{await db.end();}})().catch(e=>{console.error(e.stack);process.exitCode=1});
