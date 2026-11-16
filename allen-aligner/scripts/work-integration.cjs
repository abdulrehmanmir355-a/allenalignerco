// Run against the isolated work test database and an application server using that same database.
const {Client}=require('pg'),{hash}=require('bcryptjs'),{randomUUID}=require('crypto'),assert=require('assert/strict');
const u=new URL(process.env.DATABASE_URL||''),base=process.env.WORK_TEST_ORIGIN||'http://localhost:3119';
if(u.pathname!='/allen_aligner_work_test'||!['localhost','127.0.0.1'].includes(u.hostname)||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Isolated test database and local server required');
const db=new Client({connectionString:u.toString()}),password=randomUUID()+'Aa1',ids=Array.from({length:6},()=>randomUUID()),[employee,other,manager,outsider,admin,officer]=ids;
let checks=0;function ok(value,label){assert(value,label);checks++;console.log('PASS',label)}
async function api(path,cookie='',body,method=body?'POST':'GET',status=200){const r=await fetch(base+path,{method,headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const b=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(b));checks++;return {r,b};}
async function action(cookie,action,data,status=200){return (await api('/api/work',cookie,{action,data},'POST',status)).b;}
async function denied(sql,args,label){try{await db.query(sql,args);assert.fail(label);}catch(e){if(e.code)ok(true,label);else throw e}}
(async()=>{await db.connect();try{
 const h=await hash(password,12);
 for(const e of [employee,other,manager,outsider])await db.query('INSERT INTO "Employee"(id,"employeeCode","fullName",department,designation,"joinedOn") VALUES($1,$2,$3,$4,$5,$6)',[e,'QA-'+e,'Synthetic '+e,'QA','Tester','2026-01-01']);
 const codes=(await db.query('SELECT id,"permanentId" FROM "Employee" WHERE id=ANY($1::text[])',[ids])).rows;
 ok(codes.length===4&&new Set(codes.map(e=>e.permanentId)).size===4&&codes.every(e=>/^AA-EMP-\d{6,}$/.test(e.permanentId)),'sequential unique employee IDs');
 const before=codes.map(c=>c.permanentId);await db.query('UPDATE "Employee" SET "fullName"="fullName" WHERE id=ANY($1::text[])',[ids]);ok(JSON.stringify(before)===JSON.stringify((await db.query('SELECT "permanentId" FROM "Employee" WHERE id=ANY($1::text[])',[ids])).rows.map(c=>c.permanentId)),'IDs survive profile edits');
 await denied('UPDATE "Employee" SET "permanentId"=$2 WHERE id=$1',[employee,'AA-EMP-999999'],'permanent ID mutation rejected');
 await db.query('UPDATE "WorkAccount" SET "passwordHash"=$1,"isActive"=true,"mustChangePassword"=false WHERE "employeeId"=ANY($2::text[])',[h,ids]);
 await db.query(`UPDATE "WorkAccount" SET role='MANAGER' WHERE "employeeId"=ANY($1::text[])`,[[manager,outsider]]);
 const accounts=(await db.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=ANY($1::text[])',[ids])).rows;const acct=id=>accounts.find(a=>a.employeeId===id).id;
 await db.query('INSERT INTO "WorkAssignment"("employeeId","managerId","effectiveFrom") VALUES($1,$2,$3)',[employee,acct(manager),'2026-10-01']);
 for(const [id,role] of [[admin,'HR_ADMIN'],[officer,'HR_OFFICER']])await db.query('INSERT INTO "HRUser"(id,email,"passwordHash",role,"isActive") VALUES($1,$2,$3,$4,true)',[id,id+'@example.invalid',h,role]);
 async function login(e){return (await api('/api/work/auth','',{employeeId:codes.find(c=>c.id===e).permanentId,password})).r.headers.get('set-cookie').split(';')[0];}
 const ec=await login(employee),oc=await login(other),mc=await login(manager),xc=await login(outsider);
 const hc=(await api('/api/hr/login','',{email:admin+'@example.invalid',password})).r.headers.get('set-cookie').split(';')[0];
 const fc=(await api('/api/hr/login','',{email:officer+'@example.invalid',password})).r.headers.get('set-cookie').split(';')[0];
 await api('/api/work','',undefined,'GET',401);await api('/api/work/auth','',{employeeId:codes[0].permanentId,password:'wrong'},'POST',401);
 ok((await api('/api/work',ec)).b.employees.length===1,'employee sees only self');ok((await api('/api/work',fc)).b.employees.length===0,'HR officer denied without assigned grants');ok((await api('/api/hr/employees',fc)).b.employees.length===0,'legacy employee directory scoped');ok((await api('/api/hr/manage/employees',fc)).b.records.length===0,'legacy management scoped');
 ok((await api('/api/hr/employees',ec,undefined,'GET',401)).r.status===401,'employee session cannot enter legacy HR APIs');
 await action(fc,'grant',{userId:officer,employeeId:employee,enabled:true,canEvaluate:true},403);
 await action(hc,'grant',{userId:officer,employeeId:employee,enabled:true,canEvaluate:false});ok((await api('/api/work',fc)).b.employees.length===1,'officer grant scopes records');ok((await api('/api/hr/employees',fc)).b.employees.length===1,'legacy directory respects grant');await api('/api/hr/manage/employees',fc,{id:other,fullName:'Forbidden edit',email:'',department:'QA',designation:'Tester',joinedOn:''},'POST',404);
 await action(mc,'task',{employeeId:other,title:'Forbidden',description:'',dueDate:null},404);
 const task=await action(mc,'task',{employeeId:employee,title:'Review design quality',description:'Evidence required',dueDate:'2026-10-22'});
 const fields={reportingDate:'2026-10-19',taskId:task.id,workDescription:'Reviewed aligner design',workCompleted:'One review',pendingWork:'Follow-up',timeSpent:60,remarks:'No blockers'};
 await action(oc,'draft',fields,400);
 const draft=await action(ec,'draft',fields);await action(ec,'draft',fields,409);
 await action(oc,'draft',{...fields,id:draft.id,taskId:null},409);
 await action(ec,'draft',{...fields,id:draft.id,timeSpent:75});
 await action(ec,'submit',{id:draft.id});await action(ec,'draft',{...fields,id:draft.id},409);
 await action(ec,'approve',{id:draft.id},403);await action(xc,'review',{id:draft.id},404);await action(fc,'review',{id:draft.id},403);
 await action(mc,'approve',{id:draft.id},409);await action(mc,'requestRevision',{id:draft.id,reason:'Add quality evidence'});
 const revision=await action(ec,'revise',{id:draft.id,reason:'Added reviewer findings'});await action(ec,'revise',{id:draft.id,reason:'Duplicate'},409);
 await action(ec,'draft',{...fields,id:revision.id,remarks:'Evidence: design checklist passed'});await action(ec,'submit',{id:revision.id});await action(mc,'review',{id:revision.id});await action(mc,'approve',{id:revision.id});
 await denied('UPDATE "WorkReport" SET remarks=$2 WHERE id=$1',[revision.id,'tampering'],'approved report database immutability');
 await denied('DELETE FROM "WorkReport" WHERE id=$1',[revision.id],'approved history deletion denied');
 const correction=await action(ec,'revise',{id:revision.id,reason:'Additional audited correction'});ok(!!correction.id,'approved corrections create new draft');
 const history=(await api('/api/work',ec)).b;ok(history.reports.length===3&&history.auditTrail.length>=9,'historical revisions and audit remain visible');
 ok(history.notifications.some(n=>n.kind.startsWith('APPROVED')),'approval notification delivered');
 await action(hc,'kpi',{designation:'Tester',name:'Quality review',description:'Evidence of correct checks',weight:100});const kpi=(await api('/api/work',hc)).b.kpis.find(k=>k.name==='Quality review');
 await action(mc,'evaluate',{employeeId:employee,periodStart:'2026-10-01',periodEnd:'2026-10-31',commentary:'Evidence reviewed',scores:[{kpiId:kpi.id,score:85,evidence:'Checklist and rework outcomes'}]});
 ok((await api('/api/work',ec)).b.evaluations[0].scores[0].score===85,'quality score is evaluator-provided and historically stored');ok((await api('/api/work',oc)).b.evaluations.length===0,'other employee cannot read evaluation');
 await db.query('UPDATE "WorkPolicy" SET "startDate"=$1,"dueHour"=18,"escalationHours"=24',['2026-10-19']);
 await db.query('INSERT INTO "WorkHoliday"(day,name) VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET name=EXCLUDED.name',['2026-10-20','Synthetic holiday']);
 await db.query('INSERT INTO "HRLeave"("employeeId","startDate","endDate",reason,status) VALUES($1,$2,$2,$3,$4)',[employee,'2026-10-21','Synthetic approved leave','APPROVED']);
 const at='2026-10-26T20:00:00+05:00';const missing=(await db.query('SELECT day::text FROM aa_missing_work($1) WHERE "employeeId"=$2 ORDER BY day',[at,employee])).rows.map(r=>r.day);
 function date(d){return new Date(d).toISOString().slice(0,10)}
 ok(missing.join(',')==='2026-10-22,2026-10-23,2026-10-26','submitted work, holiday, leave and weekends excluded');
 await db.query('SELECT aa_send_work_reminders($1)',[at]);const count=(await db.query('SELECT COUNT(*)::int n FROM "WorkNotification"')).rows[0].n;await db.query('SELECT aa_send_work_reminders($1)',[at]);ok((await db.query('SELECT COUNT(*)::int n FROM "WorkNotification"')).rows[0].n===count,'reminder retry does not duplicate notifications');
 ok((await api('/api/work',mc)).b.notifications.some(n=>n.kind==='OVERDUE'),'overdue escalation reaches assigned manager');
 const deniedOrigin=await fetch(base+'/api/work',{method:'POST',headers:{Origin:'https://invalid.example',Cookie:ec,'Content-Type':'application/json'},body:JSON.stringify({action:'submit',data:{id:correction.id}})});ok(deniedOrigin.status===403,'cross-origin mutation rejected');
 await action(hc,'account',{employeeId:other,role:'EMPLOYEE',isActive:false});await api('/api/work',oc,undefined,'GET',401);await api('/api/work/auth','',{employeeId:codes.find(c=>c.id===other).permanentId,password},'POST',401);
 await api('/api/work/auth',ec,{currentPassword:password,newPassword:password+'new'},'PATCH');await api('/api/work',ec,undefined,'GET',401);
 for(const page of ['/employee/login','/employee','/hr/performance']){const r=await fetch(base+page,{headers:{Cookie:mc}});ok(r.status===200,'page renders '+page);}
 console.log('PASSED '+checks+' work reporting checks. Synthetic records remain only in isolated test database.');
 }finally{await db.end();}})().catch(e=>{console.error(e);process.exitCode=1});
