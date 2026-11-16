import 'server-only';
import { z } from 'zod';
import { db, type Database } from './database';
import { PortalError } from './portal-http';

import type { AuditActor } from './audit-team-auth';
const idSchema = z.uuid();
const planSchema = z.object({
  title: z.string().trim().min(5).max(180),
  process: z.string().trim().min(2).max(160),
  scope: z.string().trim().min(5).max(5000),
  criteria: z.string().trim().min(3).max(2000),
  leadAuditor: z.string().trim().min(2).max(200),
  auditee: z.string().trim().min(2).max(200),
  plannedDate: z.iso.date(),
}).strict();
const checklistSchema = z.object({
  reference: z.string().trim().max(100).default(''),
  question: z.string().trim().min(5).max(2000),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
}).strict();
const answerSchema = z.object({
  response: z.enum(['PENDING','CONFORMING','NONCONFORMING','NOT_APPLICABLE']),
  evidence: z.string().trim().max(4000).default(''),
}).strict();
const findingSchema = z.object({
  checklistItemId: z.union([z.uuid(),z.literal('')]).optional(),
  severity: z.enum(['OBSERVATION','MINOR','MAJOR','CRITICAL']),
  title: z.string().trim().min(5).max(180),
  description: z.string().trim().min(10).max(5000),
  actionPlan: z.string().trim().max(4000).default(''),
  actionOwner: z.string().trim().max(200).default(''),
  actionDueDate: z.union([z.iso.date(),z.literal('')]).optional(),
  capaRequired: z.coerce.boolean().default(false),
}).strict();
const findingUpdateSchema = z.object({
  actionPlan: z.string().trim().max(4000).optional(),
  actionOwner: z.string().trim().max(200).optional(),
  actionDueDate: z.union([z.iso.date(),z.literal('')]).optional(),
  actionStatus: z.enum(['OPEN','IN_PROGRESS','COMPLETE']).optional(),
  actionNote: z.string().trim().max(2000).optional(),
  capaRequired: z.coerce.boolean().optional(),
  status: z.enum(['OPEN','CLOSED']).optional(),
  closureEvidence: z.string().trim().max(4000).optional(),
}).strict();
const transitionSchema = z.object({ status: z.enum(['IN_PROGRESS','CLOSURE_REVIEW','CLOSED','CANCELLED']) }).strict();
const writableRoles = ['HR_ADMIN','HR_OFFICER','AUDIT_TEAM'];

