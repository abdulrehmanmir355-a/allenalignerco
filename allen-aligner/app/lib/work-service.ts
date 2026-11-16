import 'server-only';
import {closeInvitations} from './identity-service';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { db, type Database } from './database';
import { admin,scopeSQL,workReadScopeSQL,scopeArgs,workEmployee,type WorkActor } from './work-auth';
import { PortalError } from './portal-http';
type Row=Record<string,any>;
const id=z.string().min(1).max(100),text=(n=4000)=>z.string().trim().max(n),day=z.iso.date();
function hasPgCode(error:unknown,code:string){return typeof error==='object'&&error!==null&&'code'in error&&(error as {code?:unknown}).code===code;}
const report=z.object({id:z.uuid().optional(),reportingDate:day,taskId:z.uuid().nullable(),workDescription:text().min(1),workCompleted:text(),pendingWork:text(),timeSpent:z.number().int().min(1).max(1440),remarks:text(2000),workStartTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),taskStatus:z.enum(['NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED']).default('IN_PROGRESS'),blockers:text(2000).default('')});
async function audit(tx:Database,a:WorkActor,action:string,recordId:string|null,detail:unknown={}){await tx.query('INSERT INTO "WorkAudit"("actorId",action,"recordId",detail) VALUES($1,$2,$3,$4)',[a.id,action,recordId,JSON.stringify(detail)]);}
export async function workData(a:WorkActor){
 const employees=await db.query(`SELECT e.id,e."permanentId",e."employeeCode",e."fullName",e.department,e.designation,e."joinedOn",e.status,CASE WHEN e.id=$2 THEN e.email ELSE NULL END AS email,CASE WHEN e.id=$2 THEN e.phone ELSE NULL END AS phone,wa."managerId",wa."workingDays",wa."effectiveFrom",ac.id AS "accountId",ac.role AS "accountRole",ac."isActive" AS "accountActive" FROM "Employee" e LEFT JOIN "WorkAssignment" wa ON wa."employeeId"=e.id LEFT JOIN "WorkAccount" ac ON ac."employeeId"=e.id WHERE ${workReadScopeSQL} ORDER BY e."permanentId"`,[a.role,a.employeeId]);
 const ids=employees.map(e=>e.id);
 const actionEmployees=await db.query(`SELECT e.id FROM "Employee" e WHERE ${scopeSQL}`,scopeArgs(a));
 const taskEmployees=['HR_ADMIN','HR_OFFICER'].includes(a.role)
  ? await db.query(`SELECT id FROM "Employee" WHERE status='ACTIVE' ORDER BY "permanentId"`)
  : actionEmployees;
 const reports=await db.query('SELECT r.*,e."permanentId",e."fullName" FROM "WorkReport" r JOIN "Employee" e ON e.id=r."employeeId" WHERE r."employeeId"=ANY($1::text[]) ORDER BY r."reportingDate" DESC,revision DESC',[ids]);
 const tasks=await db.query('SELECT * FROM "WorkTask" WHERE "employeeId"=ANY($1::text[]) ORDER BY "createdAt" DESC',[ids]);
 const evaluations=await db.query('SELECT * FROM "WorkEvaluation" WHERE "employeeId"=ANY($1::text[]) ORDER BY "periodEnd" DESC',[ids]);
 const notifications=await db.query(`SELECT * FROM "WorkNotification" WHERE "recipientId"=$1 AND ($2::text IS NULL OR "employeeId"=$2) ORDER BY "createdAt" DESC LIMIT 200`,[a.id,a.employeeId]);
 const clinicalCaseAssignments=a.employeeId?await db.query(`SELECT c.id AS "caseId",c."patientReference",c.status AS "caseStatus",
   c."createdAt" AS "caseCreatedAt",d."fullName" AS "doctorName",cl.name AS "clinicName",
   ca."assignedAt",ca.reason,ca.revision,
   (SELECT m.text FROM "CaseMessage" m WHERE m."caseId"=c.id AND m."senderRole"='DOCTOR'
     ORDER BY m."createdAt" DESC,m.id DESC LIMIT 1) AS "latestDoctorMessage",
   (SELECT count(*)::int FROM "CaseMessage" m WHERE m."caseId"=c.id) AS "messageCount"
   FROM "ClinicalCaseAssignment" ca
   JOIN "WorkAccount" assigned ON assigned.id=ca."assignedTo"
   JOIN "ClinicalIdentity" identity ON identity."accountId"=assigned.id
   JOIN "PortalCase" c ON c.id=ca."caseId"
   JOIN "Doctor" d ON d.id=c."doctorId"
   JOIN "Clinic" cl ON cl.id=c."clinicId"
   WHERE ca."assignedTo"=$1::uuid AND assigned."employeeId"=$2
     AND assigned."isActive" AND NOT assigned."mustChangePassword"
     AND assigned."clinicalRole" IN ('REVIEWER','LEAD') AND identity.status='ACTIVE'
     AND c.status<>'DRAFT'
   ORDER BY ca."assignedAt" DESC,ca."caseId"`,[a.id,a.employeeId]):[];
 const policies=await db.query('SELECT * FROM "WorkPolicy"');
 const holidays=await db.query('SELECT * FROM "WorkHoliday" ORDER BY day');
 const kpis=await db.query('SELECT * FROM "WorkKPI" ORDER BY designation,name');
 let missing:Row[]=[];let missingAvailable=true;
 try{missing=await db.query(`SELECT * FROM aa_missing_work() WHERE "employeeId"=ANY($1::text[]) ORDER BY day DESC`,[ids]);}
 catch(error){if(!hasPgCode(error,'42883'))throw error;missingAvailable=false;}
 const auditTrail=await db.query(`SELECT a.* FROM "WorkAudit" a JOIN "WorkReport" r ON r.id=a."recordId" WHERE r."employeeId"=ANY($1::text[]) ORDER BY a.id`,[ids]);
 const users=a.role==='HR_ADMIN'?await db.query('SELECT id,email,role FROM "HRUser" WHERE "isActive"'):[];
 const attendance=await db.query('SELECT * FROM "HRAttendance" WHERE "employeeId"=ANY($1::text[]) ORDER BY day DESC',[ids]);
 const leave=await db.query('SELECT * FROM "HRLeave" WHERE "employeeId"=ANY($1::text[]) ORDER BY "startDate" DESC',[ids]);
 let assets:Row[]=[];let assetsAvailable=true;
 try{assets=await db.query('SELECT "employeeId","assetCode","assetName","serialNumber",status,"issuedAt","returnedAt" FROM "HRAssetIssue" WHERE "employeeId"=ANY($1::text[]) ORDER BY "issuedAt" DESC',[ids]);}
 catch(error){if(!hasPgCode(error,'42P01'))throw error;assetsAvailable=false;}
 return {attendance,leave,assets,actor:a,employees,actionEmployeeIds:actionEmployees.map(e=>e.id),taskEmployeeIds:taskEmployees.map(e=>e.id),reports,tasks,evaluations,notifications,clinicalCaseAssignments,policy:policies[0],holidays,kpis,missing,auditTrail,users,availability:{missingWork:missingAvailable,assets:assetsAvailable}};
}
export async function workSave(a:WorkActor,body:unknown){
 if(a.mustChangePassword)throw new PortalError(403,'Change your temporary password first.');
 const input=z.object({action:z.string(),data:z.unknown()}).parse(body),v=input.data;
 if(input.action==='draft'){
  if(!a.employeeId)throw new PortalError(403,'Employee account required.');
  const b=report.parse(v);const employee=await workEmployee(a,a.employeeId);
  return db.transaction(async tx=>{
   const [date]=await tx.query(`SELECT (now() AT TIME ZONE timezone)::date::text today FROM "WorkPolicy"`);
   if(b.reportingDate>String(date.today))throw new PortalError(400,'Future reports are not allowed.');
   if(b.taskId&&!(await tx.query('SELECT id FROM "WorkTask" WHERE id=$1 AND "employeeId"=$2',[b.taskId,a.employeeId])).length)throw new PortalError(400,'Choose your assigned task.');
   const values=[b.workDescription,b.workCompleted,b.pendingWork,b.timeSpent,b.remarks,b.taskId];
   let row;
   if(b.id){[row]=await tx.query(`UPDATE "WorkReport" SET "workDescription"=$3,"workCompleted"=$4,"pendingWork"=$5,"timeSpent"=$6,remarks=$7,"taskId"=$8 WHERE id=$1 AND "employeeId"=$2 AND status='DRAFT' AND "reportingDate"=$9 RETURNING id`,[b.id,a.employeeId,...values,b.reportingDate]);}
   else {[row]=await tx.query(`INSERT INTO "WorkReport"("employeeId","reportingDate",department,"workDescription","workCompleted","pendingWork","timeSpent",remarks,"taskId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[a.employeeId,b.reportingDate,employee.department,...values]);}
   if(!row)throw new PortalError(409,'Only your draft can be edited.');await tx.query('UPDATE "WorkReport" SET "workStartTime"=$2,"taskStatus"=$3,blockers=$4 WHERE id=$1',[row.id,b.workStartTime,b.taskStatus,b.blockers]);await audit(tx,a,'draft.saved',String(row.id));return row;
  });
 }
 if(['submit','review','approve','requestRevision','revise'].includes(input.action)){
  const b=z.object({id:z.uuid(),reason:text(2000).default('')}).parse(v);
  return db.transaction(async tx=>{
   const [r]=await tx.query('SELECT * FROM "WorkReport" WHERE id=$1 FOR UPDATE',[b.id]);if(!r)throw new PortalError(404,'Report not found.');
   await workEmployee(a,String(r.employeeId),['review','approve','requestRevision'].includes(input.action));
   if(['submit','revise'].includes(input.action)&&r.employeeId!==a.employeeId)throw new PortalError(403,'Only the employee can submit or revise.');
   if(input.action==='revise'){
    if(!['REVISION_REQUESTED','APPROVED'].includes(String(r.status))||!b.reason.trim())throw new PortalError(409,'Revision requires an approved or returned report and a reason.');
    const [revision]=await tx.query(`INSERT INTO "WorkReport"("employeeId","reportingDate",department,"taskId","workDescription","workCompleted","pendingWork","timeSpent",remarks,revision,"previousId") SELECT "employeeId","reportingDate",department,"taskId","workDescription","workCompleted","pendingWork","timeSpent",remarks,revision+1,id FROM "WorkReport" WHERE id=$1 RETURNING id`,[r.id]);
    await tx.query('UPDATE "WorkReport" SET "workStartTime"=$2,"taskStatus"=$3,blockers=$4 WHERE id=$1',[revision.id,r.workStartTime,r.taskStatus,r.blockers]);
    await audit(tx,a,'revision.created',String(revision.id),{previousId:r.id,reason:b.reason});return revision;
   }
   const transition:Record<string,[string,string]>={submit:['DRAFT','SUBMITTED'],review:['SUBMITTED','REVIEWED'],approve:['REVIEWED','APPROVED']};
   if(input.action==='requestRevision'){
    if(!['SUBMITTED','REVIEWED'].includes(String(r.status))||!b.reason.trim())throw new PortalError(409,'Provide a correction reason for a submitted or reviewed report.');
   }else if(r.status!==transition[input.action][0])throw new PortalError(409,'Report status has changed.');
   const target=input.action==='requestRevision'?'REVISION_REQUESTED':transition[input.action][1];
   await tx.query(`UPDATE "WorkReport" SET status=$2 ${input.action==='submit'?',"submittedAt"=now()':''} WHERE id=$1`,[r.id,target]);
   await audit(tx,a,target,String(r.id),{reason:b.reason});
   const [account]=await tx.query('SELECT id FROM "WorkAccount" WHERE "employeeId"=$1',[r.employeeId]);
   if(account)await tx.query(`INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[account.id,r.employeeId,r.reportingDate,target+':'+r.id,'Report '+target.toLowerCase().replaceAll('_',' ')+(b.reason?': '+b.reason:'')]);
   if(input.action==='submit')await tx.query(`
    INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
    SELECT recipients."recipientId",$1,$2,'REPORT_SUBMITTED:'||$3,'Daily work report submitted by '||$4||' ('||$5||') is ready for review.'
    FROM (
      SELECT wa."managerId"::text AS "recipientId" FROM "WorkAssignment" wa JOIN "WorkAccount" manager ON manager.id=wa."managerId" AND manager."isActive" WHERE wa."employeeId"=$1 AND wa."managerId" IS NOT NULL
      UNION SELECT id::text FROM "HRUser" WHERE role IN ('HR_ADMIN','HR_OFFICER') AND "isActive"
    ) recipients WHERE true ON CONFLICT DO NOTHING`,[r.employeeId,r.reportingDate,r.id,r.fullName,r.permanentId]);
   return {id:r.id};
  });
 }
 if(input.action==='task'){
  const b=z.object({employeeId:id,title:text(200).min(1),description:text(),dueDate:day.nullable()}).parse(v);
  if(['HR_ADMIN','HR_OFFICER'].includes(a.role)){
   if(!(await db.query(`SELECT id FROM "Employee" WHERE id=$1 AND status='ACTIVE'`,[b.employeeId])).length)throw new PortalError(404,'Active employee not found.');
  }else await workEmployee(a,b.employeeId);
  return db.transaction(async tx=>{const [r]=await tx.query('INSERT INTO "WorkTask"("employeeId",title,description,"dueDate","assignedBy") VALUES($1,$2,$3,$4,$5) RETURNING id',[b.employeeId,b.title,b.description,b.dueDate,a.id]);await audit(tx,a,'task.assigned',String(r.id),b);await tx.query(`INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message) SELECT COALESCE((SELECT id::text FROM "WorkAccount" WHERE "employeeId"=$1),$1),$1,(now() AT TIME ZONE policy.timezone)::date,'TASK_ASSIGNED:'||$2,'New task assigned: '||$3||CASE WHEN $4::date IS NULL THEN '' ELSE ' (due '||$4::text||')' END FROM "WorkPolicy" policy ON CONFLICT DO NOTHING`,[b.employeeId,r.id,b.title,b.dueDate]);return r;});
 }
 if(input.action==='evaluate'){
  const b=z.object({employeeId:id,periodStart:day,periodEnd:day,commentary:text().min(1),scores:z.array(z.object({kpiId:z.uuid(),score:z.number().min(0).max(100),evidence:text().min(1)})).min(1).max(50)}).parse(v);
  const employee=await workEmployee(a,b.employeeId,true);if(b.periodEnd<b.periodStart)throw new PortalError(400,'Invalid evaluation period.');
  const kpis=await db.query('SELECT * FROM "WorkKPI" WHERE designation=$1 AND "isActive"',[employee.designation]);
  if(new Set(b.scores.map(s=>s.kpiId)).size!==b.scores.length)throw new PortalError(400,'Duplicate KPI.');
  const scores=b.scores.map(s=>{const k=kpis.find(k=>k.id===s.kpiId);if(!k)throw new PortalError(400,'KPI does not match this employee role.');return {...s,name:k.name,weight:k.weight,description:k.description};});
  return db.transaction(async tx=>{const [r]=await tx.query('INSERT INTO "WorkEvaluation"("employeeId","periodStart","periodEnd",scores,commentary,"evaluatedBy") VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[b.employeeId,b.periodStart,b.periodEnd,JSON.stringify(scores),b.commentary,a.id]);await audit(tx,a,'evaluation.created',String(r.id));return r;});
 }
 admin(a);
 return db.transaction(async tx=>{
  if(input.action==='account'){
   const b=z.object({employeeId:id,role:z.enum(['EMPLOYEE','MANAGER','PRODUCTION_OPERATOR']),isActive:z.boolean(),password:z.string().min(12).max(72).optional()}).parse(v);
   await workEmployee(a,b.employeeId);
   const [old]=await tx.query('SELECT * FROM "WorkAccount" WHERE "employeeId"=$1 FOR UPDATE',[b.employeeId]);
   if(!old)throw new PortalError(404,'Employee account missing.');
   if(b.isActive&&!old.passwordHash&&!b.password)throw new PortalError(400,'Set an initial password.');
   if(b.role!=='MANAGER'&&(await tx.query('SELECT 1 FROM "WorkAssignment" WHERE "managerId"=$1',[old.id])).length)throw new PortalError(409,'Reassign this manager’s team first.');
   const [employment]=await tx.query('SELECT status FROM "Employee" WHERE id=$1 FOR UPDATE',[b.employeeId]);
   if(b.isActive&&employment.status!=='ACTIVE')throw new PortalError(409,'Only active employees can receive access.');
   await closeInvitations(tx,b.employeeId,a.id,'Account settings changed');
   await tx.query('UPDATE "WorkAccount" SET "registrationTokenHash"=NULL,"registrationExpiresAt"=NULL,role=$2,"isActive"=$3,"passwordHash"=COALESCE($4,"passwordHash"),"mustChangePassword"=CASE WHEN $4 IS NOT NULL THEN true ELSE "mustChangePassword" END WHERE id=$1',[old.id,b.role,b.isActive,b.password?await hash(b.password,12):null]);
   await tx.query('DELETE FROM "WorkSession" WHERE "accountId"=$1',[old.id]);await audit(tx,a,'account.configured',String(old.id),{employeeId:b.employeeId,role:b.role,isActive:b.isActive});
  }else if(input.action==='assignment'){
   const b=z.object({employeeId:id,managerId:z.uuid().nullable(),workingDays:z.array(z.number().int().min(0).max(6)).max(7),effectiveFrom:day}).parse(v);
   await workEmployee(a,b.employeeId);
   if(b.managerId&&!(await tx.query(`SELECT id FROM "WorkAccount" WHERE id=$1 AND role='MANAGER' AND "isActive" AND "employeeId"<>$2`,[b.managerId,b.employeeId])).length)throw new PortalError(400,'Choose an active manager other than the employee.');
   await tx.query('INSERT INTO "WorkAssignment"("employeeId","managerId","workingDays","effectiveFrom") VALUES($1,$2,$3,$4) ON CONFLICT("employeeId") DO UPDATE SET "managerId"=$2,"workingDays"=$3,"effectiveFrom"=$4',[b.employeeId,b.managerId,b.workingDays,b.effectiveFrom]);await tx.query('INSERT INTO "WorkSchedule"("employeeId","effectiveFrom","workingDays") VALUES($1,$2,$3) ON CONFLICT("employeeId","effectiveFrom") DO UPDATE SET "workingDays"=$3',[b.employeeId,b.effectiveFrom,b.workingDays]);await audit(tx,a,'assignment.configured',null,b);
  }else if(input.action==='grant'){
   const b=z.object({userId:z.uuid(),employeeId:id,canEvaluate:z.boolean(),enabled:z.boolean()}).parse(v);
   if(!(await tx.query(`SELECT id FROM "HRUser" WHERE id=$1 AND role='HR_OFFICER'`,[b.userId])).length)throw new PortalError(400,'Choose an HR officer.');
   if(b.enabled)await tx.query('INSERT INTO "WorkHRGrant"("userId","employeeId","canEvaluate") VALUES($1,$2,$3) ON CONFLICT("userId","employeeId") DO UPDATE SET "canEvaluate"=$3',[b.userId,b.employeeId,b.canEvaluate]);else await tx.query('DELETE FROM "WorkHRGrant" WHERE "userId"=$1 AND "employeeId"=$2',[b.userId,b.employeeId]);await audit(tx,a,'permission.configured',null,b);
  }else if(input.action==='policy'){
   const b=z.object({timezone:text(100).min(1),dueHour:z.number().int().min(0).max(23),escalationHours:z.number().int().min(1).max(720),startDate:day,retentionPolicy:text().min(1)}).parse(v);
   if(!(await tx.query('SELECT 1 FROM pg_timezone_names WHERE name=$1',[b.timezone])).length)throw new PortalError(400,'Unknown timezone.');
   await tx.query('UPDATE "WorkPolicy" SET timezone=$1,"dueHour"=$2,"escalationHours"=$3,"startDate"=$4,"retentionPolicy"=$5',[b.timezone,b.dueHour,b.escalationHours,b.startDate,b.retentionPolicy]);await audit(tx,a,'policy.configured',null,b);
  }else if(input.action==='holiday'){
   const b=z.object({day,name:text(200).min(1),remove:z.boolean().default(false)}).parse(v);if(b.remove)await tx.query('DELETE FROM "WorkHoliday" WHERE day=$1',[b.day]);else await tx.query('INSERT INTO "WorkHoliday"(day,name) VALUES($1,$2) ON CONFLICT(day) DO UPDATE SET name=$2',[b.day,b.name]);await audit(tx,a,'holiday.configured',null,b);
  }else if(input.action==='kpi'){
   const b=z.object({designation:text(120).min(1),name:text(200).min(1),description:text(2000).min(1),weight:z.number().positive().max(100)}).parse(v);const [k]=await tx.query('INSERT INTO "WorkKPI"(designation,name,description,weight) VALUES($1,$2,$3,$4) RETURNING id',[b.designation,b.name,b.description,b.weight]);await audit(tx,a,'kpi.configured',String(k.id),b);
  }else if(input.action==='reminders'){await tx.query('SELECT aa_send_work_reminders()');await audit(tx,a,'reminders.run',null);}
  else throw new PortalError(400,'Unknown action.');
  return {success:true};
 });
}
