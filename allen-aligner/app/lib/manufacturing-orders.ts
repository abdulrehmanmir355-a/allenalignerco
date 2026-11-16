import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db,type Database} from './database';
import {PortalError} from './portal-http';
import {recordCaseActivity} from './case-activity';
import type {ProductionActor} from './production-management';
import type {WorkActor} from './work-auth';
import {decodeCaseIntake,decodeRecordFilename,type CaseIntake} from './case-intake';

const authorize=(actor:ProductionActor)=>{
 if(!actor?.id)throw new PortalError(401,'Please sign in to manage manufacturing orders.');
 if(!['HR_ADMIN','HR_OFFICER'].includes(actor.role))throw new PortalError(403,'HR Admin or HR Officer permission is required.');
 return actor;
};
const orderId=z.string().uuid();
const materialList=z.array(z.object({itemId:z.string().uuid(),quantity:z.number().int().min(1).max(1000000000)}).strict()).min(1).max(100).refine(items=>new Set(items.map(item=>item.itemId)).size===items.length,'Each stock item can appear once.');
const dateValue=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;});
const productionStage=z.object({orderId,stageName:z.string().trim().min(2).max(120),operatorName:z.string().trim().min(2).max(200),machineName:z.string().trim().min(2).max(160),materialUsed:z.string().trim().min(2).max(240),durationMinutes:z.number().int().min(1).max(1440),result:z.enum(['PASS','REWORK','FAIL']),notes:z.string().trim().max(2000).default('')}).strict();
const operatorStage=productionStage.extend({action:z.literal('record_operator_stage')}).strict();
const actionSchema=z.discriminatedUnion('action',[
 productionStage.extend({action:z.literal('record_stage')}).strict(),
 z.object({action:z.literal('set_materials'),orderId,materials:materialList}).strict(),
 z.object({action:z.literal('check_materials'),orderId,evidence:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('commercial_check'),orderId,reference:z.string().trim().min(2).max(200),evidence:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('capacity_check'),orderId,workCenter:z.string().trim().min(2).max(120),capacityReference:z.string().trim().min(2).max(200),scheduledFor:dateValue,dueDate:dateValue}).strict(),
 z.object({action:z.literal('cost'),orderId,currency:z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),materialCost:z.number().finite().min(0).max(999999999999),laborCost:z.number().finite().min(0).max(999999999999),otherCost:z.number().finite().min(0).max(999999999999)}).strict(),
 z.object({action:z.literal('quality_review'),orderId,decision:z.enum(['PASS','REWORK','FAIL']),evidence:z.string().trim().min(5).max(2000)}).strict(),
 z.object({action:z.literal('release_superseded_materials'),orderId}).strict(),
]);

export type ManufacturingMaterial={itemId:string;sku:string;name:string;unit:string;quantityRequired:number;available:number;reserved:number};
export type ManufacturingAudit={id:string;action:string;actorName:string;actorRole:string;detail:Record<string,unknown>;createdAt:string};
export type ManufacturingStage={id:string;sequence:number;stageName:string;operatorName:string;machineName:string;materialUsed:string;durationMinutes:number;result:'PASS'|'REWORK'|'FAIL';notes:string;recordedBy:string;createdAt:string};
export type ManufacturingQualityReview={id:string;decision:'PASS'|'REWORK'|'FAIL';evidence:string;inspectorName:string;createdAt:string};
export type ManufacturingSourceFile={id:string;recordType:string|null;name:string;mime:string;sizeBytes:number};
export type ManufacturingOrder={id:string;orderNumber:string;caseId:string;patientReference:string;doctorName:string;clinicName:string;caseType:string;caseNotes:string;intake:CaseIntake|null;planSummary:string;sourceFiles:ManufacturingSourceFile[];planVersion:number;status:string;approvedAt:string;approvedDoctorId:string;artifactSha256:string;materials:ManufacturingMaterial[];stages:ManufacturingStage[];qualityReviews:ManufacturingQualityReview[];materialCheckedAt:string|null;materialEvidence:string;commercialReference:string;commercialEvidence:string;commercialCheckedAt:string|null;workCenter:string;capacityReference:string;scheduledFor:string|null;dueDate:string|null;capacityCheckedAt:string|null;queuePosition:number|null;currency:string|null;materialCost:number|null;laborCost:number|null;otherCost:number|null;totalCost:number|null;costedAt:string|null;activity:ManufacturingAudit[]};
export type ManufacturingCatalogItem={id:string;sku:string;name:string;unit:string;available:number;reserved:number};
const iso=(value:unknown)=>value instanceof Date?value.toISOString():new Date(String(value)).toISOString();
const nullableIso=(value:unknown)=>value?iso(value):null;

