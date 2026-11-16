import 'server-only';
import { z } from 'zod';
import { db,type Database } from './database';
import { PortalError } from './portal-http';

export type ComplaintActor={id:string;role:string}|null;
const base={
 receivedDate:z.iso.date(),source:z.enum(['DOCTOR','CLINIC','LABORATORY','PATIENT','REGULATORY','INTERNAL','OTHER']),
 complainantName:z.string().trim().min(2,'Enter the complainant name.').max(200),
 complainantEmail:z.union([z.literal(''),z.email().max(254)]).default(''),complainantPhone:z.string().trim().max(40).default(''),
 productReference:z.string().trim().max(120).default(''),lotReference:z.string().trim().max(120).default(''),
 caseId:z.union([z.literal(''),z.uuid()]).default(''),description:z.string().trim().min(10,'Describe the complaint in at least 10 characters.').max(10000),
 riskLevel:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),riskAssessment:z.string().trim().max(5000).default(''),
 investigationOwner:z.string().trim().max(200).default(''),investigationFindings:z.string().trim().max(10000).default(''),rootCause:z.string().trim().max(5000).default(''),
 capaRequired:z.boolean().default(false),capaId:z.union([z.literal(''),z.uuid()]).default(''),capaRationale:z.string().trim().max(3000).default(''),
 regulatoryOutcome:z.enum(['NOT_ASSESSED','NOT_REPORTABLE','REPORTABLE','CONSULT_REQUIRED']).default('NOT_ASSESSED'),
 regulatoryAssessment:z.string().trim().max(5000).default(''),closureSummary:z.string().trim().max(5000).default(''),
};
const createSchema=z.object(base).strict();
const updateSchema=z.object({...base,status:z.enum(['RECEIVED','RISK_ASSESSED','INVESTIGATING','CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED','CANCELLED']),actionNote:z.string().trim().min(5,'Add a note describing this update.').max(2000)}).strict();
const uuid=z.uuid();const writable=['HR_ADMIN','HR_OFFICER'];
function authorize(actor:ComplaintActor,write=false):asserts actor is NonNullable<ComplaintActor>{
 if(!actor?.id||!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(actor.role))throw new PortalError(actor?403:401,actor?'HR permission required.':'Please sign in to access complaint management.');
 if(write&&!writable.includes(actor.role))throw new PortalError(403,'HR Admin or HR Officer permission is required to manage complaints.');
}
export async function complaintList(actor:ComplaintActor,database:Database=db){
 authorize(actor);
 const [records,audit,capas]=await Promise.all([
  database.query(`SELECT id,"receivedDate"::text AS "receivedDate",source,"complainantName","complainantEmail","complainantPhone","productReference","lotReference","caseId",description,"riskLevel","riskAssessment","investigationOwner","investigationFindings","rootCause","capaRequired","capaId","capaRationale","regulatoryOutcome","regulatoryAssessment","closureSummary",status,"createdAt","updatedAt","closedAt" FROM "QualityComplaint" ORDER BY CASE status WHEN 'CLOSED' THEN 2 WHEN 'CANCELLED' THEN 3 ELSE 0 END,"receivedDate" DESC,"createdAt" DESC LIMIT 1000`),
  database.query(`SELECT a.id,a."complaintId",c."complainantName",c."productReference",c."lotReference",a.action,a.detail,a."createdAt",h.email AS "actorEmail" FROM "QualityComplaintAudit" a JOIN "QualityComplaint" c ON c.id=a."complaintId" JOIN "HRUser" h ON h.id=a."actorId" ORDER BY a."createdAt" DESC,a.id DESC LIMIT 300`),
  database.query(`SELECT id,title,status FROM "CAPA" WHERE status NOT IN ('CANCELLED') ORDER BY "createdAt" DESC LIMIT 500`),
 ]);
 return {records,audit,capas,canWrite:writable.includes(actor.role)};
}
export async function createComplaint(body:unknown,actor:ComplaintActor,database:Database=db){
 authorize(actor,true);const p=createSchema.safeParse(body);if(!p.success)throw new PortalError(400,p.error.issues[0]?.message??'Check the complaint details.');const v=p.data;
 return database.transaction(async tx=>{
  const [row]=await tx.query(`INSERT INTO "QualityComplaint"("receivedDate",source,"complainantName","complainantEmail","complainantPhone","productReference","lotReference","caseId",description,"riskLevel","riskAssessment","investigationOwner","investigationFindings","rootCause","capaRequired","capaId","capaRationale","regulatoryOutcome","regulatoryAssessment","closureSummary","createdBy","updatedBy") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21) RETURNING id`,[v.receivedDate,v.source,v.complainantName,v.complainantEmail.toLowerCase(),v.complainantPhone,v.productReference,v.lotReference,v.caseId||null,v.description,v.riskLevel,v.riskAssessment,v.investigationOwner,v.investigationFindings,v.rootCause,v.capaRequired,v.capaId||null,v.capaRationale,v.regulatoryOutcome,v.regulatoryAssessment,v.closureSummary,actor.id]);
  await tx.query(`INSERT INTO "QualityComplaintAudit"("complaintId","actorId",action,detail) VALUES($1,$2,'CREATED',$3::jsonb)`,[row.id,actor.id,JSON.stringify({source:v.source,riskLevel:v.riskLevel})]);return {id:String(row.id)};
 });
}
const next:Record<string,string[]>={RECEIVED:['RISK_ASSESSED','CANCELLED'],RISK_ASSESSED:['INVESTIGATING','CANCELLED'],INVESTIGATING:['CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW'],CAPA_ASSESSMENT:['REGULATORY_ASSESSMENT','INVESTIGATING'],REGULATORY_ASSESSMENT:['CAPA_ASSESSMENT','CLOSURE_REVIEW','INVESTIGATING'],CLOSURE_REVIEW:['CLOSED','INVESTIGATING'],CLOSED:[],CANCELLED:[]};
export async function updateComplaint(id:string,body:unknown,actor:ComplaintActor,database:Database=db){
 authorize(actor,true);if(!uuid.safeParse(id).success)throw new PortalError(400,'Invalid complaint ID.');const p=updateSchema.safeParse(body);if(!p.success)throw new PortalError(400,p.error.issues[0]?.message??'Check the complaint update.');const v=p.data;
 return database.transaction(async tx=>{
  const [old]=await tx.query('SELECT status FROM "QualityComplaint" WHERE id=$1 FOR UPDATE',[id]);if(!old)throw new PortalError(404,'Complaint not found.');
  if(['CLOSED','CANCELLED'].includes(String(old.status)))throw new PortalError(409,'Closed or cancelled complaints are locked. Log a new complaint for follow-up.');
  if(v.status!==old.status&&!next[String(old.status)]?.includes(v.status))throw new PortalError(409,`Complaint cannot move from ${old.status} to ${v.status}.`);
  if(['RISK_ASSESSED','INVESTIGATING','CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED'].includes(v.status)&&v.riskAssessment.length<10)throw new PortalError(409,'Record the risk assessment before moving this complaint forward.');
  if(['INVESTIGATING','CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED'].includes(v.status)&&!v.caseId&&!v.productReference&&!v.lotReference)throw new PortalError(409,'Add a case, product or lot reference before investigation.');
  if(['CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED'].includes(v.status)&&(!v.investigationOwner||v.investigationFindings.length<10||v.rootCause.length<10))throw new PortalError(409,'Complete the investigation owner, findings and root cause first.');
  if(['CAPA_ASSESSMENT','CLOSURE_REVIEW','CLOSED'].includes(v.status)&&(v.capaRequired?!v.capaId:v.capaRationale.length<10))throw new PortalError(409,'Link the required CAPA, or document why a CAPA is not required.');
  if(['CLOSURE_REVIEW','CLOSED'].includes(v.status)&&(v.regulatoryOutcome==='NOT_ASSESSED'||v.regulatoryAssessment.length<10))throw new PortalError(409,'Complete the regulatory assessment before closure review.');
  if(v.status==='CLOSED'&&v.closureSummary.length<10)throw new PortalError(409,'Add a closure summary of at least 10 characters.');
  await tx.query(`UPDATE "QualityComplaint" SET "receivedDate"=$2,source=$3,"complainantName"=$4,"complainantEmail"=$5,"complainantPhone"=$6,"productReference"=$7,"lotReference"=$8,"caseId"=$9,description=$10,"riskLevel"=$11,"riskAssessment"=$12,"investigationOwner"=$13,"investigationFindings"=$14,"rootCause"=$15,"capaRequired"=$16,"capaId"=$17,"capaRationale"=$18,"regulatoryOutcome"=$19,"regulatoryAssessment"=$20,"closureSummary"=$21,status=$22,"updatedBy"=$23,"updatedAt"=now(),"closedAt"=CASE WHEN $22='CLOSED' THEN now() WHEN $22='INVESTIGATING' THEN NULL ELSE "closedAt" END WHERE id=$1`,[id,v.receivedDate,v.source,v.complainantName,v.complainantEmail.toLowerCase(),v.complainantPhone,v.productReference,v.lotReference,v.caseId||null,v.description,v.riskLevel,v.riskAssessment,v.investigationOwner,v.investigationFindings,v.rootCause,v.capaRequired,v.capaId||null,v.capaRationale,v.regulatoryOutcome,v.regulatoryAssessment,v.closureSummary,v.status,actor.id]);
  await tx.query(`INSERT INTO "QualityComplaintAudit"("complaintId","actorId",action,detail) VALUES($1,$2,$3,$4::jsonb)`,[id,actor.id,v.status===old.status?'UPDATED':'STAGE_CHANGED',JSON.stringify({from:old.status,to:v.status,note:v.actionNote})]);return {id,status:v.status};
 });
}