function requireActor(actor: AuditActor, write = false): asserts actor is NonNullable<AuditActor> {
  if (!actor || !actor.id || !['HR_ADMIN','HR_OFFICER','HR_VIEWER','AUDIT_TEAM'].includes(actor.role)) {
    throw new PortalError(actor ? 403 : 401, actor ? 'HR permission required.' : 'Please sign in to access internal audits.');
  }
  if (write && !writableRoles.includes(actor.role)) throw new PortalError(403,'HR Admin or HR Officer permission is required to manage audits.');
}
function validId(id: string) {
  if (!idSchema.safeParse(id).success) throw new PortalError(400,'Invalid audit record ID.');
}
function parsed<T>(schema: z.ZodType<T>, body: unknown, message: string): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new PortalError(400,result.error.issues[0]?.message ?? message);
  return result.data;
}
async function event(tx: Database,auditId: string,actor: NonNullable<AuditActor>,action: string,detail: unknown) {
  await tx.query(`INSERT INTO "InternalAuditEvent"("auditId","actorId",action,detail) VALUES($1,$2,$3,$4::jsonb)`,[auditId,actor.id,action,JSON.stringify(detail ?? {})]);
}
export async function auditList(actor: AuditActor,database: Database = db) {
  requireActor(actor);
  const plans = await database.query(`SELECT p.id::text AS id,p."auditNumber"::text AS "auditNumber",p.title,p.process,p.scope,p.criteria,p."leadAuditor",p.auditee,p."plannedDate"::text AS "plannedDate",p.status,p."createdAt",p."closedAt",
    (SELECT count(*)::int FROM "InternalAuditChecklistItem" c WHERE c."auditId"=p.id) AS "checklistCount",
    (SELECT count(*)::int FROM "InternalAuditChecklistItem" c WHERE c."auditId"=p.id AND c.response<>'PENDING') AS "checklistAnswered",
    (SELECT count(*)::int FROM "InternalAuditFinding" f WHERE f."auditId"=p.id) AS "findingCount",
    (SELECT count(*)::int FROM "InternalAuditFinding" f WHERE f."auditId"=p.id AND f.status<>'CLOSED') AS "openFindings"
    FROM "InternalAuditPlan" p ORDER BY CASE p.status WHEN 'CLOSED' THEN 2 WHEN 'CANCELLED' THEN 3 ELSE 0 END,p."plannedDate" DESC,p."createdAt" DESC LIMIT 200`);
  const ids = plans.map(row => String(row.id));
  if (!ids.length) return { plans,checklist:[],findings:[],events:[],canWrite:writableRoles.includes(actor.role) };
  const [checklist,findings,events] = await Promise.all([
    database.query(`SELECT c.id::text AS id,c."auditId"::text AS "auditId",c.reference,c.question,c."sortOrder",c.response,c.evidence,c."completedAt" FROM "InternalAuditChecklistItem" c WHERE c."auditId"=ANY($1::uuid[]) ORDER BY c."auditId",c."sortOrder",c."createdAt"`,[ids]),
    database.query(`SELECT f.id::text AS id,f."auditId"::text AS "auditId",f."findingNumber"::text AS "findingNumber",f."checklistItemId"::text AS "checklistItemId",f.severity,f.title,f.description,f."actionPlan",f."actionOwner",f."actionDueDate"::text AS "actionDueDate",f."actionStatus",f."actionNote",f."capaRequired",f."capaId"::text AS "capaId",c.status AS "capaStatus",f."closureEvidence",f.status,f."closedAt" FROM "InternalAuditFinding" f LEFT JOIN "CAPA" c ON c.id=f."capaId" WHERE f."auditId"=ANY($1::uuid[]) ORDER BY f."auditId",f."findingNumber"`,[ids]),
    database.query(`SELECT e.id,e."auditId"::text AS "auditId",e.action,e.detail,e."createdAt",u.email AS "actorEmail" FROM "InternalAuditEvent" e JOIN "HRUser" u ON u.id=e."actorId" WHERE e."auditId"=ANY($1::uuid[]) ORDER BY e."createdAt" DESC,e.id DESC LIMIT 300`,[ids]),
  ]);
  return { plans,checklist,findings,events,canWrite:writableRoles.includes(actor.role) };
}
export async function createAuditPlan(body: unknown,actor: AuditActor,database: Database = db) {
  requireActor(actor,true);
  const value = parsed(planSchema,body,'Check the audit plan.');
  return database.transaction(async tx => {
    const [plan] = await tx.query(`INSERT INTO "InternalAuditPlan"(title,process,scope,criteria,"leadAuditor",auditee,"plannedDate","createdBy","updatedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id::text AS id,"auditNumber"::text AS "auditNumber"`,[value.title,value.process,value.scope,value.criteria,value.leadAuditor,value.auditee,value.plannedDate,actor.id]);
    await event(tx,String(plan.id),actor,'AUDIT_PLANNED',{auditNumber:plan.auditNumber,title:value.title,plannedDate:value.plannedDate});
    return {id:String(plan.id),auditNumber:String(plan.auditNumber)};
  });
}
export async function addChecklistItem(auditId:string,body:unknown,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);const value=parsed(checklistSchema,body,'Check the checklist item.');
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);
    if(!plan)throw new PortalError(404,'Audit plan not found.');
    if(plan.status!=='PLANNED'&&plan.status!=='IN_PROGRESS')throw new PortalError(409,'Checklist items are locked after closure review begins.');
    const [item]=await tx.query(`INSERT INTO "InternalAuditChecklistItem"("auditId",reference,question,"sortOrder") VALUES($1,$2,$3,$4) RETURNING id::text AS id`,[auditId,value.reference,value.question,value.sortOrder]);
    await tx.query(`UPDATE "InternalAuditPlan" SET "updatedBy"=$2,"updatedAt"=now() WHERE id=$1`,[auditId,actor.id]);
    await event(tx,auditId,actor,'CHECKLIST_ITEM_ADDED',{itemId:item.id,reference:value.reference,question:value.question});
    return {id:String(item.id)};
  });
}
export async function answerChecklistItem(auditId:string,itemId:string,body:unknown,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);validId(itemId);const value=parsed(answerSchema,body,'Check the checklist response.');
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);
    if(!plan)throw new PortalError(404,'Audit plan not found.');
    if(plan.status!=='IN_PROGRESS')throw new PortalError(409,'Checklist responses can only change while an audit is in progress.');
    const [item]=await tx.query(`UPDATE "InternalAuditChecklistItem" SET response=$3,evidence=$4,"completedBy"=CASE WHEN $3='PENDING' THEN NULL ELSE $5::uuid END,"completedAt"=CASE WHEN $3='PENDING' THEN NULL ELSE now() END WHERE id=$1 AND "auditId"=$2 RETURNING reference,response`,[itemId,auditId,value.response,value.evidence,actor.id]);
    if(!item)throw new PortalError(404,'Checklist item not found for this audit.');
    await tx.query(`UPDATE "InternalAuditPlan" SET "updatedBy"=$2,"updatedAt"=now() WHERE id=$1`,[auditId,actor.id]);
    await event(tx,auditId,actor,'CHECKLIST_RESPONSE_RECORDED',{itemId,reference:item.reference,response:value.response,evidence:value.evidence});
    return {id:itemId,response:value.response};
  });
}
export async function createAuditFinding(auditId:string,body:unknown,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);const value=parsed(findingSchema,body,'Check the audit finding.');
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status,"auditNumber" FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);
    if(!plan)throw new PortalError(404,'Audit plan not found.');
    if(plan.status!=='IN_PROGRESS')throw new PortalError(409,'Findings can only be added while an audit is in progress.');
    const checklistId=value.checklistItemId||null;
    if(checklistId){const [item]=await tx.query(`SELECT response FROM "InternalAuditChecklistItem" WHERE id=$1 AND "auditId"=$2`,[checklistId,auditId]);if(!item)throw new PortalError(404,'Checklist item not found in this audit.');if(item.response!=='NONCONFORMING')throw new PortalError(409,'Select a nonconforming checklist item before linking a finding.');}
    const [finding]=await tx.query(`INSERT INTO "InternalAuditFinding"("auditId","checklistItemId",severity,title,description,"actionPlan","actionOwner","actionDueDate","capaRequired","createdBy","updatedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id::text AS id,"findingNumber"::text AS "findingNumber"`,[auditId,checklistId,value.severity,value.title,value.description,value.actionPlan,value.actionOwner,value.actionDueDate||null,value.capaRequired,actor.id]);
    await tx.query(`UPDATE "InternalAuditPlan" SET "updatedBy"=$2,"updatedAt"=now() WHERE id=$1`,[auditId,actor.id]);
    await event(tx,auditId,actor,'FINDING_RECORDED',{findingId:finding.id,findingNumber:finding.findingNumber,severity:value.severity,title:value.title,checklistItemId:checklistId});
    return {id:String(finding.id),findingNumber:String(finding.findingNumber)};
  });
}
export async function updateAuditFinding(auditId:string,findingId:string,body:unknown,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);validId(findingId);const value=parsed(findingUpdateSchema,body,'Check the finding action and closure details.');
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);if(!plan)throw new PortalError(404,'Audit plan not found.');
    if(plan.status!=='IN_PROGRESS'&&plan.status!=='CLOSURE_REVIEW')throw new PortalError(409,'This audit is locked.');
    const [before]=await tx.query(`SELECT * FROM "InternalAuditFinding" WHERE id=$1 AND "auditId"=$2 FOR UPDATE`,[findingId,auditId]);if(!before)throw new PortalError(404,'Finding not found for this audit.');
    const next={actionPlan:value.actionPlan??before.actionPlan,actionOwner:value.actionOwner??before.actionOwner,actionDueDate:value.actionDueDate===undefined?before.actionDueDate:(value.actionDueDate||null),actionStatus:value.actionStatus??before.actionStatus,actionNote:value.actionNote??before.actionNote,capaRequired:value.capaRequired??before.capaRequired,status:value.status??before.status,closureEvidence:value.closureEvidence??before.closureEvidence};
    if(next.status==='CLOSED'){
      if(next.actionStatus!=='COMPLETE'||String(next.actionPlan).trim().length<5||String(next.actionOwner).trim().length<2||!next.actionDueDate||String(next.actionNote).trim().length<5||String(next.closureEvidence).trim().length<5)throw new PortalError(409,'Complete the action plan, owner, due date, completion note and closure evidence before closing this finding.');
      if(next.capaRequired){if(!before.capaId)throw new PortalError(409,'Create and link a CAPA before closing this finding.');const [capa]=await tx.query(`SELECT status FROM "CAPA" WHERE id=$1`,[before.capaId]);if(capa?.status!=='CLOSED')throw new PortalError(409,'The linked CAPA must be closed before this finding can close.');}
    }
    await tx.query(`UPDATE "InternalAuditFinding" SET "actionPlan"=$3,"actionOwner"=$4,"actionDueDate"=$5,"actionStatus"=$6,"actionNote"=$7,"capaRequired"=$8,status=$9,"closureEvidence"=$10,"updatedBy"=$11,"updatedAt"=now(),"closedAt"=CASE WHEN $9='CLOSED' THEN now() WHEN $9='OPEN' THEN NULL ELSE "closedAt" END WHERE id=$1 AND "auditId"=$2`,[findingId,auditId,next.actionPlan,next.actionOwner,next.actionDueDate,next.actionStatus,next.actionNote,next.capaRequired,next.status,next.closureEvidence,actor.id]);
    await tx.query(`UPDATE "InternalAuditPlan" SET "updatedBy"=$2,"updatedAt"=now() WHERE id=$1`,[auditId,actor.id]);
    await event(tx,auditId,actor,next.status==='CLOSED'?'FINDING_CLOSED':'FINDING_ACTION_UPDATED',{findingId,title:before.title,statusBefore:before.status,statusAfter:next.status,actionStatus:next.actionStatus,actionNote:next.actionNote,closureEvidence:next.closureEvidence});
    return {id:findingId,status:next.status,actionStatus:next.actionStatus};
  });
}
export async function createFindingCapa(auditId:string,findingId:string,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);validId(findingId);
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status,"auditNumber" FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);if(!plan)throw new PortalError(404,'Audit plan not found.');if(plan.status!=='IN_PROGRESS')throw new PortalError(409,'A CAPA can only be opened while the audit is in progress.');
    const [finding]=await tx.query(`SELECT * FROM "InternalAuditFinding" WHERE id=$1 AND "auditId"=$2 FOR UPDATE`,[findingId,auditId]);if(!finding)throw new PortalError(404,'Finding not found.');if(!finding.capaRequired)throw new PortalError(409,'Mark CAPA as required before creating one.');if(finding.capaId)throw new PortalError(409,'A CAPA is already linked to this finding.');if(!finding.actionOwner||!finding.actionDueDate)throw new PortalError(409,'Add an action owner and due date before creating a CAPA.');
    const severity=finding.severity==='CRITICAL'?'CRITICAL':finding.severity==='MAJOR'?'HIGH':finding.severity==='MINOR'?'MEDIUM':'LOW';
    const title=`Internal audit ${plan.auditNumber} finding ${finding.findingNumber}: ${finding.title}`.slice(0,200);
    const [capa]=await tx.query(`INSERT INTO "CAPA"("sourceType",severity,title,description,"assignedTo","dueDate","createdBy","updatedBy") VALUES('INTERNAL_AUDIT',$1,$2,$3,$4,$5,$6,$6) RETURNING id::text AS id`,[severity,title,finding.description,finding.actionOwner,finding.actionDueDate,actor.id]);
    await tx.query(`INSERT INTO "CAPAAudit"("capaId","actorId",action,detail) VALUES($1,$2,'CREATED',$3::jsonb)`,[capa.id,actor.id,JSON.stringify({title,sourceType:'INTERNAL_AUDIT',severity,auditId,findingId})]);
    await tx.query(`UPDATE "InternalAuditFinding" SET "capaId"=$2,"updatedBy"=$3,"updatedAt"=now() WHERE id=$1`,[findingId,capa.id,actor.id]);
    await tx.query(`UPDATE "InternalAuditPlan" SET "updatedBy"=$2,"updatedAt"=now() WHERE id=$1`,[auditId,actor.id]);
    await event(tx,auditId,actor,'CAPA_LINKED',{findingId,capaId:capa.id,capaTitle:title});
    return {id:String(capa.id),title};
  });
}
export async function transitionAudit(auditId:string,body:unknown,actor:AuditActor,database:Database=db){
  requireActor(actor,true);validId(auditId);const value=parsed(transitionSchema,body,'Choose a valid audit stage.');
  return database.transaction(async tx=>{
    const [plan]=await tx.query(`SELECT status,"auditNumber" FROM "InternalAuditPlan" WHERE id=$1 FOR UPDATE`,[auditId]);if(!plan)throw new PortalError(404,'Audit plan not found.');
    const allowed:Record<string,string[]>={PLANNED:['IN_PROGRESS','CANCELLED'],IN_PROGRESS:['CLOSURE_REVIEW','CANCELLED'],CLOSURE_REVIEW:['IN_PROGRESS','CLOSED'],CLOSED:[],CANCELLED:[]};
    if(!allowed[String(plan.status)]?.includes(value.status))throw new PortalError(409,`Audit cannot move from ${plan.status} to ${value.status}.`);
    if(value.status==='CLOSURE_REVIEW'||value.status==='CLOSED'){
      const [counts]=await tx.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE response='PENDING')::int AS pending FROM "InternalAuditChecklistItem" WHERE "auditId"=$1`,[auditId]);
      if(counts.total===0||counts.pending>0)throw new PortalError(409,'Complete every checklist item before moving this audit to closure review.');
      const [findings]=await tx.query(`SELECT count(*) FILTER(WHERE f.status<>'CLOSED')::int AS open,count(*) FILTER(WHERE f."actionStatus"<>'COMPLETE')::int AS actions_open,count(*) FILTER(WHERE f."capaRequired" AND (f."capaId" IS NULL OR c.status<>'CLOSED'))::int AS capas_open FROM "InternalAuditFinding" f LEFT JOIN "CAPA" c ON c.id=f."capaId" WHERE f."auditId"=$1`,[auditId]);
      if(findings.open||findings.actions_open||findings.capas_open)throw new PortalError(409,'Close each finding, complete its action and close any required linked CAPA before audit closure.');
    }
    await tx.query(`UPDATE "InternalAuditPlan" SET status=$2,"updatedBy"=$3,"updatedAt"=now(),"closedAt"=CASE WHEN $2='CLOSED' THEN now() WHEN $2='IN_PROGRESS' THEN NULL ELSE "closedAt" END WHERE id=$1`,[auditId,value.status,actor.id]);
    await event(tx,auditId,actor,`AUDIT_${value.status}`,{auditNumber:plan.auditNumber,from:plan.status,to:value.status});
    return {id:auditId,status:value.status};
  });
}
