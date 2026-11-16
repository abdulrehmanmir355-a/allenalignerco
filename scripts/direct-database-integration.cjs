// Regression checks for direct PostgreSQL registration and clinic provisioning.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const u=new URL(process.env.DATABASE_URL),base=process.env.PORTAL_TEST_ORIGIN||'http://127.0.0.1:3107';
assert(['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='5432'&&u.pathname==='/allen_aligner_codex_test');
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const client=new Client({connectionString:u.toString(),options:'-c timezone=UTC'}),email='direct-db-'+randomUUID()+'@example.invalid';
let doctorId,clinicId,checks=0;
function eq(actual,expected,label){assert.equal(actual,expected,label);console.log('PASS '+label);checks++;}
async function post(route,body,cookie=''){return fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});}
(async()=>{await client.connect();try{
 const password=randomBytes(20).toString('hex'),registration={fullName:'Synthetic direct DB doctor',clinicName:'Synthetic direct DB clinic',email,phone:'+923001234567',registrationNumber:randomUUID(),password};
 eq((await post('/api/doctor-register',registration)).status,201,'registration persists without Prisma');
 eq((await post('/api/doctor-register',registration)).status,409,'PostgreSQL unique violation returns conflict');
 const row=(await client.query('SELECT id,"clinicId","isVerified" FROM "Doctor" WHERE email=$1',[email])).rows[0];doctorId=row.id;eq(row.isVerified,false,'registration starts unverified');eq(row.clinicId,null,'registration has no clinic until verification');
 await client.query('UPDATE "Doctor" SET "isVerified"=true WHERE id=$1',[doctorId]);
 const login=await post('/api/doctor-login',{email,password});eq(login.status,200,'first verified login provisions clinic');const cookie=login.headers.get('set-cookie').split(';')[0];
 clinicId=(await client.query('SELECT "clinicId" FROM "Doctor" WHERE id=$1',[doctorId])).rows[0].clinicId;assert(clinicId);checks++;
 eq((await post('/api/doctor-login',{email,password})).status,200,'repeat login preserves clinic');eq((await client.query('SELECT "clinicId" FROM "Doctor" WHERE id=$1',[doctorId])).rows[0].clinicId,clinicId,'no duplicate clinic provisioning');
 const patient=await post('/api/clinic/patients',{fullName:'Synthetic Date Patient',dateOfBirth:'2001-02-03'},cookie);eq(patient.status,201,'dated patient created');eq((await patient.json()).patient.dateOfBirth,'2001-02-03T00:00:00.000Z','birth date retains exact UTC day');
 const expires=(await client.query('SELECT EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP AT TIME ZONE \'UTC\')) AS remaining FROM "DoctorSession" WHERE "doctorId"=$1 LIMIT 1',[doctorId])).rows[0];assert(Number(expires.remaining)>28700&&Number(expires.remaining)<=28800);checks++;console.log('PASS session expiry is eight hours in UTC');
 console.log('Completed '+checks+' direct database checks.');
}finally{
 if(clinicId){await client.query('DELETE FROM "PatientHistory" WHERE "clinicId"=$1',[clinicId]);await client.query('DELETE FROM "Patient" WHERE "clinicId"=$1',[clinicId]);}
 if(doctorId)await client.query('DELETE FROM "Doctor" WHERE id=$1',[doctorId]);
 if(clinicId)await client.query('DELETE FROM "Clinic" WHERE id=$1',[clinicId]);
 await client.query('DELETE FROM "LoginThrottle" WHERE key=$1',['login:'+createHash('sha256').update(email).digest('hex')]);await client.end();console.log('Synthetic direct DB fixtures removed.');}
})().catch(e=>{console.error(e.message);process.exitCode=1});
