import 'server-only';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {db,type Database} from './database';
import {digest} from './portal-auth';
import {PortalError} from './portal-http';
import {recordCaseActivity} from './case-activity';
import type {CaseStatus} from './db-models';

export type ProductionActor={id:string;email:string;role:string}|null;
export type ProductionMetrics={planningQueue:number;readyForProduction:number;inProduction:number;awaitingCompletion:number;activeLabGrants:number;expiredLabGrants:number};
export type ProductionRecord={id:string;patientReference:string;category:string;status:string;revision:number;doctorName:string;clinicName:string;planVersion:number|null;planDecision:string|null;approvedAt:string|null;clinicalReviewStatus:string|null;labLabel:string|null;labExpiresAt:string|null;labAccessActive:boolean;qcState:string|null;careStage:string|null;updatedAt:string};
export type ProductionActivity={id:string;action:string;caseId:string;detail:{label?:string;expiresAt?:string|null};createdAt:string;actorEmail:string|null};
const iso=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
function requireProductionManager(actor:ProductionActor):asserts actor is NonNullable<ProductionActor>{
 if(!actor?.id)throw new PortalError(401,'Please sign in to access Production Management.');
 if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))throw new PortalError(403,'HR Admin or HR Officer permission is required to manage production access.');
}

const accessAction=z.discriminatedUnion('action',[
 z.object({action:z.literal('grant'),caseId:z.uuid(),label:z.string().trim().min(2).max(120),expiresInHours:z.number().int().min(1).max(720)}).strict(),
 z.object({action:z.literal('revoke'),caseId:z.uuid()}).strict(),
]);

export async function productionDashboard(actor:ProductionActor,database:Database=db){
 requireProductionManager(actor);
 const [metricRows,cases,activity]=await Promise.all([
  database.query(`SELECT
   COUNT(*) FILTER (WHERE status IN ('SUBMITTED','PLANNING','REVIEW','CHANGES_REQUESTED'))::text AS "planningQueue",
   COUNT(*) FILTER (WHERE status='APPROVED')::text AS "readyForProduction",
   COUNT(*) FILTER (WHERE status='IN_PRODUCTION')::text AS "inProduction",
   COUNT(*) FILTER (WHERE status='SHIPPED')::text AS "awaitingCompletion",
   COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','COMPLETED') AND la."expiresAt">now())::text AS "activeLabGrants",
   COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','COMPLETED') AND la."caseId" IS NOT NULL AND la."expiresAt"<=now())::text AS "expiredLabGrants"
   FROM "PortalCase" c LEFT JOIN "LabAccess" la ON la."caseId"=c.id`),
  database.query(`SELECT c.id::text AS id,c."patientReference",c.category,c.status,c.revision,c."updatedAt",
    d."fullName" AS "doctorName",cl.name AS "clinicName",
    p.version AS "planVersion",p.decision AS "planDecision",p."approvedAt",
    r.status AS "clinicalReviewStatus",la.label AS "labLabel",la."expiresAt" AS "labExpiresAt",
    (la."expiresAt">now()) AS "labAccessActive",
    to_jsonb(c)->>'qcState' AS "qcState",to_jsonb(c)->>'careStage' AS "careStage"
   FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
   LEFT JOIN LATERAL (SELECT id,version,decision,"approvedAt" FROM "TreatmentPlan" WHERE "caseId"=c.id ORDER BY version DESC LIMIT 1) p ON true
   LEFT JOIN LATERAL (SELECT status FROM "ClinicalReview" WHERE "planId"=p.id ORDER BY "completedAt" DESC NULLS LAST LIMIT 1) r ON true
   LEFT JOIN "LabAccess" la ON la."caseId"=c.id
   WHERE c.status<>'DRAFT'
   ORDER BY CASE c.status WHEN 'APPROVED' THEN 0 WHEN 'IN_PRODUCTION' THEN 1 WHEN 'SHIPPED' THEN 2 WHEN 'SUBMITTED' THEN 3 ELSE 4 END,c."updatedAt" DESC
   LIMIT 300`),
  database.query(`SELECT a.id::text AS id,a.action,a."recordId" AS "caseId",a.detail,a."createdAt",u.email AS "actorEmail"
   FROM "ManagementAudit" a LEFT JOIN "HRUser" u ON u.id=a."hrActorId"
   WHERE a.scope='PRODUCTION' ORDER BY a."createdAt" DESC LIMIT 30`),
 ]);
 const m=metricRows[0]??{};
 const records:ProductionRecord[]=cases.map(item=>({
  id:String(item.id),patientReference:String(item.patientReference),category:String(item.category),status:String(item.status),revision:Number(item.revision),
  doctorName:String(item.doctorName),clinicName:String(item.clinicName),planVersion:item.planVersion===null?null:Number(item.planVersion),
  planDecision:item.planDecision===null?null:String(item.planDecision),approvedAt:item.approvedAt?iso(item.approvedAt):null,
  clinicalReviewStatus:item.clinicalReviewStatus===null?null:String(item.clinicalReviewStatus),labLabel:item.labLabel===null?null:String(item.labLabel),
  labExpiresAt:item.labExpiresAt?iso(item.labExpiresAt):null,labAccessActive:item.labAccessActive===true,qcState:item.qcState===null?null:String(item.qcState),
  careStage:item.careStage===null?null:String(item.careStage),updatedAt:iso(item.updatedAt),
 }));
 const recent:ProductionActivity[]=activity.map(item=>({
  id:String(item.id),action:String(item.action),caseId:String(item.caseId),
  detail:item.detail&&typeof item.detail==='object'?item.detail as ProductionActivity['detail']:{},
  createdAt:iso(item.createdAt),actorEmail:item.actorEmail===null?null:String(item.actorEmail),
 }));
 const metrics:ProductionMetrics={
  planningQueue:Number(m.planningQueue??0),readyForProduction:Number(m.readyForProduction??0),inProduction:Number(m.inProduction??0),
  awaitingCompletion:Number(m.awaitingCompletion??0),activeLabGrants:Number(m.activeLabGrants??0),expiredLabGrants:Number(m.expiredLabGrants??0),
 };
 return {
  metrics,cases:records,activity:recent,
 };
}