export async function manufacturingOrderDashboard(actorInput:ProductionActor,database:Database=db){
 const actor=authorize(actorInput);
 const [readyRow]=await database.query(`SELECT to_regclass('public."ManufacturingOrder"') IS NOT NULL AND to_regclass('public."ManufacturingQualityReview"') IS NOT NULL AND to_regclass('public."ProductionQCInspection"') IS NOT NULL AS ready`);
 if(readyRow?.ready!==true)return {ready:false,orders:[] as ManufacturingOrder[],catalog:[] as ManufacturingCatalogItem[]};
 const [rows,catalogRows]=await Promise.all([
  database.query(`SELECT mo.id::text AS id,mo."orderNumber",mo."caseId",mo."planId",c."patientReference",c.category AS "caseType",c.notes AS "caseNotes",p.summary AS "planSummary",d."fullName" AS "doctorName",cl.name AS "clinicName",mo."planVersion",mo.status,mo."approvedAt",mo."approvedDoctorId",mo."artifactSha256",mo."materialCheckedAt",mo."materialEvidence",mo."commercialReference",mo."commercialEvidence",mo."commercialCheckedAt",mo."workCenter",mo."capacityReference",mo."scheduledFor"::text AS "scheduledFor",mo."dueDate"::text AS "dueDate",mo."capacityCheckedAt",mo."queuePosition",mo.currency,mo."materialCost",mo."laborCost",mo."otherCost",mo."totalCost",mo."costedAt"
   FROM "ManufacturingOrder" mo JOIN "PortalCase" c ON c.id=mo."caseId" JOIN "TreatmentPlan" p ON p.id=mo."planId" JOIN "Doctor" d ON d.id=mo."approvedDoctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
   ORDER BY CASE mo.status WHEN 'QUALITY_HOLD' THEN 0 WHEN 'MATERIAL_CHECK' THEN 1 WHEN 'COMMERCIAL_CHECK' THEN 2 WHEN 'CAPACITY_CHECK' THEN 3 WHEN 'QUEUED' THEN 4 ELSE 5 END,mo."queuePosition" NULLS LAST,mo."dueDate" NULLS LAST,mo."createdAt" LIMIT 300`),
  database.query(`SELECT i.id::text AS id,i.sku,i.name,i.unit,coalesce(sum(b.quantity) FILTER(WHERE b.state='AVAILABLE' AND (NOT i."trackLot" OR b."lotId" IS NOT NULL) AND (NOT i."trackExpiry" OR lot."expiresOn" IS NOT NULL) AND (lot."expiresOn" IS NULL OR lot."expiresOn">current_date)),0)::int AS available,coalesce(sum(b.quantity) FILTER(WHERE b.state='RESERVED'),0)::int AS reserved FROM "InventoryItem" i LEFT JOIN "InventoryLocationBalance" b ON b."itemId"=i.id LEFT JOIN "InventoryLot" lot ON lot.id=b."lotId" GROUP BY i.id,i.sku,i.name,i.unit ORDER BY lower(i.name),i.sku LIMIT 1000`),
 ]);
 const ids=rows.map(row=>String(row.id));
 const planIds=rows.map(row=>String(row.planId));
 const [materialRows,auditRows,stageRows,qualityRows]=ids.length?await Promise.all([
  database.query(`SELECT m."orderId"::text AS "orderId",m."itemId"::text AS "itemId",i.sku,i.name,i.unit,m."quantityRequired",coalesce(sum(b.quantity) FILTER(WHERE b.state='AVAILABLE' AND (NOT i."trackLot" OR b."lotId" IS NOT NULL) AND (NOT i."trackExpiry" OR lot."expiresOn" IS NOT NULL) AND (lot."expiresOn" IS NULL OR lot."expiresOn">current_date)),0)::int AS available,coalesce((SELECT sum(res."quantityReserved") FROM "ManufacturingOrderReservation" res WHERE res."orderId"=m."orderId" AND res."materialId"=m.id AND res."releaseMovementId" IS NULL),0)::int AS reserved FROM "ManufacturingOrderMaterial" m JOIN "InventoryItem" i ON i.id=m."itemId" LEFT JOIN "InventoryLocationBalance" b ON b."itemId"=i.id LEFT JOIN "InventoryLot" lot ON lot.id=b."lotId" GROUP BY m.id,m."orderId",m."itemId",i.sku,i.name,i.unit,m."quantityRequired" ORDER BY lower(i.name)`),
  database.query(`SELECT id::text AS id,"orderId"::text AS "orderId",action,"actorName","actorRole",detail,"createdAt" FROM "ManufacturingOrderAudit" WHERE "orderId"=ANY($1::uuid[]) ORDER BY id DESC LIMIT 600`,[ids]),
  database.query(`SELECT s.id::text AS id,s."orderId"::text AS "orderId",s.sequence,s."stageName",s."operatorName",s."machineName",s."materialUsed",s."durationMinutes",s.result,s.notes,coalesce(h.email,e."fullName") AS "recordedBy",s."createdAt" FROM "ManufacturingStageRecord" s LEFT JOIN "HRUser" h ON h.id=s."recordedBy" LEFT JOIN "Employee" e ON e.id=s."recordedByEmployeeId" WHERE s."orderId"=ANY($1::uuid[]) ORDER BY s."orderId",s.sequence DESC`,[ids]),
  database.query(`SELECT q.id::text AS id,q."orderId"::text AS "orderId",q.decision,q.evidence,h.email AS "inspectorName",q."createdAt" FROM "ManufacturingQualityReview" q JOIN "HRUser" h ON h.id=q."inspectedBy" WHERE q."orderId"=ANY($1::uuid[]) ORDER BY q."orderId",q."createdAt" DESC,q.id DESC`,[ids]),
 ]):[[],[],[],[]];
 const sourceRows=planIds.length?await database.query(`SELECT f."planId",f."caseFileId",cf.name AS "standardName",cf.mime AS "standardMime",cf.size AS "standardSize",f."largeFileId",lf."originalName" AS "largeName",lf.mime AS "largeMime",lf."sizeBytes" AS "largeSize" FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=ANY($1::text[]) ORDER BY f.id`,[planIds]):[];
 const filesByPlan=new Map<string,ManufacturingSourceFile[]>();
 for(const file of sourceRows){const name=String(file.standardName??file.largeName??'Clinical source file');const decoded=decodeRecordFilename(name);const planId=String(file.planId);const current=filesByPlan.get(planId)??[];current.push({id:String(file.caseFileId??file.largeFileId),recordType:decoded.recordType,name:decoded.filename,mime:String(file.standardMime??file.largeMime??'application/octet-stream'),sizeBytes:Number(file.standardSize??file.largeSize??0)});filesByPlan.set(planId,current);}
 const materialsByOrder=new Map<string,ManufacturingMaterial[]>();
 for(const row of materialRows){const id=String(row.orderId);const current=materialsByOrder.get(id)??[];current.push({itemId:String(row.itemId),sku:String(row.sku),name:String(row.name),unit:String(row.unit),quantityRequired:Number(row.quantityRequired),available:Number(row.available),reserved:Number(row.reserved)});materialsByOrder.set(id,current);}
 const activityByOrder=new Map<string,ManufacturingAudit[]>();
 for(const row of auditRows){const id=String(row.orderId);const current=activityByOrder.get(id)??[];current.push({id:String(row.id),action:String(row.action),actorName:String(row.actorName),actorRole:String(row.actorRole),detail:row.detail&&typeof row.detail==='object'?row.detail as Record<string,unknown>:{},createdAt:iso(row.createdAt)});activityByOrder.set(id,current);}
 const stagesByOrder=new Map<string,ManufacturingStage[]>();
 for(const row of stageRows){const id=String(row.orderId);const current=stagesByOrder.get(id)??[];current.push({id:String(row.id),sequence:Number(row.sequence),stageName:String(row.stageName),operatorName:String(row.operatorName),machineName:String(row.machineName),materialUsed:String(row.materialUsed),durationMinutes:Number(row.durationMinutes),result:String(row.result) as ManufacturingStage['result'],notes:String(row.notes??''),recordedBy:String(row.recordedBy),createdAt:iso(row.createdAt)});stagesByOrder.set(id,current);}
 const qualityByOrder=new Map<string,ManufacturingQualityReview[]>();
 for(const row of qualityRows){const id=String(row.orderId);const current=qualityByOrder.get(id)??[];current.push({id:String(row.id),decision:String(row.decision) as ManufacturingQualityReview['decision'],evidence:String(row.evidence),inspectorName:String(row.inspectorName),createdAt:iso(row.createdAt)});qualityByOrder.set(id,current);}
 const orders:ManufacturingOrder[]=rows.map(row=>{const decoded=decodeCaseIntake(String(row.caseNotes??''));return {id:String(row.id),orderNumber:String(row.orderNumber),caseId:String(row.caseId),patientReference:String(row.patientReference),doctorName:String(row.doctorName),clinicName:String(row.clinicName),caseType:String(row.caseType),caseNotes:decoded.notes,intake:decoded.intake,planSummary:String(row.planSummary??''),sourceFiles:filesByPlan.get(String(row.planId))??[],planVersion:Number(row.planVersion),status:String(row.status),approvedAt:iso(row.approvedAt),approvedDoctorId:String(row.approvedDoctorId),artifactSha256:String(row.artifactSha256),materials:materialsByOrder.get(String(row.id))??[],stages:stagesByOrder.get(String(row.id))??[],qualityReviews:qualityByOrder.get(String(row.id))??[],materialCheckedAt:nullableIso(row.materialCheckedAt),materialEvidence:String(row.materialEvidence??''),commercialReference:String(row.commercialReference??''),commercialEvidence:String(row.commercialEvidence??''),commercialCheckedAt:nullableIso(row.commercialCheckedAt),workCenter:String(row.workCenter??''),capacityReference:String(row.capacityReference??''),scheduledFor:row.scheduledFor?String(row.scheduledFor):null,dueDate:row.dueDate?String(row.dueDate):null,capacityCheckedAt:nullableIso(row.capacityCheckedAt),queuePosition:row.queuePosition===null?null:Number(row.queuePosition),currency:row.currency===null?null:String(row.currency),materialCost:row.materialCost===null?null:Number(row.materialCost),laborCost:row.laborCost===null?null:Number(row.laborCost),otherCost:row.otherCost===null?null:Number(row.otherCost),totalCost:row.totalCost===null?null:Number(row.totalCost),costedAt:nullableIso(row.costedAt),activity:activityByOrder.get(String(row.id))??[]};});
 const catalog:ManufacturingCatalogItem[]=catalogRows.map(row=>({id:String(row.id),sku:String(row.sku),name:String(row.name),unit:String(row.unit),available:Number(row.available),reserved:Number(row.reserved)}));
 return {ready:true,orders,catalog};
}

