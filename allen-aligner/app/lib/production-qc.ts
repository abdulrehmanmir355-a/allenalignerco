import 'server-only';
import {z} from 'zod';
import type {Database} from './database';
import {db} from './database';
import {PortalError} from './portal-http';
import {qcStages,qcStageLabels,qcChecklists} from './production-qc-policy';
export {qcStages,qcDispositions,qcStageLabels,qcChecklists} from './production-qc-policy';
import {qcDispositions} from './production-qc-policy';
import {manufacturingApproval} from './treatment-approval';
const schema=z.object({stage:z.enum(qcStages),disposition:z.enum(qcDispositions),notes:z.string().trim().min(5).max(4000),checklist:z.record(z.string(),z.boolean())}).strict();
export type QCInspection={id:string;stage:typeof qcStages[number];disposition:typeof qcDispositions[number];notes:string;checklist:Record<string,boolean>;inspector:string;planId:string;planVersion:number;createdAt:string};
export async function requireProductionQCSchema(database:Database=db){
 const [row]=await database.query(`SELECT to_regclass('"ProductionQCInspection"') IS NOT NULL AS ready`);
 if(row?.ready!==true)throw new PortalError(503,'Production QC is not ready yet. Apply the additive Module 24 quality-control migration.');
}
function normalize(row:Record<string,unknown>):QCInspection{return {id:String(row.id),stage:row.stage as QCInspection['stage'],disposition:row.disposition as QCInspection['disposition'],notes:String(row.notes),checklist:row.checklist as Record<string,boolean>,inspector:String(row.inspector),planId:String(row.planId),planVersion:Number(row.planVersion),createdAt:new Date(String(row.createdAt)).toISOString()};}
export async function productionQCView(caseId:string,database:Database=db){
 await requireProductionQCSchema(database);
 const [caseRow]=await database.query(`SELECT c.id,c.status,c.patientReference,p.id AS "planId",p.version AS "planVersion",p.decision,
   EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=p.id AND r.status='APPROVED') AS "clinicalApproved",
   EXISTS(SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a.detail->>'decision'='APPROVED') AS "doctorApproved"
  FROM "PortalCase" c LEFT JOIN LATERAL(SELECT id,version,decision FROM "TreatmentPlan" WHERE "caseId"=c.id ORDER BY version DESC LIMIT 1)p ON true WHERE c.id=$1`,[caseId]);
 if(!caseRow)throw new PortalError(404,'Case not found.');
 const history=await database.query(`SELECT q.id::text AS id,q.stage,q.disposition,q.notes,q.checklist,q.inspector,q."planId",p.version AS "planVersion",q."createdAt"
  FROM "ProductionQCInspection" q JOIN "TreatmentPlan" p ON p.id=q."planId" WHERE q."caseId"=$1 ORDER BY q."createdAt" DESC,q.id DESC LIMIT 150`,[caseId]);
 return {caseId:String(caseRow.id),status:String(caseRow.status),patientReference:String(caseRow.patientReference),latestPlan:caseRow.planId?{id:String(caseRow.planId),version:Number(caseRow.planVersion),approved:caseRow.decision==='APPROVED'&&caseRow.clinicalApproved===true&&caseRow.doctorApproved===true}:null,inspections:history.map(normalize)};
}
export async function createProductionQCInspection(caseId:string,inspector:string,input:unknown,database:Database=db){
 const parsed=schema.safeParse(input);if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Review the QC form and try again.');
 const body=parsed.data;const required=Object.keys(qcChecklists[body.stage]);
 if(Object.keys(body.checklist).some(key=>!required.includes(key)))throw new PortalError(400,'The inspection checklist does not match this QC stage.');
 if(body.disposition==='PASS'&&(required.some(key=>body.checklist[key]!==true)||Object.keys(body.checklist).length!==required.length))throw new PortalError(400,'A PASS requires every checklist item for this stage.');
 await requireProductionQCSchema(database);
 return database.transaction(async tx=>{
  const [c]=await tx.query(`SELECT c.id,c.status,p.id AS "planId",p.version,p.decision,
    EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=p.id AND r.status='APPROVED') AS "clinicalApproved",
    EXISTS(SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a.detail->>'decision'='APPROVED') AS "doctorApproved"
   FROM "PortalCase" c LEFT JOIN LATERAL(SELECT id,version,decision FROM "TreatmentPlan" WHERE "caseId"=c.id ORDER BY version DESC LIMIT 1)p ON true WHERE c.id=$1 FOR UPDATE OF c`,[caseId]);
  if(!c)throw new PortalError(404,'Case not found.');
  if(!c.planId||c.decision!=='APPROVED'||c.clinicalApproved!==true||c.doctorApproved!==true)throw new PortalError(409,'QC can only be recorded against the latest clinically reviewed and doctor-approved plan.');
  if(body.stage==='INCOMING'&&!['APPROVED','IN_PRODUCTION'].includes(String(c.status)))throw new PortalError(409,'Incoming QC is available after plan approval and before shipment.');
  if(body.stage!=='INCOMING'&&c.status!=='IN_PRODUCTION')throw new PortalError(409,'In-Process and Final QC require an active production case.');
  await manufacturingApproval(tx,caseId);
  const [row]=await tx.query(`INSERT INTO "ProductionQCInspection"("caseId","planId",stage,disposition,checklist,notes,inspector)
    VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING id::text AS id,stage,disposition,notes,checklist,inspector,"planId","createdAt"`,[caseId,c.planId,body.stage,body.disposition,JSON.stringify(body.checklist),body.notes,inspector]);
  return {message:`${qcStageLabels[body.stage]} ${body.disposition.toLowerCase()} recorded. History is retained.`,inspection:normalize({...row,planVersion:c.version})};
 });
}
export async function productionQCTransitionProblem(tx:Database,caseId:string,nextStatus:string){
 if(!['IN_PRODUCTION','SHIPPED'].includes(nextStatus))return;
 await requireProductionQCSchema(tx);
 const [caseRow]=await tx.query(`SELECT p.id AS "planId" FROM "TreatmentPlan" p WHERE p."caseId"=$1 ORDER BY p.version DESC LIMIT 1`,[caseId]);
 if(!caseRow)throw new PortalError(409,'Production requires a current approved plan.');
 const stages=nextStatus==='IN_PRODUCTION'?['INCOMING']:qcStages;
 for(const stage of stages){
  const [latest]=await tx.query(`SELECT disposition FROM "ProductionQCInspection" WHERE "caseId"=$1 AND "planId"=$2 AND stage=$3 ORDER BY "createdAt" DESC,id DESC LIMIT 1`,[caseId,caseRow.planId,stage]);
  if(latest?.disposition!=='PASS')throw new PortalError(409,`${qcStageLabels[stage as keyof typeof qcStageLabels]} must have a PASS on the current approved plan before this step.`);
 }
}
