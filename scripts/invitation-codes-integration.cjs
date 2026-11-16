// Runs only against an explicitly named local, isolated invitation test database.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {AsyncLocalStorage}=require('node:async_hooks'),{randomBytes,randomUUID,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),{Pool}=require('pg');
const url=new URL(process.env.INVITATION_TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/allen_aligner_invitation_test_\d{8}_[a-f0-9]{8}$/.test(url.pathname))throw Error('An isolated invitation test database is required; never use the actual employee database.');
const pool=new Pool({connectionString:url.toString(),max:6}),storage=new AsyncLocalStorage();
function adapter(client=pool){return {query:async(...args)=>(await client.query(...args)).rows,async transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(adapter(c));await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}};}
const db=adapter();
function load(file,mocks={}){const filename=path.join(root,file),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const normal=m.require.bind(m);m.require=id=>Object.hasOwn(mocks,id)?mocks[id]:normal(id);m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return m.exports;}
const digest=value=>createHash('sha256').update(value).digest('hex'),origin='http://127.0.0.1:3190';
let denyThrottle=false;
const portalAuth={digest,sameOrigin:r=>r.headers.get('origin')===origin,throttle:async()=>!denyThrottle};
const http=load('app/lib/portal-http.ts',{'./portal-auth':portalAuth});
const headers={cookies:async()=>({get:name=>{const value=storage.getStore()?.[name];return value?{value}:undefined;}})};
const hrAuth=load('app/lib/hr-auth.ts',{'server-only':{},'next/headers':headers,'./database':{db}});
const workAuth=load('app/lib/work-auth.ts',{'server-only':{},'next/headers':headers,'./database':{db},'./hr-auth':hrAuth,'./portal-auth':portalAuth,'./portal-http':http});
const identity=load('app/lib/identity-service.ts',{'server-only':{},'./database':{db},'./work-auth':workAuth,'./portal-http':http});
const service=load('app/lib/registration-invitations.ts',{'server-only':{},'./database':{db},'./portal-http':http,'./identity-service':identity});
const scope=load('app/lib/hr-scope.ts',{'server-only':{},'./database':{db},'./portal-http':http});
const employeeService=load('app/lib/employee-service.ts',{'server-only':{},'./database':{db},'./hr-scope':scope,'./portal-http':http});
const route=load('app/api/work/registration/route.ts',{'@/app/lib/hr-auth':hrAuth,'@/app/lib/registration-invitations':service,'@/app/lib/portal-auth':portalAuth,'@/app/lib/portal-http':http});
let checks=0;
function check(value,label){assert(value,label);checks++;console.log('PASS',label);}
async function api(body,session={},expected=200,requestOrigin=origin){return storage.run(session,async()=>{const request=new Request(origin+'/api/work/registration',{method:body===undefined?'GET':'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const response=await route[body===undefined?'GET':'POST'](request),data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;});}
const reason='Verified intended employee identity',password='Private-test-password-123!';
async function hr(role,active=true){const id=randomUUID(),token=randomBytes(32).toString('hex');await pool.query('INSERT INTO "HRUser"(id,email,"passwordHash",role,"isActive") VALUES($1,$2,$3,$4,$5)',[id,id+'@example.invalid','unused-isolated-test-hash',role,active]);await pool.query('INSERT INTO "HRSession"("tokenHash","hrUserId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[digest(token),id]);return {id,role,cookie:{allen_hr_session:token}};}
async function issue(id,session,action='invite',invitationId){return api({action,employeeId:id,reason,invitationId},session);}
async function registration(id,token,status=400,extra={}){return api({action:'register',employeeId:id,token,password,confirmPassword:password,...extra},{},status);}
(async()=>{try{
process.env.EMPLOYEE_INVITATION_HOURS='168'; // Must not override the fixed 24-hour policy.
const before=(await pool.query('SELECT id,"employeeCode","permanentId" FROM "Employee" ORDER BY id')).rows;
const admin=await hr('HR_ADMIN'),officer=await hr('HR_OFFICER'),viewer=await hr('HR_VIEWER'),disabled=await hr('HR_ADMIN',false);
const department=(await pool.query('SELECT name FROM "HRDepartment" LIMIT 1')).rows[0].name,designation=(await pool.query('SELECT name FROM "HRDesignation" LIMIT 1')).rows[0].name;
async function employee(){const key=randomUUID();return (await employeeService.createEmployee({requestId:key,fullName:'Isolated invitation verification',email:key+'@example.invalid',department,designation,joinedOn:'2026-10-26'},admin,db)).employee;}
const first=await employee(),second=await employee(),third=await employee();
check(/^AA-EMP-\d{12}$/.test(first.permanentId)&&new Set([first.permanentId,second.permanentId,third.permanentId]).size===3,'Existing employee generator assigns unique 12-digit IDs');
for(const [session,status]of [[{},401],[officer.cookie,403],[viewer.cookie,403],[disabled.cookie,401],[{allen_work_session:randomBytes(32).toString('hex')},401],[{allen_doctor_session:randomBytes(32).toString('hex')},401]]){
await api(undefined,session,status);for(const action of ['invite','revoke','resend'])await api({action,employeeId:first.permanentId,reason},session,status);}
check(true,'Only active HR administrator sessions can list, issue, revoke or resend');
await api({action:'invite',employeeId:first.permanentId,reason},admin.cookie,403,'https://other.invalid');
await api({action:'invite',employeeId:first.permanentId,reason,token:'shared-code'},admin.cookie,400);
await api({action:'invite',employeeId:'AA-EMP-999999999999',reason},admin.cookie,404);
check(true,'Cross-origin, supplied-code and nonexistent-employee requests are rejected');
const issued=await issue(first.permanentId,admin.cookie);
check(/^[a-f0-9]{64}$/.test(issued.token),'Invitation uses 32 cryptographically random bytes');
const stored=(await pool.query('SELECT "registrationTokenHash" FROM "WorkAccount" WHERE "employeeId"=$1',[first.id])).rows[0].registrationTokenHash;
check(stored===digest(issued.token)&&stored!==issued.token,'Only the SHA-256 invitation hash is stored');
const duration=(await pool.query('SELECT extract(epoch FROM ("expiresAt"-"issuedAt"))::int seconds FROM "EmployeeInvitation" WHERE id=$1',[issued.invitationId])).rows[0].seconds;
check(duration===86400,'Expiry is exactly 24 hours even with the former 168-hour override');
const status=await api(undefined,admin.cookie);
check(status.invitations.some(i=>i.id===issued.invitationId&&i.state==='PENDING')&&!JSON.stringify(status).includes(issued.token)&&!JSON.stringify(status).includes(stored),'Status listing reports pending without disclosing code or hash');
const hidden=await identity.identityData({id:officer.id,role:'HR_OFFICER',employeeId:null,mustChangePassword:false});
check(hidden.invitations.length===0&&hidden.events.length===0,'Legacy identity endpoint does not expose invitation status to HR officers');
await assert.rejects(identity.identitySave({id:officer.id,role:'HR_OFFICER',employeeId:null,mustChangePassword:false},{invitationId:issued.invitationId,action:'handover'}),{status:403});
await registration(second.permanentId,issued.token);await registration(first.permanentId,'0'.repeat(64));
await registration(first.permanentId,issued.token,400,{confirmPassword:'wrong-password'});
check(true,'Wrong employee, incorrect code and mismatched passwords cannot activate accounts');
denyThrottle=true;await registration(first.permanentId,issued.token,429);denyThrottle=false;
check(true,'Registration respects server-side attempt limits');
const resent=await issue(first.permanentId,admin.cookie,'resend',issued.invitationId);
check(resent.token!==issued.token,'Resend generates a fresh unique code');
await registration(first.permanentId,issued.token);
await api({action:'revoke',employeeId:first.permanentId,invitationId:issued.invitationId,reason},admin.cookie,409);
check(true,'Resend invalidates old codes and stale admin actions cannot revoke replacements');
await api({action:'revoke',employeeId:first.permanentId,invitationId:resent.invitationId,reason},admin.cookie);
await registration(first.permanentId,resent.token);
check((await api(undefined,admin.cookie)).invitations.find(i=>i.id===resent.invitationId).state==='REVOKED','Revoked code is unusable and status is reported');
const expired=await issue(first.permanentId,admin.cookie,'resend',resent.invitationId);
await pool.query('UPDATE "EmployeeInvitation" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[expired.invitationId]);
await pool.query('UPDATE "WorkAccount" SET "registrationExpiresAt"=(SELECT "expiresAt" FROM "EmployeeInvitation" WHERE id=$2) WHERE "employeeId"=$1',[first.id,expired.invitationId]);
await registration(first.permanentId,expired.token);
check((await api(undefined,admin.cookie)).invitations.find(i=>i.id===expired.invitationId).state==='EXPIRED','Expired code is unusable and status is reported');
const final=await issue(first.permanentId,admin.cookie,'resend',expired.invitationId);
const results=await Promise.allSettled([service.activateEmployee({action:'register',employeeId:first.permanentId,token:final.token,password,confirmPassword:password},db),service.activateEmployee({action:'register',employeeId:first.permanentId,token:final.token,password,confirmPassword:password},db)]);
check(results.filter(r=>r.status==='fulfilled').length===1&&results.filter(r=>r.status==='rejected'&&r.reason.status===400).length===1,'Concurrent redemption succeeds exactly once');
const activated=(await pool.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=$1',[first.id])).rows[0];
check(activated.isActive&&activated.passwordHash.startsWith('$2')&&activated.registrationTokenHash===null&&activated.registrationExpiresAt===null&&!activated.mustChangePassword&&activated.clinicalRole===null&&activated.role==='EMPLOYEE','Activation hashes password, clears code and retains employee/clinical permissions');
const workToken=randomBytes(32).toString('hex');await pool.query('INSERT INTO "WorkSession"("tokenHash","accountId","expiresAt") VALUES($1,$2,now()+interval \'1 hour\')',[digest(workToken),activated.id]);
await api(undefined,{allen_work_session:workToken},401);await api({action:'invite',employeeId:second.permanentId,reason},{allen_work_session:workToken},401);
check(true,'A valid activated employee session cannot manage invitations');
await registration(first.permanentId,final.token);await api({action:'resend',employeeId:first.permanentId,reason},admin.cookie,409);
check((await api(undefined,admin.cookie)).invitations.find(i=>i.id===final.invitationId).state==='USED','Used codes cannot be reused or reset an activated account');
const emailInvite=await issue(second.permanentId,admin.cookie);await pool.query('UPDATE "Employee" SET email=$2 WHERE id=$1',[second.id,randomUUID()+'@example.invalid']);await registration(second.permanentId,emailInvite.token);
check(true,'Changing the intended email prevents activation with the earlier invitation');
const offboarded=await issue(third.permanentId,admin.cookie);await pool.query('UPDATE "Employee" SET status=\'INACTIVE\' WHERE id=$1',[third.id]);await registration(third.permanentId,offboarded.token);
check((await pool.query('SELECT "registrationTokenHash" FROM "WorkAccount" WHERE "employeeId"=$1',[third.id])).rows[0].registrationTokenHash===null,'Employment deactivation immediately clears pending codes');
const audit=(await pool.query('SELECT action,detail FROM "WorkAudit" WHERE "recordId"=$1',[activated.id])).rows;
check(['registration.invite','registration.resend','registration.revoke','registration.completed'].every(action=>audit.some(a=>a.action===action)),'Issuance, resend, revoke and activation have audit records');
const events=(await pool.query('SELECT * FROM "EmployeeIdentityEvent" WHERE "invitationId"=ANY($1::uuid[])',[[issued.invitationId,resent.invitationId,expired.invitationId,final.invitationId]])).rows;
check(![issued.token,resent.token,expired.token,final.token,password,stored].some(secret=>JSON.stringify({audit,events}).includes(secret)),'Audit records contain no invitation codes, token hashes or passwords');
await assert.rejects(pool.query('UPDATE "EmployeeIdentityEvent" SET action=\'tampered\' WHERE id=$1',[events[0].id]));
check(true,'Invitation audit history is immutable');
const fourth=await employee(),atomic=await issue(fourth.permanentId,admin.cookie);
const payload={action:'register',employeeId:fourth.permanentId,token:atomic.token,password,confirmPassword:password};
const auditFailure={transaction:fn=>db.transaction(tx=>fn({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO "WorkAudit"')&&args[1]==='registration.completed')throw Error('Simulated audit failure');return tx.query(sql,args)}}))};
await assert.rejects(service.activateEmployee(payload,auditFailure),/Simulated audit failure/);
check(!(await pool.query('SELECT "isActive" FROM "WorkAccount" WHERE "employeeId"=$1',[fourth.id])).rows[0].isActive&&!(await pool.query('SELECT "activatedAt" FROM "EmployeeInvitation" WHERE id=$1',[atomic.invitationId])).rows[0].activatedAt,'Audit failure rolls back activation and invitation consumption');
const expiryRace={transaction:fn=>db.transaction(tx=>fn({query:async(sql,args)=>{const rows=await tx.query(sql,args);if(sql.startsWith('SELECT id FROM "EmployeeInvitation"')&&rows.length)await tx.query('UPDATE "EmployeeInvitation" SET "expiresAt"=clock_timestamp()-interval \'1 second\' WHERE id=$1',[rows[0].id]);return rows}}))};
await assert.rejects(service.activateEmployee(payload,expiryRace),{status:400});
check(!(await pool.query('SELECT "isActive" FROM "WorkAccount" WHERE "employeeId"=$1',[fourth.id])).rows[0].isActive,'Expiration between initial validation and activation is rejected');
await registration(fourth.permanentId,atomic.token,201);
check(true,'A rolled-back attempt does not consume the valid code');
for(let n=0;n<52;n++)await issue(second.permanentId,admin.cookie);
const pageOne=await service.invitationData(admin,1,db),pageTwo=await service.invitationData(admin,2,db);
check(pageOne.invitations.length===50&&pageTwo.invitations.length>0&&pageTwo.page===2&&new Set([...pageOne.invitations,...pageTwo.invitations].map(i=>i.id)).size===pageOne.invitations.length+pageTwo.invitations.length,'Invitation status pagination includes history beyond the first 50 records');
check(JSON.stringify(before)===JSON.stringify((await pool.query('SELECT id,"employeeCode","permanentId" FROM "Employee" WHERE id=ANY($1::text[]) ORDER BY id',[before.map(e=>e.id)])).rows),'Pre-existing employee IDs and codes remain unchanged');
console.log('PASSED '+checks+' invitation workflow checks in the isolated database.');
}finally{await pool.end()}})().catch(error=>{console.error(error.stack);process.exitCode=1});