export type ProductionOperatorOrder={id:string;orderNumber:string;planVersion:number;caseType:string;workCenter:string;scheduledFor:string|null;dueDate:string|null;queuePosition:number|null;stages:ManufacturingStage[]};
function requireProductionOperator(actor:WorkActor){
 if(!actor.employeeId||actor.role!=='PRODUCTION_OPERATOR'||actor.mustChangePassword)throw new PortalError(403,'An active Production Operator employee account is required.');
 return actor;
}
export async function productionOperatorDashboard(actorInput:WorkActor,database:Database=db){
 const actor=requireProductionOperator(actorInput);
 const [identity]=await database.query(`SELECT e."fullName" FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id WHERE e.id=$1 AND e.status='ACTIVE' AND w.id=$2 AND w.role='PRODUCTION_OPERATOR' AND w."isActive" AND NOT w."mustChangePassword"`,[actor.employeeId,actor.id]);
 if(!identity)throw new PortalError(403,'Your Production Operator access is not active. Contact HR.');
 const orders=await database.query(`SELECT mo.id::text AS id,mo."orderNumber",mo."planVersion",c.category AS "caseType",mo."workCenter",mo."scheduledFor"::text AS "scheduledFor",mo."dueDate"::text AS "dueDate",mo."queuePosition"
  FROM "ManufacturingOrder" mo JOIN "PortalCase" c ON c.id=mo."caseId" JOIN "TreatmentPlan" p ON p.id=mo."planId"
  WHERE mo.status='QUEUED' AND p.decision='APPROVED' AND p.version=mo."planVersion"
    AND p."approvedByDoctorId"=mo."approvedDoctorId"
    AND EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=p.id AND r.status='APPROVED' AND r."independenceVerified")
    AND EXISTS(SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a."actorId"=mo."approvedDoctorId" AND a.detail->>'decision'='APPROVED' AND a.detail->>'artifactSha256'=mo."artifactSha256")
    AND p.version=(SELECT max(latest.version) FROM "TreatmentPlan" latest WHERE latest."caseId"=c.id)
  ORDER BY mo."dueDate" NULLS LAST,mo."queuePosition" NULLS LAST,mo."createdAt" LIMIT 200`);
 const ids=orders.map(row=>String(row.id));
 const history=ids.length?await database.query(`SELECT s.id::text AS id,s."orderId"::text AS "orderId",s.sequence,s."stageName",s."operatorName",s."machineName",s."materialUsed",s."durationMinutes",s.result,s.notes,coalesce(h.email,e."fullName") AS "recordedBy",s."createdAt" FROM "ManufacturingStageRecord" s LEFT JOIN "HRUser" h ON h.id=s."recordedBy" LEFT JOIN "Employee" e ON e.id=s."recordedByEmployeeId" WHERE s."orderId"=ANY($1::uuid[]) ORDER BY s."orderId",s.sequence DESC`,[ids]):[];
 const stages=new Map<string,ManufacturingStage[]>();
 for(const row of history){const key=String(row.orderId),list=stages.get(key)??[];list.push({id:String(row.id),sequence:Number(row.sequence),stageName:String(row.stageName),operatorName:String(row.operatorName),machineName:String(row.machineName),materialUsed:String(row.materialUsed),durationMinutes:Number(row.durationMinutes),result:String(row.result) as ManufacturingStage['result'],notes:String(row.notes??''),recordedBy:String(row.recordedBy??'Authorized operator'),createdAt:iso(row.createdAt)});stages.set(key,list);}
 return {operatorName:String(identity.fullName),orders:orders.map(row=>({id:String(row.id),orderNumber:String(row.orderNumber),planVersion:Number(row.planVersion),caseType:String(row.caseType),workCenter:String(row.workCenter),scheduledFor:row.scheduledFor?String(row.scheduledFor):null,dueDate:row.dueDate?String(row.dueDate):null,queuePosition:row.queuePosition===null?null:Number(row.queuePosition),stages:stages.get(String(row.id))??[]} satisfies ProductionOperatorOrder))};
}

