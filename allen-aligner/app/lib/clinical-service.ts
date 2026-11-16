import 'server-only';
import { recordCaseActivity } from './case-activity';
import { db } from './database';
import { clinicalCase, manageClinical, type ClinicalActor } from './clinical-auth';
import { approvalProblem, clinicalActionSchema } from './clinical-validation';
import { PortalError } from './portal-http';
export async function clinicalDashboard(a:ClinicalActor){
 const caseAssignments=await db.query(`SELECT c.id AS "caseId",c."patientReference",c.status AS "caseStatus",
  c."createdAt" AS "caseCreatedAt",d."fullName" AS "doctorName",cl.name AS "clinicName",
  ca."assignedAt",ca.reason,ca.revision,e."fullName" AS "assigneeName",w."clinicalRole" AS "assigneeRole",
  (SELECT m.text FROM "CaseMessage" m WHERE m."caseId"=c.id AND m.audience='CASE'
   ORDER BY m."createdAt" DESC,m.id DESC LIMIT 1) AS "latestSharedMessage",
  (SELECT count(*)::int FROM "CaseMessage" m WHERE m."caseId"=c.id AND m.audience='CASE') AS "messageCount"
  FROM "ClinicalCaseAssignment" ca JOIN "PortalCase" c ON c.id=ca."caseId"
  JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
  JOIN "WorkAccount" w ON w.id=ca."assignedTo" JOIN "ClinicalIdentity" e ON e."accountId"=w.id
  WHERE c.status<>'DRAFT' AND ($1<>'REVIEWER' OR ca."assignedTo"=$2::uuid)
  ORDER BY (ca."assignedTo"=$2::uuid) DESC,ca."assignedAt" DESC LIMIT 200`,[a.role,a.id]);
 const cases=await db.query(`SELECT c.id AS "caseId",c."patientReference",c.status AS "caseStatus",p.version,r.*,e."fullName" AS "reviewerName",
 extract(epoch FROM (coalesce(r."completedAt",now())-r."createdAt"))/3600 AS "turnaroundHours"
 FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" JOIN "PortalCase" c ON c.id=p."caseId"
 LEFT JOIN "WorkAccount" w ON w.id=r."assignedTo" LEFT JOIN "ClinicalIdentity" e ON e."accountId"=w.id
 WHERE ($1<>'REVIEWER' OR r."assignedTo"=$2::uuid) AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=c.id)
 ORDER BY CASE r.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,r."createdAt"`,[a.role,a.id]);
 const history=await db.query(`SELECT r.id,p."caseId",p.version,c."patientReference",r.status,r."completedAt",e."fullName" AS "reviewerName" FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" JOIN "PortalCase" c ON c.id=p."caseId" LEFT JOIN "WorkAccount" w ON w.id=r."decidedBy" LEFT JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE r."completedAt" IS NOT NULL AND ($1<>'REVIEWER' OR r."assignedTo"=$2::uuid) ORDER BY r."completedAt" DESC LIMIT 200`,[a.role,a.id]);
 const team=a.role==='REVIEWER'?[]:await db.query(`SELECT w.id,e."fullName",e."permanentId",w."clinicalRole",w."isActive",e.status AS "employeeStatus",(SELECT count(*)::int FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" WHERE r."assignedTo"=w.id AND r.status IN ('PENDING','IN_REVIEW','ESCALATED') AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=p."caseId")) AS workload FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w."clinicalRole" IS NOT NULL ORDER BY e."fullName"`);
 const registrations=a.role==='ADMIN'?await db.query(`SELECT w.id,e."fullName",e."permanentId",w."isActive" AS "accountActive",w."mustChangePassword",e.status AS "employeeStatus",w."clinicalRequest" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w."clinicalRequest"->>'status'='PENDING' ORDER BY w."clinicalRequest"->>'requestedAt'`):[];
 return {actor:a,cases,caseAssignments,history,team,registrations};
}
export async function clinicalWorkspace(a:ClinicalActor,id:string){
 const c=await clinicalCase(a,id);
 let plans=await db.query(`SELECT p.*,r.id AS "reviewId",r.status AS "reviewStatus",r."assignedTo",r.priority,r."dueDate",r.revision AS "reviewRevision",r.checklist,r.notes AS "reviewNotes",r."createdAt" AS "queuedAt",r."startedAt",r."completedAt",r."independenceVerified",pe."fullName" AS "preparerName",e."fullName" AS "reviewerName" FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id LEFT JOIN "Employee" pe ON pe.id=p."preparedByEmployeeId" LEFT JOIN "WorkAccount" w ON w.id=r."assignedTo" LEFT JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE p."caseId"=$1 ORDER BY p.version DESC`,[id]);
 const planIds=plans.map(p=>String(p.id));
 if(planIds.length){const refs=await db.query(`SELECT f."planId",f."caseFileId",cf.name AS "standardName",f."largeFileId",lf."originalName" AS "largeName" FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=ANY($1::text[]) ORDER BY f.id`,[planIds]);plans=plans.map(p=>({...p,fileReferences:refs.filter(f=>f.planId===p.id).map(f=>({id:String(f.caseFileId||f.largeFileId),kind:f.caseFileId?'standard':'large',name:f.standardName||f.largeName}))}));}
 const planHistory=await db.query(`SELECT id::text,"planId",action,"actorId","actorName","actorRole",detail,"createdAt" FROM "TreatmentPlanVersionAudit" WHERE "caseId"=$1 ORDER BY id`,[id]);
 const files=await db.query(`SELECT id,name,mime,size,'standard' AS kind FROM "CaseFile" WHERE "caseId"=$1 UNION ALL SELECT id,"originalName",mime,"sizeBytes",'large' AS kind FROM "LargeClinicalFile" WHERE "caseId"=$1`,[id]);
 const history=await db.query(`SELECT a.*,p.version FROM "ClinicalReviewAudit" a JOIN "ClinicalReview" r ON r.id=a."reviewId" JOIN "TreatmentPlan" p ON p.id=r."planId" WHERE p."caseId"=$1 ORDER BY a.id DESC`,[id]);
 const messages=await db.query('SELECT author,kind,text,"createdAt" FROM "CaseMessage" WHERE "caseId"=$1 ORDER BY "createdAt"',[id]);
 const team=a.role==='REVIEWER'?[]:await db.query(`SELECT w.id,w."employeeId",w."clinicalRole",e."fullName" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w."clinicalRole" IN ('REVIEWER','LEAD') AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' ORDER BY e."fullName"`);
 const preparers=a.role==='REVIEWER'?[]:await db.query(`SELECT w.id,w."employeeId",e."fullName",e."permanentId" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w."employeeId" IS NOT NULL AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' ORDER BY e."fullName"`);
 return {actor:a,case:c,plans,files,history,planHistory,messages,team,preparers};
}
export async function clinicalUpdate(a:ClinicalActor,id:string,input:unknown){
 const parsed=clinicalActionSchema.safeParse(input);if(!parsed.success)throw new PortalError(400,'Check the action, revision, checklist and written reason.');const b=parsed.data;
 await db.transaction(async tx=>{
  const c=await clinicalCase(a,id,tx,true);
  const [r]=await tx.query(`SELECT r.*,p.version,p.decision,p."preparedByAccountId",p."preparedByEmployeeId" FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=$1 ORDER BY p.version DESC LIMIT 1 FOR UPDATE OF r`,[id]);
  if(!r)throw new PortalError(409,'A treatment plan is required.');
  if(r.planId!==b.planId)throw new PortalError(409,'Plan version changed. Refresh before reviewing.');
  if(r.revision!==b.revision)throw new PortalError(409,'Review changed. Refresh before retrying.');
  await tx.query(`SELECT set_config('allen.clinical_actor',$1,true),set_config('allen.clinical_name',$2,true),set_config('allen.clinical_action',$3,true)`,[a.id,a.name,b.action]);
  const [activeActor]=await tx.query(`SELECT w."employeeId",w."clinicalRole" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1 AND w."clinicalRole"=$2 AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' FOR SHARE OF w`,[a.id,a.role]);
  if(!activeActor)throw new PortalError(403,'Active clinical authorization is required.');
  if(b.action==='request_new_version'){
   manageClinical(a);if(!['PLANNING','REVIEW','APPROVED'].includes(c.status))throw new PortalError(409,'A new review version can only be requested before production.');
   await tx.portalCase.update({where:{id},data:{status:'CHANGES_REQUESTED',revision:{increment:1}}});
   await tx.query(`INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail) VALUES($1,$2,$3,$4,$5,'NEW_REVIEW_REQUESTED',jsonb_build_object('version',$6::int,'reason',$7::text))`,[r.planId,id,a.id,a.name,a.role,r.version,b.reason]);
   await recordCaseActivity(tx,id,c.clinicId,'New plan version requested for independent clinical review',{actor:{id:a.id,name:a.name,role:a.role},action:'new_review_requested',fromStatus:c.status,status:'CHANGES_REQUESTED',notes:null});
   await tx.notification.create({data:{caseId:id,doctorId:c.doctorId,text:'Allen requested a new plan version for independent clinical review.'}});return;
  }
  if(b.action==='record_preparer'){
   manageClinical(a);if(r.preparedByAccountId||r.decision!=='PENDING'||!['PENDING','IN_REVIEW','ESCALATED'].includes(r.status))throw new PortalError(409,'Preparation identity can only be recorded once on an undecided, open legacy version.');
   const [preparer]=await tx.query(`SELECT w.id,w."employeeId" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1 AND w."employeeId" IS NOT NULL AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' FOR SHARE OF w`,[b.preparedByAccountId]);
   if(!preparer)throw new PortalError(400,'Select the verified active employee who prepared this version.');
   await tx.query(`SELECT set_config('allen.preparer_reason',$1,true)`,[b.reason]);
   await tx.query(`UPDATE "TreatmentPlan" SET "preparedByAccountId"=$2,"preparedByEmployeeId"=$3,"preparedAt"=clock_timestamp() WHERE id=$1`,[r.planId,preparer.id,preparer.employeeId]);
   await tx.query(`UPDATE "ClinicalReview" SET "assignedTo"=NULL,status=CASE WHEN status='ESCALATED' THEN 'ESCALATED' ELSE 'PENDING' END,checklist='{}',notes='',"startedAt"=NULL,revision=revision+1 WHERE id=$1`,[r.id]);return;
  }
  if(!r.preparedByAccountId||!r.preparedByEmployeeId)throw new PortalError(409,'Record the verified preparer identity before assigning or starting independent review.');
  if(b.action==='assign'){
   manageClinical(a);if(!['PENDING','IN_REVIEW','ESCALATED'].includes(r.status))throw new PortalError(409,'Completed reviews cannot be reassigned.');
   const [reviewer]=await tx.query(`SELECT w."clinicalRole",w."employeeId" FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1 AND w."clinicalRole" IN ('REVIEWER','LEAD') AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' FOR SHARE OF w`,[b.assignedTo]);
   if(!reviewer || (r.status==='ESCALATED'&&reviewer.clinicalRole!=='LEAD'))throw new PortalError(400,'Select an active qualified reviewer; escalations require a Clinical Lead.');
   if(b.assignedTo===r.preparedByAccountId||reviewer.employeeId===r.preparedByEmployeeId)throw new PortalError(409,'The preparer cannot be assigned as the clinical reviewer of this version.');
   const changed=r.assignedTo!==b.assignedTo;
   const reassigned=changed&&r.assignedTo!==null;
   if(reassigned&&(!b.reason||b.reason.trim().length<10))throw new PortalError(400,'Add a reason of at least 10 characters to reassign this case.');
   if(reassigned)await tx.query(`SELECT set_config('allen.clinical_assignment_reason',$1,true)`,[b.reason!.trim()]);
   await tx.query(`UPDATE "ClinicalReview" SET "assignedTo"=$2,priority=$3,"dueDate"=nullif($4,'')::date,status=CASE WHEN $5 AND status='IN_REVIEW' THEN 'PENDING' ELSE status END,checklist=CASE WHEN $5 THEN '{}'::jsonb ELSE checklist END,notes=CASE WHEN $5 THEN '' ELSE notes END,"startedAt"=CASE WHEN $5 THEN NULL ELSE "startedAt" END,revision=revision+1 WHERE id=$1`,[r.id,b.assignedTo,b.priority,b.dueDate||'',changed]);
   if(reassigned)await tx.query(`INSERT INTO "ClinicalReviewAudit"("reviewId","actorId","actorName",action,detail) VALUES($1,$2,$3,'REASSIGNED',$4::jsonb)`,[r.id,a.id,a.name,JSON.stringify({fromAccountId:r.assignedTo,toAccountId:b.assignedTo,reason:b.reason!.trim(),planVersion:r.version,priority:b.priority,dueDate:b.dueDate||null})]);
   return;
  }
  if(a.id===r.preparedByAccountId||activeActor.employeeId===r.preparedByEmployeeId)throw new PortalError(403,'You prepared this plan version. A different qualified clinician must review it.');
  if(a.role==='ADMIN'||(r.assignedTo!==a.id && !(a.role==='LEAD'&&r.status==='ESCALATED')))throw new PortalError(403,'Only the assigned qualified reviewer or escalated Clinical Lead may review.');
  if(!['PENDING','IN_REVIEW','ESCALATED'].includes(r.status))throw new PortalError(409,'This review is complete. A new plan version requires a new review.');
  if(r.status==='ESCALATED' && a.role!=='LEAD')throw new PortalError(403,'Only a Clinical Lead may take over an escalation.');
  if(b.action==='start'){
   const takeover=r.assignedTo!==a.id;
   await tx.query(`UPDATE "ClinicalReview" SET status='IN_REVIEW',"assignedTo"=$2,checklist=CASE WHEN $3 THEN '{}'::jsonb ELSE checklist END,notes=CASE WHEN $3 THEN '' ELSE notes END,"startedAt"=CASE WHEN $3 THEN clock_timestamp() ELSE coalesce("startedAt",clock_timestamp()) END,revision=revision+1 WHERE id=$1`,[r.id,a.id,takeover]);return;
  }
  if(r.status!=='IN_REVIEW')throw new PortalError(409,'Start or take over the review first.');
  if(b.action==='save'){
   await tx.query(`UPDATE "ClinicalReview" SET checklist=$2::jsonb,notes=$3,revision=revision+1 WHERE id=$1`,[r.id,JSON.stringify(b.checklist),b.notes]);return;
  }
  if(b.action==='approve'){
   const problem=approvalProblem(r.checklist);if(problem)throw new PortalError(400,problem);
   if(!b.confirmed)throw new PortalError(400,'Confirm your qualified clinical review.');
   await tx.query(`SELECT set_config('allen.clinical_confirmed','true',true)`);
  }
  const status={approve:'APPROVED',revise:'REVISION_REQUESTED',return:'RETURNED',escalate:'ESCALATED',observe:'IN_REVIEW'}[b.action];
  const done=['approve','revise','return'].includes(b.action);
  await tx.query(`UPDATE "ClinicalReview" SET status=$2,notes=$3,"completedAt"=CASE WHEN $4 THEN now() ELSE NULL END,"decidedBy"=CASE WHEN $4 THEN $5::uuid ELSE NULL END,revision=revision+1 WHERE id=$1`,[r.id,status,b.reason,done,a.id]);
  if(done){
   const next=b.action==='approve'?(r.decision==='APPROVED'?'APPROVED':'REVIEW'):'CHANGES_REQUESTED';
   await tx.portalCase.update({where:{id},data:{status:next,revision:{increment:1}}});
   const text=`Internal clinical review of plan v${r.version}: ${status.replaceAll('_',' ')}`;
   await recordCaseActivity(tx,id,c.clinicId,text,{actor:{id:a.id,name:a.name,role:a.role},action:'clinical_'+b.action,fromStatus:c.status,status:next,notes:null});
   await tx.notification.create({data:{caseId:id,doctorId:c.doctorId,text}});
   if(b.action!=='approve')await tx.caseMessage.create({data:{caseId:id,author:'Internal Clinical Review',kind:'clinical_revision',text:b.reason}});
  }
 });
}
export async function releasedPlanIds(caseIds:string[]){
 if(!caseIds.length)return new Set<string>();
 const rows=await db.query(`SELECT p.id FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=ANY($1::text[]) AND r.status='APPROVED'`,[caseIds]);return new Set(rows.map(r=>String(r.id)));
}
