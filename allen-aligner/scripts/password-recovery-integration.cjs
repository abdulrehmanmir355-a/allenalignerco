// End-to-end recovery checks use synthetic fixtures and the isolated local doctor test DB.
const path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),req=require('node:module').createRequire(path.join(root,'package.json'));
req('dotenv').config({path:path.join(root,'.env'),quiet:true});req('dotenv').config({path:path.join(root,'.env.local'),override:true,quiet:true});
const {Client}=req('pg'),{hash,compare}=req('bcryptjs');
const source=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(source.hostname))throw Error('A local test database is required.');
const testUrl=new URL(source);testUrl.pathname='/allen_aligner_codex_test';
const adminUrl=new URL(source);adminUrl.pathname='/postgres';
const ownerDbName='allen_owner_recovery_test_'+randomBytes(4).toString('hex');
const ownerUrl=new URL(source);ownerUrl.pathname='/'+ownerDbName;
const base='http://127.0.0.1:3193', doctorId=randomUUID(), doctorEmail=`recovery-${doctorId}@example.invalid`, hrId=randomUUID();
const ownerId='AA-OWN-'+randomBytes(5).toString('hex').toUpperCase();
const requestEmail='forgot-'+doctorId+'@example.invalid', hrToken=randomBytes(32).toString('hex');
let server,logs='',checks=0,admin,doctorDb,ownerDb;
const digest=value=>createHash('sha256').update(value).digest('hex');
function pass(label){checks++;console.log('PASS '+label)}
async function api(route,body,cookie=''){
 const r=await fetch(base+route,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 let data={};try{data=await r.json()}catch{}return {r,data};
}
async function run(){
 admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
 await admin.query(`CREATE DATABASE "${ownerDbName}"`);
 ownerDb=new Client({connectionString:ownerUrl.toString()});await ownerDb.connect();
 const ownerBaseSql=require('node:fs').readFileSync(path.join(root,'database/migrations/20261030130000_owner_portal.sql'),'utf8');
 await ownerDb.query(ownerBaseSql);await ownerDb.query(require('node:fs').readFileSync(path.join(root,'database/migrations/20261106120000_owner_password_reset.sql'),'utf8'));
 doctorDb=new Client({connectionString:testUrl.toString()});await doctorDb.connect();
 for(const migration of ['20261106120100_doctor_password_recovery.sql','20261106120200_doctor_password_recovery_complaints.sql'])await doctorDb.query(require('node:fs').readFileSync(path.join(root,'database/migrations',migration),'utf8'));
 const initialPassword=randomBytes(18).toString('base64url'),hrPasswordHash=await hash(randomBytes(18).toString('hex'),12),oldOwnerHash=await hash(initialPassword,12);
 await doctorDb.query(`INSERT INTO "HRUser"(id,email,"passwordHash",role,"isActive", "fullName") VALUES($1,$2,$3,'HR_ADMIN',TRUE,'Synthetic recovery reviewer')`,[hrId,`hr-${hrId}@example.invalid`,hrPasswordHash]);
 await doctorDb.query(`INSERT INTO "HRSession"("tokenHash","hrUserId","expiresAt") VALUES($1,$2,NOW()+interval '30 minutes')`,[digest(hrToken),hrId]);
 await doctorDb.query(`INSERT INTO "Doctor"(id,"fullName",email,"passwordHash",phone,"isVerified","updatedAt") VALUES($1,'Synthetic Recovery Doctor',$2,$3,'+1 555 0100',TRUE,NOW())`,[doctorId,doctorEmail,oldOwnerHash]);
 await ownerDb.query(`INSERT INTO "OwnerAccount"("ownerId","fullName",email,"passwordHash") VALUES($1,'Synthetic Recovery Owner',$2,$3)`,[ownerId,`owner-${doctorId}@example.invalid`,oldOwnerHash]);
 await ownerDb.query(`INSERT INTO "OwnerSession"("tokenHash","ownerId","expiresAt") SELECT $1,id,NOW()+interval '1 hour' FROM "OwnerAccount" WHERE "ownerId"=$2`,[digest(randomBytes(32).toString('hex')),ownerId]);
 try{await fetch(base,{signal:AbortSignal.timeout(1000)});throw Error('Integration test port already in use.')}catch(e){if(e.message==='Integration test port already in use')throw e;}
 server=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3193'],{cwd:root,env:{...process.env,DATABASE_URL:testUrl.toString(),OWNER_DATABASE_URL:ownerUrl.toString(),OWNER_NEON_DATABASE_URL:ownerUrl.toString(),APP_ORIGIN:base,ALLEN_TEST_BUILD:'true',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs=(logs+b).toString().slice(-12000));server.stderr.on('data',b=>logs=(logs+b).toString().slice(-12000));
 const deadline=Date.now()+120000;while(!/Ready in|Local:\s+http/.test(logs)){if(server.exitCode!==null||Date.now()>deadline)throw Error('Next test server did not start. '+logs.slice(-4000));await new Promise(r=>setTimeout(r,300));}
 const hrCookie='allen_hr_session='+hrToken;
 let response;
 for(const route of ['/doctor-login','/doctor-password-reset-request','/doctor-password-reset','/doctor-password-recovery-complaint','/owner-password-reset']){const page=await api(route);assert.equal(page.r.status,200,route);pass('page loads '+route);}
 response=await api('/hr/password-recovery',undefined,hrCookie);assert.equal(response.r.status,200);pass('authorized HR recovery screen loads');
 response=await api('/api/doctor-password-reset-request',{fullName:'Synthetic Recovery Doctor',email:doctorEmail,phone:'+1 (555) 0100'});assert.equal(response.r.status,202);assert.equal((await doctorDb.query(`SELECT id FROM "DoctorPasswordResetRequest" WHERE "doctorId"=$1 AND status='PENDING'`,[doctorId])).rowCount,1);pass('matching doctor details create a reset request');
 response=await api('/api/doctor-password-reset-request',{fullName:'Synthetic Recovery Doctor',email:doctorEmail,phone:'+1 555 9999'});assert.equal(response.r.status,202);assert.equal((await doctorDb.query(`SELECT id FROM "DoctorPasswordResetRequest" WHERE "doctorId"=$1`,[doctorId])).rowCount,1);pass('mismatched phone reveals no account and creates no request');
 response=await api('/api/hr/doctor-password-reset-requests',undefined,hrCookie);assert.equal(response.r.status,200);assert.equal(response.data.requests.length,1);pass('active HR can see reset requests');
 response=await api('/api/hr/doctor-password-reset-requests',{kind:'request',requestId:response.data.requests[0].id,decision:'approve'},hrCookie);assert.equal(response.r.status,200);assert.equal(typeof response.data.token,'string');
 const newDoctorPassword=randomBytes(20).toString('base64url');let changed=await api('/api/doctor/password-reset',{email:doctorEmail,token:response.data.token,password:newDoctorPassword,confirmPassword:newDoctorPassword});assert.equal(changed.r.status,200);assert.equal((await doctorDb.query(`SELECT 1 FROM "DoctorSession" WHERE "doctorId"=$1`,[doctorId])).rowCount,0);assert(await compare(newDoctorPassword,(await doctorDb.query(`SELECT "passwordHash" FROM "Doctor" WHERE id=$1`,[doctorId])).rows[0].passwordHash));pass('approved doctor reset changes hash and revokes sessions');
 const complaint={fullName:'Synthetic account holder',contactEmail:requestEmail,phone:'',complaint:'I cannot recall my registered account details.'};response=await api('/api/doctor-password-recovery-complaints',complaint);assert.equal(response.r.status,202);response=await api('/api/hr/doctor-password-reset-requests',undefined,hrCookie);assert.equal(response.r.status,200);assert.equal(response.data.complaints.length,1);pass('forgotten-details complaint reaches HR inbox');
 response=await api('/api/hr/doctor-password-reset-requests',{kind:'complaint',complaintId:response.data.complaints[0].id,decision:'approve',doctorEmail},hrCookie);assert.equal(response.r.status,200);assert.equal(typeof response.data.token,'string');
 const finalDoctorPassword=randomBytes(20).toString('base64url');changed=await api('/api/doctor/password-reset',{email:doctorEmail,token:response.data.token,password:finalDoctorPassword,confirmPassword:finalDoctorPassword});assert.equal(changed.r.status,200);pass('HR-verified complaint can issue a reset code');
 response=await api('/api/hr/owner-password-reset',{ownerId,reason:'Synthetic recovery test only'},hrCookie);assert.equal(response.r.status,201);assert.equal(typeof response.data.token,'string');
 const newOwnerPassword=randomBytes(20).toString('base64url');changed=await api('/api/owner/password-reset',{ownerId,token:response.data.token,password:newOwnerPassword,confirmPassword:newOwnerPassword});assert.equal(changed.r.status,200);assert(await compare(newOwnerPassword,(await ownerDb.query(`SELECT "passwordHash" FROM "OwnerAccount" WHERE "ownerId"=$1`,[ownerId])).rows[0].passwordHash));assert.equal((await ownerDb.query(`SELECT 1 FROM "OwnerSession" s JOIN "OwnerAccount" a ON a.id=s."ownerId" WHERE a."ownerId"=$1`,[ownerId])).rowCount,0);pass('Owner reset changes hash and revokes sessions');
 console.log(`Completed ${checks} password recovery end-to-end checks.`);
}
run().catch(error=>{console.error(error.message||error);if(logs)console.error(logs.slice(-4000));process.exitCode=1;}).finally(async()=>{
 if(doctorDb){await doctorDb.query(`DELETE FROM "DoctorPasswordRecoveryComplaint" WHERE "contactEmail"=$1`,[requestEmail]).catch(()=>{});await doctorDb.query(`DELETE FROM "Doctor" WHERE id=$1`,[doctorId]).catch(()=>{});await doctorDb.query(`DELETE FROM "HRSession" WHERE "hrUserId"=$1`,[hrId]).catch(()=>{});await doctorDb.query(`DELETE FROM "HRUser" WHERE id=$1`,[hrId]).catch(()=>{});await doctorDb.query(`DELETE FROM "LoginThrottle" WHERE key=ANY($1::text[])`,[['doctor-reset-request:'+digest(doctorEmail),'doctor-recovery-complaint:'+digest(requestEmail),'doctor-reset-review:'+digest(hrId),'owner-password-reset:'+digest(hrId),'owner-reset-complete:'+digest(ownerId)]]).catch(()=>{});await doctorDb.end().catch(()=>{});}
 if(ownerDb){await ownerDb.end().catch(()=>{});}
 if(server)server.kill();
 if(admin){await admin.query(`DROP DATABASE IF EXISTS "${ownerDbName}" WITH (FORCE)`).catch(()=>{});await admin.end().catch(()=>{});}
});