export async function recordOperatorProductionStage(input:unknown,actorInput:WorkActor,database:Database=db){
 const actor=requireProductionOperator(actorInput),parsed=operatorStage.safeParse(input);
 if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the production stage details.');
 const body=parsed.data;
 return database.transaction(async tx=>{
  const [identity]=await tx.query(`SELECT e."fullName" FROM "Employee" e JOIN "WorkAccount" w ON w."employeeId"=e.id WHERE e.id=$1 AND e.status='ACTIVE' AND w.id=$2 AND w.role='PRODUCTION_OPERATOR' AND w."isActive" AND NOT w."mustChangePassword" FOR SHARE OF e,w`,[actor.employeeId,actor.id]);
  if(!identity)throw new PortalError(403,'Your Production Operator access is not active. Contact HR.');
  const [order]=await tx.query(`SELECT mo."orderNumber",mo.status,p.decision,p.version,p."approvedByDoctorId",mo."planVersion",mo."approvedDoctorId",mo."artifactSha256",
    (SELECT max(latest.version) FROM "TreatmentPlan" latest WHERE latest."caseId"=c.id) AS "latestVersion",
    EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=p.id AND r.status='APPROVED' AND r."independenceVerified") AS "clinicalApproved",
    EXISTS(SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a."actorId"=mo."approvedDoctorId" AND a.detail->>'decision'='APPROVED' AND a.detail->>'artifactSha256'=mo."artifactSha256") AS "doctorApprovalRecorded"
    FROM "ManufacturingOrder" mo JOIN "PortalCase" c ON c.id=mo."caseId" JOIN "TreatmentPlan" p ON p.id=mo."planId" WHERE mo.id=$1 FOR UPDATE OF mo`,[body.orderId]);
  if(!order)throw new PortalError(404,'Manufacturing order not found.');
  if(order.status!=='QUEUED'||order.decision!=='APPROVED'||Number(order.planVersion)!==Number(order.latestVersion)||Number(order.planVersion)!==Number(order.version)||String(order.approvedDoctorId)!==String(order.approvedByDoctorId)||order.clinicalApproved!==true||order.doctorApprovalRecorded!==true)throw new PortalError(409,'This order is no longer eligible for production. Refresh the operator screen.');
  const [last]=await tx.query(`SELECT coalesce(max(sequence),0)+1 AS next FROM "ManufacturingStageRecord" WHERE "orderId"=$1`,[body.orderId]);
  const sequence=Number(last.next);if(sequence>10000)throw new PortalError(409,'This order reached the production stage history limit.');
  const verifiedOperator=String(identity.fullName);
  const [stage]=await tx.query(`INSERT INTO "ManufacturingStageRecord"("orderId",sequence,"stageName","operatorName","machineName","materialUsed","durationMinutes",result,notes,"recordedByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text AS id,"createdAt"`,[body.orderId,sequence,body.stageName,verifiedOperator,body.machineName,body.materialUsed,body.durationMinutes,body.result,body.notes,actor.employeeId]);
  await tx.query(`INSERT INTO "ManufacturingOrderAudit"("orderId",action,"actorId","actorName","actorRole",detail) VALUES($1,'PRODUCTION_STAGE_RECORDED',$2,$3,$4,$5::jsonb)`,[body.orderId,actor.id,verifiedOperator,'PRODUCTION_OPERATOR',JSON.stringify({stageId:stage.id,sequence,stageName:body.stageName,operatorName:verifiedOperator,machineName:body.machineName,materialUsed:body.materialUsed,durationMinutes:body.durationMinutes,result:body.result,notes:body.notes,recordedAt:iso(stage.createdAt)})]);
  return {message:`Stage ${sequence} recorded for ${String(order.orderNumber)}.`};
 });
}