export async function manageProductionAccess(input:unknown,actor:ProductionActor,database:Database=db){
 requireProductionManager(actor);
 const parsed=accessAction.safeParse(input);
 if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the production access request.');
 const body=parsed.data;
 return database.transaction(async tx=>{
  const [c]=await tx.query(`SELECT id,"clinicId","doctorId",status FROM "PortalCase" WHERE id=$1 FOR UPDATE`,[body.caseId]);
  if(!c)throw new PortalError(404,'Case not found.');
  if(c.status==='DRAFT')throw new PortalError(409,'Submit the case before granting laboratory access.');
  if(body.action==='grant'&&c.status==='COMPLETED')throw new PortalError(409,'Completed cases cannot receive new laboratory access.');

  let label:string;
  let expiresAt:Date|null=null;
  let token:string|undefined;
  if(body.action==='grant'){
   label=body.label;
   token=randomBytes(32).toString('hex');
   expiresAt=new Date(Date.now()+body.expiresInHours*60*60*1000);
   await tx.query(`INSERT INTO "LabAccess"("caseId","tokenHash",label,"expiresAt") VALUES($1,$2,$3,$4)
    ON CONFLICT("caseId") DO UPDATE SET "tokenHash"=EXCLUDED."tokenHash",label=EXCLUDED.label,"expiresAt"=EXCLUDED."expiresAt"`,[body.caseId,digest(token),label,expiresAt]);
  }else{
   const [grant]=await tx.query(`UPDATE "LabAccess" SET "expiresAt"=clock_timestamp() WHERE "caseId"=$1 RETURNING label`,[body.caseId]);
   if(!grant)throw new PortalError(404,'No laboratory access grant exists for this case.');
   label=String(grant.label);
  }
  const action=body.action==='grant'?'LAB_ACCESS_GRANTED':'LAB_ACCESS_REVOKED';
  const detail={label,expiresAt:expiresAt?.toISOString()??null,rotated:body.action==='grant'};
  const eventLabel=body.action==='grant'?`Production access granted to ${label}`:`Production access revoked for ${label}`;
  await recordCaseActivity(tx,body.caseId,String(c.clinicId),eventLabel,{actor:{id:actor.id,name:actor.email,role:'PRODUCTION_MANAGER'},action:action.toLowerCase(),fromStatus:String(c.status) as CaseStatus,status:String(c.status) as CaseStatus,notes:null});
  await tx.query(`INSERT INTO "ManagementAudit"("actorId","hrActorId",scope,action,"recordId",detail) VALUES($1,$1::uuid,'PRODUCTION',$2,$3,$4::jsonb)`,[actor.id,action,body.caseId,JSON.stringify(detail)]);
  await tx.notification.create({data:{caseId:body.caseId,doctorId:String(c.doctorId),text:eventLabel}});
  return {action,label,expiresAt:expiresAt?.toISOString()??null,token};
 });
}
