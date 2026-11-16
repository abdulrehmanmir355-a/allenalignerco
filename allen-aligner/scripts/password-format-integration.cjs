// Synthetic fixtures only. Never applies the proposed CHECK constraint or any DDL.
const root=require('node:path').resolve(__dirname,'..');
require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require(root+'/node_modules/pg'),{compare,getRounds}=require(root+'/node_modules/bcryptjs');
const {randomUUID,createHash}=require('node:crypto'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const url=new URL(process.env.PASSWORD_FORMAT_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/allen_aligner_clinical_test_20261022')throw Error('Explicit isolated local clinical test database required.');
const db=new Client({connectionString:url.toString()}),base='http://127.0.0.1:3157',email=randomUUID()+'@example.invalid',password=randomUUID()+'Aa1!',replacement=randomUUID()+'Bb2!';
let server,logs='',doctorId,clinicId,checks=0;
const validHash=s=>/^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(s);
function ok(v,label){assert(v,label);checks++;console.log('PASS '+label);}
async function api(path,body,status=200,cookie='',origin=base){const r=await fetch(base+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert.equal(r.status,status,path+' HTTP '+r.status);checks++;return {r,b:text.startsWith('{')?JSON.parse(text):text};}
(async()=>{await db.connect();try{
 try{await fetch(base,{signal:AbortSignal.timeout(1500)});throw Error('Test port is already in use');}catch(e){if(e.message==='Test port is already in use')throw e;}
 server=spawn(process.execPath,[root+'/node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3157'],{cwd:root,env:{...process.env,DATABASE_URL:url.toString(),APP_ORIGIN:base,ALLEN_TEST_BUILD:'true',ENABLE_EXTENDED_CASE_WORKFLOW:'false',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',x=>logs=(logs+x).slice(-8000));server.stderr.on('data',x=>logs=(logs+x).slice(-8000));
 const until=Date.now()+120000;while(!logs.includes('Ready in')){if(server.exitCode!==null||Date.now()>until)throw Error(logs);await new Promise(r=>setTimeout(r,300));}
 const registration={fullName:'Synthetic password format doctor',clinicName:'Synthetic format clinic',email,phone:'+923001234567',registrationNumber:randomUUID(),password};
 await api('/api/doctor-register',{...registration,password:'آ'.repeat(37)},400);
 ok((await db.query('SELECT id FROM "Doctor" WHERE email=$1',[email])).rowCount===0,'oversized UTF-8 credentials create no account');
 await api('/api/doctor-register',{...registration,passwordHash:'plaintext-cannot-override-server-hash',isVerified:true},201);
 let row=(await db.query('SELECT id,"clinicId","isVerified","passwordHash" FROM "Doctor" WHERE email=$1',[email])).rows[0];doctorId=row.id;
 ok(validHash(row.passwordHash)&&getRounds(row.passwordHash)===12&&await compare(password,row.passwordHash),'registration stores a valid bcrypt hash of the original password');
 ok(row.isVerified===false&&row.clinicId===null,'registration cannot self-verify or assign clinic access');
 await api('/api/doctor-login',{email,password},403);
 await db.query('UPDATE "Doctor" SET "isVerified"=true WHERE id=$1',[doctorId]); // Explicit synthetic approval fixture only.
 await api('/api/doctor-login',{email,password:'incorrect-password-123'},401);
 const signed=await api('/api/doctor-login',{email,password});const cookie=signed.r.headers.get('set-cookie').split(';')[0];
 ok(signed.b.success===true,'newly registered bcrypt credential signs in after normal verification');
 clinicId=(await db.query('SELECT "clinicId" FROM "Doctor" WHERE id=$1',[doctorId])).rows[0].clinicId;
 const currentHash=async()=>(await db.query('SELECT "passwordHash" FROM "Doctor" WHERE id=$1',[doctorId])).rows[0].passwordHash;
 const before=await currentHash();
 await api('/api/account/doctor',{currentPassword:'incorrect-password-123',newPassword:replacement},401,cookie);
 await api('/api/account/doctor',{currentPassword:password,newPassword:'آ'.repeat(37)},400,cookie);
 await api('/api/account/doctor',{currentPassword:password,newPassword:replacement},403,cookie,'https://attacker.invalid');
 ok(await currentHash()===before,'rejected password forms leave stored credentials unchanged');
 await api('/api/account/doctor',{currentPassword:password,newPassword:replacement},200,cookie);
 row=(await db.query('SELECT "passwordHash","isVerified","clinicId" FROM "Doctor" WHERE id=$1',[doctorId])).rows[0];
 ok(validHash(row.passwordHash)&&getRounds(row.passwordHash)===12&&await compare(replacement,row.passwordHash)&&!await compare(password,row.passwordHash),'password change stores bcrypt and requires the new password');
 ok(row.isVerified===true&&row.clinicId===clinicId,'password format writes preserve clinic and verification');
 await api('/api/portal/profile',undefined,401,cookie);
 await api('/api/doctor-login',{email,password},401);
 const again=await api('/api/doctor-login',{email,password:replacement});const currentCookie=again.r.headers.get('set-cookie').split(';')[0];
 const patients=await api('/api/clinic/patients',undefined,200,currentCookie);ok(Array.isArray(patients.b.patients),'authenticated data API loads after password change');
 console.log('Completed '+checks+' password format integration checks. No migrations applied.');
}finally{
 if(doctorId){await db.query('DELETE FROM "ManagementAudit" WHERE "recordId"=$1',[doctorId]);await db.query('DELETE FROM "Doctor" WHERE id=$1',[doctorId]);}
 if(clinicId)await db.query('DELETE FROM "Clinic" WHERE id=$1',[clinicId]);
 await db.query('DELETE FROM "LoginThrottle" WHERE key=ANY($1::text[])',[['login:'+createHash('sha256').update(email).digest('hex'),'password:doctor:'+createHash('sha256').update(String(doctorId)).digest('hex')]]);
 await db.end();if(server)server.kill();
}})().catch(e=>{console.error(e.message);if(logs)console.error(logs.slice(-4000));process.exitCode=1;});
