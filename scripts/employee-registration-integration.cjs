const root=require('node:path').resolve(__dirname,'..');require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});const {Client}=require(root+'/node_modules/pg'),{randomUUID,randomBytes,createHash}=require('node:crypto'),assert=require('node:assert/strict');const u=new URL(process.env.CLINICAL_TEST_DATABASE_URL||'');if(u.pathname!='/allen_aligner_clinical_test_20261022'||!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Isolated clinical test database required');const db=new Client({connectionString:u.toString()}),base='http://127.0.0.1:3119';let n=0;
async function api(path,cookie='',body,status=200,headers={}){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.equal(r.status,status,JSON.stringify(b));n++;return {r,b};}
(async()=>{await db.connect();try{
 const hr=randomUUID(),token=randomBytes(32).toString('hex');await db.query(`INSERT INTO "HRUser"(id,email,"passwordHash",role,"isActive") VALUES($1,$2,'unused-test-hash','HR_ADMIN',true)`,[hr,hr+'@example.invalid']);await db.query(`INSERT INTO "HRSession"("tokenHash","hrUserId","expiresAt") VALUES($1,$2,now()+interval '1 hour')`,[createHash('sha256').update(token).digest('hex'),hr]);const admin='allen_hr_session='+token;
 const id=randomUUID();const {rows:[employee]}=await db.query(`INSERT INTO "Employee"(id,"employeeCode","fullName",department,designation) VALUES($1,$2,'Synthetic Enrollment','QA','QA') RETURNING "permanentId"`,[id,id]);const employeeId=employee.permanentId,path='/api/work/registration',password='A-private-test-password-123';
 await api(path,'',undefined,401);await api(path,'',{action:'invite',employeeId,reason:'Unauthorized invitation'},401);await api(path,admin,{action:'invite',employeeId,reason:'Verified employee identity'},403,{Origin:'https://bad.invalid'});
 const first=(await api(path,admin,{action:'invite',employeeId,reason:'Verified employee identity'})).b;
 const listed=(await api(path,admin)).b;assert(!JSON.stringify(listed).includes(first.token));n++;
 const enrollment={action:'register',employeeId,token:first.token,password,confirmPassword:password};await api(path,'',{...enrollment,confirmPassword:'different-password'},400);
 await api('/api/work/auth','',{employeeId,password},401);
 await api(path,admin,{action:'revoke',employeeId,reason:'Replace invitation securely'});await api(path,'',enrollment,400);
 const second=(await api(path,admin,{action:'invite',employeeId,reason:'Verified identity again'})).b;
 await db.query(`UPDATE "WorkAccount" SET "registrationExpiresAt"=now()-interval '1 second' WHERE "employeeId"=$1`,[id]);await api(path,'',{...enrollment,token:second.token},400);
 const third=(await api(path,admin,{action:'invite',employeeId,reason:'Issue fresh verified invitation'})).b;
 const results=await Promise.all([1,2].map(()=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({...enrollment,token:third.token})})));assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);n++;
 await api(path,'',{...enrollment,token:third.token},400);await api(path,admin,{action:'invite',employeeId,reason:'Cannot reset via registration'},409);
 const signed=await api('/api/work/auth','',{employeeId,password});const cookie=signed.r.headers.get('set-cookie').split(';')[0];await api(path,cookie,undefined,403);
 const state=(await api('/api/clinical/registration',cookie)).b;assert.equal(state.clinicalRole,null);assert.equal(state.mustChangePassword,false);n+=2;await api('/api/clinical/reviews',cookie,undefined,403);
 await api('/api/clinical/registration',cookie,{action:'request',role:'REVIEWER',reason:'Qualified reviewer requests internal access'},202);
 const {rows:[account]}=await db.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=$1',[id]);assert(account.passwordHash.startsWith('$2'));assert.equal(account.registrationTokenHash,null);assert.equal(account.registrationExpiresAt,null);n+=3;
 const audits=(await db.query('SELECT detail FROM "WorkAudit" WHERE "recordId"=$1',[account.id])).rows;assert(!JSON.stringify(audits).includes(third.token));assert(!JSON.stringify(audits).includes(password));n+=2;
 for(const route of ['/employee/register','/employee/login','/hr/employee-access','/clinical/login','/clinical/register']){const res=await fetch(base+route,{headers:{Cookie:admin}});assert.equal(res.status,200);n++}
 console.log('PASS '+n+' employee registration/login checks including expired/revoked/single-use invitations, concurrent redemption, HR authorization and internal access requests.');
}finally{await db.end()}})().catch(e=>{console.error(e.stack);process.exitCode=1});