async function audit(tx:Database,orderIdValue:string,actor:{id:string;email:string;role:string},action:string,detail:Record<string,unknown>){
 await tx.query(`INSERT INTO "ManufacturingOrderAudit"("orderId",action,"actorId","actorName","actorRole",detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[orderIdValue,action,actor.id,actor.email,actor.role,JSON.stringify(detail)]);
}

export async function manageManufacturingOrder(input:unknown,actorInput:ProductionActor,database:Database=db){
 const actor=authorize(actorInput);const parsed=actionSchema.safeParse(input);
 if(!parsed.success)throw new PortalError(400,parsed.error.issues[0]?.message??'Check the manufacturing order details.');
 const body=parsed.data;
 return database.transaction(async tx=>{
  const [order]=await tx.query(`SELECT mo.*,c."clinicId",p.decision,p.version AS "currentVersion",p."approvedByDoctorId",
    (SELECT max(latest.version) FROM "TreatmentPlan" latest WHERE latest."caseId"=c.id) AS "latestVersion",
    EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=p.id AND r.status='APPROVED' AND r."independenceVerified") AS "clinicalApproved",
    EXISTS(SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a."actorId"=mo."approvedDoctorId" AND a.detail->>'decision'='APPROVED' AND a.detail->>'artifactSha256'=mo."artifactSha256") AS "doctorApprovalRecorded"
   FROM "ManufacturingOrder" mo JOIN "PortalCase" c ON c.id=mo."caseId" JOIN "TreatmentPlan" p ON p.id=mo."planId" WHERE mo.id=$1 FOR UPDATE OF mo`,[body.orderId]);
  if(!order)throw new PortalError(404,'Manufacturing order not found.');
  const oid=String(order.id),number=String(order.orderNumber),caseId=String(order.caseId);
  if(body.action!=='release_superseded_materials'&&(order.decision!=='APPROVED'||Number(order.planVersion)!==Number(order.latestVersion)||Number(order.planVersion)!==Number(order.currentVersion)||String(order.approvedDoctorId)!==String(order.approvedByDoctorId)||order.clinicalApproved!==true||order.doctorApprovalRecorded!==true))throw new PortalError(409,'This order no longer matches the latest internally reviewed and doctor-approved plan. Refresh the production register.');
  if(body.action==='release_superseded_materials'){
   if(order.status!=='SUPERSEDED')throw new PortalError(409,'Only a superseded plan order can release its held materials.');
   const held=await tx.query(`SELECT res.id::text AS id,res."materialId"::text AS "materialId",res."quantityReserved",im."itemId"::text AS "itemId",im."locationId"::text AS "locationId",im."lotId"::text AS "lotId",i.name FROM "ManufacturingOrderReservation" res JOIN "InventoryMovement" im ON im.id=res."movementId" JOIN "InventoryItem" i ON i.id=im."itemId" WHERE res."orderId"=$1 AND res."releaseMovementId" IS NULL ORDER BY im."itemId",im."locationId",im."lotId" FOR UPDATE OF res`,[oid]);
   const itemIds=[...new Set(held.map(row=>String(row.itemId)))];
   if(itemIds.length)await tx.query(`SELECT id FROM "InventoryItem" WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,[itemIds]);
   const byItem=new Map<string,number>();for(const row of held)byItem.set(String(row.itemId),(byItem.get(String(row.itemId))??0)+Number(row.quantityReserved));
   const balanceAfter=new Map<string,number>();
   for(const [itemId,quantity] of byItem){
    const [reserved]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity-$2,"updatedAt"=now() WHERE "itemId"=$1 AND state='RESERVED' AND quantity >= $2 RETURNING quantity`,[itemId,quantity]);
    const [available]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity+$2,"updatedAt"=now() WHERE "itemId"=$1 AND state='AVAILABLE' AND quantity <= 1000000000-$2 RETURNING quantity`,[itemId,quantity]);
    if(!reserved||!available)throw new PortalError(409,'Reserved inventory changed. Ask an inventory manager to reconcile the stock ledger.');
    await tx.query(`UPDATE "InventoryItem" SET "onHand"=$2,"updatedAt"=now() WHERE id=$1`,[itemId,available.quantity]);
    // Start from the pre-release available balance. Each UNRESERVE movement
    // below records the actual running balance after that individual release.
    balanceAfter.set(itemId,Number(available.quantity)-quantity);
   }
   for(const row of held){
    const quantity=Number(row.quantityReserved),itemId=String(row.itemId);
    const [source]=await tx.query(`UPDATE "InventoryLocationBalance" SET quantity=quantity-$2,"updatedAt"=now() WHERE "itemId"=$1 AND "locationId"=$3 AND "lotId" IS NOT DISTINCT FROM $4::uuid AND state='RESERVED' AND quantity >= $2 RETURNING quantity`,[itemId,quantity,row.locationId,row.lotId]);
    if(!source)throw new PortalError(409,'Reserved location stock changed. Ask an inventory manager to reconcile the stock ledger.');
    const available=await tx.query(`INSERT INTO "InventoryLocationBalance"("itemId","locationId","lotId",state,quantity) VALUES($1,$2,$3,'AVAILABLE',$4) ON CONFLICT ("itemId","locationId","lotId",state) DO UPDATE SET quantity="InventoryLocationBalance".quantity+EXCLUDED.quantity,"updatedAt"=now() WHERE "InventoryLocationBalance".quantity <= 1000000000-EXCLUDED.quantity RETURNING id`,[itemId,row.locationId,row.lotId,quantity]);
    if(!available.length)throw new PortalError(409,'Available location stock limit exceeded during release.');
    const runningAvailable=(balanceAfter.get(itemId)??0)+quantity;
    const [movement]=await tx.query(`INSERT INTO "InventoryMovement"("itemId","requestId",kind,"fromState","toState",quantity,"balanceAfter",reference,note,"actorId","locationId","lotId","caseId","productionReference") VALUES($1,$2,'UNRESERVE','RESERVED','AVAILABLE',$3,$4,$5,$6,$7,$8,$9,$10,$5) RETURNING id`,[itemId,randomUUID(),quantity,runningAvailable,number,`Released from superseded manufacturing order ${number}`,actor.id,row.locationId,row.lotId,caseId]);
    await tx.query(`UPDATE "ManufacturingOrderReservation" SET "releaseMovementId"=$2 WHERE id=$1`,[row.id,movement.id]);
    balanceAfter.set(itemId,runningAvailable);
   }
   await audit(tx,oid,actor,'SUPERSEDED_MATERIALS_RELEASED',{releasedReservations:held.length,orderNumber:number});
   return {message:`Released ${held.length} held material reservation${held.length===1?'':'s'} to available inventory.`};
  }
  if(body.action==='set_materials'){
   if(order.status!=='MATERIAL_CHECK'||order.materialCheckedAt)throw new PortalError(409,'Materials are locked after the material check passes.');
   for(const line of body.materials){const [item]=await tx.query(`SELECT id FROM "InventoryItem" WHERE id=$1`,[line.itemId]);if(!item)throw new PortalError(400,'One selected inventory item is no longer available.');}
   await tx.query(`DELETE FROM "ManufacturingOrderMaterial" WHERE "orderId"=$1`,[oid]);
   for(const line of body.materials)await tx.query(`INSERT INTO "ManufacturingOrderMaterial"("orderId","itemId","quantityRequired") VALUES($1,$2,$3)`,[oid,line.itemId,line.quantity]);
   await audit(tx,oid,actor,'MATERIAL_REQUIREMENTS_SET',{lines:body.materials.length,planVersion:Number(order.planVersion)});
   return {message:'Material requirements saved. Confirm the check to reserve available stock.'};
  }
  if(body.action==='check_materials'){
   if(order.status!=='MATERIAL_CHECK'||order.materialCheckedAt)throw new PortalError(409,'This material check is already complete.');
    const materials=await tx.query(`SELECT m.id::text AS id,m."itemId"::text AS "itemId",m."quantityRequired",i."trackLot",i."trackExpiry",i.name FROM "ManufacturingOrderMaterial" m JOIN "InventoryItem" i ON i.id=m."itemId" WHERE m."orderId"=$1 ORDER BY m."itemId" FOR UPDATE OF i`,[oid]);
   if(!materials.length)throw new PortalError(409,'Add the approved plan’s required materials before checking stock.');
   const allocations:{materialId:string;itemId:string;balanceId:string;locationId:string;lotId:string|null;quantity:number}[]=[];
   for(const material of materials){
    let remaining=Number(material.quantityRequired);
    const balances=await tx.query(`SELECT b.id,b."locationId"::text AS "locationId",b."lotId"::text AS "lotId",b.quantity,l.name AS "locationName",lot."expiresOn"::text AS "expiresOn"
      FROM "InventoryLocationBalance" b JOIN "InventoryLocation" l ON l.id=b."locationId" LEFT JOIN "InventoryLot" lot ON lot.id=b."lotId"
      WHERE b."itemId"=$1 AND b.state='AVAILABLE' AND b.quantity>0 AND l.active=true
        AND (NOT $2::boolean OR b."lotId" IS NOT NULL)
        AND (NOT $3::boolean OR lot."expiresOn" IS NOT NULL)
        AND (lot."expiresOn" IS NULL OR lot."expiresOn">current_date)
      ORDER BY lot."expiresOn" NULLS LAST,l.name,b.id FOR UPDATE OF b`,[material.itemId,material.trackLot===true,material.trackExpiry===true]);
    const available=balances.reduce((sum,row)=>sum+Number(row.quantity),0);
    if(available<remaining)throw new PortalError(409,`Not enough available ${String(material.name)} stock for this order (${available} available, ${remaining} required).`);
    for(const balance of balances){if(remaining<=0)break;const quantity=Math.min(remaining,Number(balance.quantity));allocations.push({materialId:String(material.id),itemId:String(material.itemId),balanceId:String(balance.id),locationId:String(balance.locationId),lotId:balance.lotId===null?null:String(balance.lotId),quantity});remaining-=quantity;}
   }
   const availableAfterByItem=new Map<string,number>();
   for(const material of materials){
    const quantity=Number(material.quantityRequired);
    const [from]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity-$2,"updatedAt"=now() WHERE "itemId"=$1 AND state='AVAILABLE' AND quantity >= $2 RETURNING quantity`,[material.itemId,quantity]);
    const [to]=await tx.query(`UPDATE "InventoryStockState" SET quantity=quantity+$2,"updatedAt"=now() WHERE "itemId"=$1 AND state='RESERVED' AND quantity <= 1000000000-$2 RETURNING quantity`,[material.itemId,quantity]);
    if(!from||!to)throw new PortalError(409,'Inventory totals changed during the check. Refresh and retry.');
    availableAfterByItem.set(String(material.itemId),Number(from.quantity)+quantity);
    await tx.query(`UPDATE "InventoryItem" SET "onHand"=$2,"updatedAt"=now() WHERE id=$1`,[material.itemId,Number(from.quantity)]);
   }
   for(const allocation of allocations){
    const [available]=await tx.query(`UPDATE "InventoryLocationBalance" SET quantity=quantity-$2,"updatedAt"=now() WHERE id=$1 AND quantity >= $2 RETURNING quantity`,[allocation.balanceId,allocation.quantity]);
    if(!available)throw new PortalError(409,'A stock location changed during the check. Refresh and retry.');
    const reserved=await tx.query(`INSERT INTO "InventoryLocationBalance"("itemId","locationId","lotId",state,quantity) VALUES($1,$2,$3,'RESERVED',$4) ON CONFLICT ("itemId","locationId","lotId",state) DO UPDATE SET quantity="InventoryLocationBalance".quantity+EXCLUDED.quantity,"updatedAt"=now() WHERE "InventoryLocationBalance".quantity <= 1000000000-EXCLUDED.quantity RETURNING id`,[allocation.itemId,allocation.locationId,allocation.lotId,allocation.quantity]);
    if(!reserved.length)throw new PortalError(409,'The reserved stock limit would be exceeded.');
    const availableAfter=(availableAfterByItem.get(allocation.itemId)??allocation.quantity)-allocation.quantity;
    availableAfterByItem.set(allocation.itemId,availableAfter);
    const [movement]=await tx.query(`INSERT INTO "InventoryMovement"("itemId","requestId",kind,"fromState","toState",quantity,"balanceAfter",reference,note,"actorId","locationId","lotId","caseId","productionReference") VALUES($1,$2,'RESERVE','AVAILABLE','RESERVED',$3,$4,$5,$6,$7,$8,$9,$10,$5) RETURNING id`,[allocation.itemId,randomUUID(),allocation.quantity,availableAfter,number,`Reserved for manufacturing order ${number}`,actor.id,allocation.locationId,allocation.lotId,caseId]);
    await tx.query(`INSERT INTO "ManufacturingOrderReservation"("orderId","materialId","movementId","quantityReserved") VALUES($1,$2,$3,$4)`,[oid,allocation.materialId,movement.id,allocation.quantity]);
   }
   await tx.query(`UPDATE "ManufacturingOrder" SET status='COMMERCIAL_CHECK',"materialCheckedBy"=$2,"materialCheckedAt"=now(),"materialEvidence"=$3 WHERE id=$1`,[oid,actor.id,body.evidence]);
   await audit(tx,oid,actor,'MATERIAL_CHECK_PASSED',{evidence:body.evidence,reservations:allocations.map(a=>({itemId:a.itemId,locationId:a.locationId,lotId:a.lotId,quantity:a.quantity}))});
   await recordCaseActivity(tx,caseId,String(order.clinicId),`Materials reserved for ${number}`,{actor:{id:actor.id,name:actor.email,role:'PRODUCTION_MANAGER'},action:'manufacturing_materials_reserved',fromStatus:'APPROVED',status:'APPROVED',notes:null});
   return {message:'Material check passed. Required available stock has been reserved.'};
  }
  if(body.action==='commercial_check'){
   if(order.status!=='COMMERCIAL_CHECK'||order.commercialCheckedAt)throw new PortalError(409,'Complete the material check before the commercial check.');
   await tx.query(`UPDATE "ManufacturingOrder" SET status='CAPACITY_CHECK',"commercialReference"=$2,"commercialEvidence"=$3,"commercialCheckedBy"=$4,"commercialCheckedAt"=now() WHERE id=$1`,[oid,body.reference,body.evidence,actor.id]);
   await audit(tx,oid,actor,'COMMERCIAL_CHECK_PASSED',{reference:body.reference,evidence:body.evidence});
   return {message:'Commercial check passed and recorded.'};
  }
  if(body.action==='capacity_check'){
   if(order.status!=='CAPACITY_CHECK'||order.capacityCheckedAt)throw new PortalError(409,'Complete the commercial check before capacity and scheduling.');
   if(body.dueDate<body.scheduledFor)throw new PortalError(400,'Due date must be on or after the scheduled production date.');
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['allen_manufacturing_queue']);
   const [queue]=await tx.query(`SELECT coalesce(max("queuePosition"),0)+1 AS next FROM "ManufacturingOrder"`);
   const position=Number(queue.next);
   await tx.query(`UPDATE "ManufacturingOrder" SET status='QUEUED',"workCenter"=$2,"capacityReference"=$3,"scheduledFor"=$4,"dueDate"=$5,"capacityCheckedBy"=$6,"capacityCheckedAt"=now(),"queuePosition"=$7 WHERE id=$1`,[oid,body.workCenter,body.capacityReference,body.scheduledFor,body.dueDate,actor.id,position]);
   await audit(tx,oid,actor,'CAPACITY_CONFIRMED_AND_QUEUED',{workCenter:body.workCenter,capacityReference:body.capacityReference,scheduledFor:body.scheduledFor,dueDate:body.dueDate,queuePosition:position});
   return {message:`Capacity recorded. Order added to queue at position ${position}.`};
  }
  if(body.action==='record_stage'){
   if(order.status!=='QUEUED')throw new PortalError(409,'Production stages can be recorded after an order has passed checks and entered the queue.');
   const [last]=await tx.query(`SELECT coalesce(max(sequence),0)+1 AS next FROM "ManufacturingStageRecord" WHERE "orderId"=$1`,[oid]);
   const sequence=Number(last.next);
   if(sequence>10000)throw new PortalError(409,'This order reached the production stage history limit.');
   const [stage]=await tx.query(`INSERT INTO "ManufacturingStageRecord"("orderId",sequence,"stageName","operatorName","machineName","materialUsed","durationMinutes",result,notes,"recordedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text AS id,"createdAt"`,[oid,sequence,body.stageName,body.operatorName,body.machineName,body.materialUsed,body.durationMinutes,body.result,body.notes,actor.id]);
   await audit(tx,oid,actor,'PRODUCTION_STAGE_RECORDED',{stageId:stage.id,sequence,stageName:body.stageName,operatorName:body.operatorName,machineName:body.machineName,materialUsed:body.materialUsed,durationMinutes:body.durationMinutes,result:body.result,notes:body.notes,recordedAt:iso(stage.createdAt)});
   return {message:`Stage ${sequence} recorded in the manufacturing history.`};
  }
  if(body.action==='quality_review'){
   if(!['QUEUED','QUALITY_HOLD'].includes(String(order.status)))throw new PortalError(409,'Only an order in production or quality hold can receive an inspection review.');
   if(!order.costedAt)throw new PortalError(409,'Record production costing before final quality inspection.');
   const [caseStatus]=await tx.query(`SELECT status FROM "PortalCase" WHERE id=$1`,[caseId]);
   if(caseStatus?.status!=='IN_PRODUCTION')throw new PortalError(409,'The case must be in production before Module 18 can use final quality results.');
   const qcRows=await tx.query(`SELECT DISTINCT ON (stage) stage,disposition,inspector,notes,"createdAt" FROM "ProductionQCInspection" WHERE "caseId"=$1 AND "planId"=$2 AND stage IN ('INCOMING','IN_PROCESS','FINAL') ORDER BY stage,"createdAt" DESC,id DESC`,[caseId,String(order.planId)]);
   const qcByStage=new Map(qcRows.map((row:Record<string,unknown>)=>[String(row.stage),row]));
   const finalQc=qcByStage.get('FINAL');
   if(!finalQc)throw new PortalError(409,'Record Final QC against this exact approved plan before updating Module 18.');
   if(body.decision==='PASS'&&(finalQc.disposition!=='PASS'||!['INCOMING','IN_PROCESS'].every(stage=>qcByStage.get(stage)?.disposition==='PASS')))throw new PortalError(409,'Module 18 release requires current-plan PASS results for Incoming, In-Process, and Final QC.');
   if(body.decision==='REWORK'&&finalQc.disposition!=='REWORK')throw new PortalError(409,'Record REWORK in the official Final QC inspection before returning this order to production.');
   if(body.decision==='FAIL'&&!['HOLD','REJECT'].includes(String(finalQc.disposition)))throw new PortalError(409,'Record HOLD or REJECT in the official Final QC inspection before placing this order on quality hold.');
   const [lastStage]=await tx.query(`SELECT result,"createdAt" FROM "ManufacturingStageRecord" WHERE "orderId"=$1 ORDER BY sequence DESC LIMIT 1`,[oid]);
   if(!lastStage)throw new PortalError(409,'Record at least one production stage before final inspection.');
   const [lastReview]=await tx.query(`SELECT decision,"createdAt" FROM "ManufacturingQualityReview" WHERE "orderId"=$1 ORDER BY "createdAt" DESC,id DESC LIMIT 1`,[oid]);
   const stageIsNewer=!lastReview||new Date(iso(lastStage.createdAt)).getTime()>new Date(iso(lastReview.createdAt)).getTime();
   if(body.decision==='PASS'&&(lastStage.result!=='PASS'||!stageIsNewer))throw new PortalError(409,'A passing production stage recorded after the latest inspection is required before release.');
   if(body.decision==='FAIL'&&order.status==='QUALITY_HOLD')throw new PortalError(409,'This order is already on quality hold. Record a rework disposition to return it to production.');
   const status=body.decision==='PASS'?'RELEASED':body.decision==='FAIL'?'QUALITY_HOLD':'QUEUED';
   const [review]=await tx.query(`INSERT INTO "ManufacturingQualityReview"("orderId",decision,evidence,"inspectedBy") VALUES($1,$2,$3,$4) RETURNING id::text AS id,"createdAt"`,[oid,body.decision,body.evidence,actor.id]);
   await tx.query(`UPDATE "ManufacturingOrder" SET status=$2 WHERE id=$1`,[oid,status]);
   await audit(tx,oid,actor,'FINAL_QUALITY_REVIEW_RECORDED',{reviewId:review.id,decision:body.decision,evidence:body.evidence,officialFinalQc:{stage:finalQc.stage,disposition:finalQc.disposition,inspector:finalQc.inspector,createdAt:iso(finalQc.createdAt),notes:finalQc.notes},inspectedAt:iso(review.createdAt),resultingStatus:status});
   if(body.decision==='PASS')await recordCaseActivity(tx,caseId,String(order.clinicId),`Manufacturing order ${number} passed final quality release`,{actor:{id:actor.id,name:actor.email,role:'PRODUCTION_MANAGER'},action:'manufacturing_quality_released',fromStatus:'APPROVED',status:'APPROVED',notes:body.evidence});
   return {message:body.decision==='PASS'?'Final quality passed. Order released.':body.decision==='REWORK'?'Rework required. Order returned to production.':'Quality failed. Order placed on hold.'};
  }
  if(!['QUEUED','RELEASED'].includes(String(order.status)))throw new PortalError(409,'Costing is recorded after the order enters production.');
  const materialCost=Math.round(body.materialCost*100)/100,laborCost=Math.round(body.laborCost*100)/100,otherCost=Math.round(body.otherCost*100)/100;
  const total=Math.round((materialCost+laborCost+otherCost)*100)/100;
  if(!Number.isFinite(total)||total>999999999999)throw new PortalError(400,'Total cost exceeds the supported amount.');
  await tx.query(`UPDATE "ManufacturingOrder" SET currency=$2,"materialCost"=$3,"laborCost"=$4,"otherCost"=$5,"totalCost"=$6,"costedBy"=$7,"costedAt"=now() WHERE id=$1`,[oid,body.currency,materialCost,laborCost,otherCost,total,actor.id]);
  await audit(tx,oid,actor,'COSTING_RECORDED',{currency:body.currency,materialCost,laborCost,otherCost,totalCost:total});
  return {message:'Order costing recorded.'};
 });
}
