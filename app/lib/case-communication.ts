import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, type Database } from './database';
import { clinicalCase, type ClinicalActor } from './clinical-auth';
import { recordCaseActivity } from './case-activity';
import { PortalError } from './portal-http';
import type { CaseStatus } from './db-models';

export type CommunicationActor = { kind: 'doctor'; doctor: { id: string; clinicId: string | null; fullName: string } } | { kind: 'internal'; actor: ClinicalActor };
export type CaseMessageView = { id: string; author: string; kind: string; text: string; createdAt: string; senderRole: string | null; senderId: string | null; audience: string; planId: string | null; planVersion: number | null; replyToId: string | null; replyAuthor: string | null; replyText: string | null; statusAtSend: string | null; fileId: string | null; fileKind: string | null; fileName: string | null };
export type Conversation = { case: { id: string; patientReference: string; doctorName: string; clinicName: string; status: string }; messages: CaseMessageView[]; hasMore: boolean; plans: {id:string;version:number}[]; files: {id:string;kind:string;name:string}[]; viewer: {id:string;role:string} };
const id = z.string().trim().min(1).max(100);
export const communicationMessageSchema = z.object({
  text: z.string().trim().min(1).max(5000), kind: z.enum(['UPDATE','QUESTION','STATUS_NOTE']).default('UPDATE'),
  clientRequestId: z.uuid(), planId: id.optional(), replyToId: id.optional(),
  attachment: z.object({id,kind:z.enum(['standard','large'])}).strict().optional(),
  audience: z.enum(['CASE','DOCTOR_INTERNAL']).default('DOCTOR_INTERNAL'),
}).strict();
function identity(a:CommunicationActor) { return a.kind==='doctor'?{id:a.doctor.id,name:a.doctor.fullName,role:'DOCTOR'}:{id:a.actor.id,name:a.actor.name,role:'INTERNAL'}; }

async function authorizedCase(tx:Database,caseId:string,a:CommunicationActor,lock=false) {
  if(!caseId||caseId.length>100)throw new PortalError(404,'Case conversation not found.');
  if(a.kind==='internal') {
    const [active]=await tx.query(`SELECT 1 FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w.id=$1 AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE' AND w."clinicalRole"=$2`,[a.actor.id,a.actor.role]);
    if(!active)throw new PortalError(403,'Active internal clinical access is required.');
    return clinicalCase(a.actor,caseId,tx,lock);
  }
  const [c]=await tx.query(`SELECT c.id,c."clinicId",c."doctorId",c."patientReference",c.status,d."fullName" AS "doctorName",cl.name AS "clinicName"
    FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
    WHERE c.id=$1 AND c."doctorId"=$2 AND c."clinicId"=$3 AND d."clinicId"=c."clinicId" AND d."isVerified" AND c.status<>'DRAFT' ${lock?'FOR UPDATE OF c':''}`,[caseId,a.doctor.id,a.doctor.clinicId]);
  if(!c)throw new PortalError(404,'Submitted case conversation not found.');return c;
}

const messageSelect=`SELECT m.id,m.author,m.kind,m.text,m."createdAt",m."senderRole",m."senderId",m.audience,m."planId",p.version AS "planVersion",m."replyToId",r.author AS "replyAuthor",left(r.text,180) AS "replyText",m."statusAtSend",
 coalesce(m."caseFileId",m."largeFileId") AS "fileId",CASE WHEN m."caseFileId" IS NOT NULL THEN 'standard' WHEN m."largeFileId" IS NOT NULL THEN 'large' END AS "fileKind",coalesce(f.name,lf."originalName") AS "fileName"
 FROM "CaseMessage" m LEFT JOIN "TreatmentPlan" p ON p.id=m."planId" LEFT JOIN "CaseMessage" r ON r.id=m."replyToId" AND r."caseId"=m."caseId"
 LEFT JOIN "CaseFile" f ON f.id=m."caseFileId" LEFT JOIN "LargeClinicalFile" lf ON lf.id=m."largeFileId"`;
function message(row:Record<string,unknown>):CaseMessageView { return {...row,createdAt:(row.createdAt as Date).toISOString()} as CaseMessageView; }

export async function caseConversation(caseId:string,a:CommunicationActor,before?:string,after?:string):Promise<Conversation> {
  const c=await authorizedCase(db,caseId,a);
  if(before&&after)throw new PortalError(400,'Select one history direction.');
  let cursor:{createdAt:Date;id:string}|undefined;
  const cursorId=before||after;
  if(cursorId){if(cursorId.length>100)throw new PortalError(400,'Invalid history cursor.');const [r]=await db.query('SELECT id,"createdAt" FROM "CaseMessage" WHERE id=$1 AND "caseId"=$2',[cursorId,caseId]);if(!r)throw new PortalError(400,'History cursor does not belong to this case.');cursor=r as typeof cursor;}
  const direction=after?'ASC':'DESC';
  const rows=await db.query(`${messageSelect} WHERE m."caseId"=$1 ${cursor?`AND (m."createdAt",m.id)${after?'>':'<'}($2::timestamp,$3::text)`:''} ORDER BY m."createdAt" ${direction},m.id ${direction} LIMIT 51`,cursor?[caseId,cursor.createdAt,cursor.id]:[caseId]);
  const [plans,files]=await Promise.all([
    db.query(`SELECT p.id,p.version FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED' WHERE p."caseId"=$1 ORDER BY p.version DESC LIMIT 200`,[caseId]),
    db.query(`SELECT id,name,'standard' AS kind FROM "CaseFile" WHERE "caseId"=$1 UNION ALL SELECT id,"originalName" AS name,'large' AS kind FROM "LargeClinicalFile" WHERE "caseId"=$1`,[caseId]),
  ]);
  const selected=rows.slice(0,50);if(!after)selected.reverse();
  return {case:{id:caseId,patientReference:String(c.patientReference),doctorName:String(c.doctorName),clinicName:String(c.clinicName),status:String(c.status)},messages:selected.map(message),hasMore:rows.length>50,plans:plans as Conversation['plans'],files:files as Conversation['files'],viewer:identity(a)};
}

export async function sendCaseCommunication(caseId:string,a:CommunicationActor,input:unknown) {
  const parsed=communicationMessageSchema.safeParse(input);if(!parsed.success)throw new PortalError(400,'Write a message (maximum 5,000 characters) and check its case references.');const b=parsed.data,who=identity(a);
  if(a.kind==='internal'&&b.audience!=='DOCTOR_INTERNAL')throw new PortalError(403,'Only the treating doctor can send a message to the laboratory.');
  const audience=a.kind==='doctor'?b.audience:'DOCTOR_INTERNAL';
  return db.transaction(async tx=>{
    const c=await authorizedCase(tx,caseId,a,true);
    const [prior]=await tx.query(`SELECT id,text,kind,audience,"planId","replyToId","caseFileId","largeFileId" FROM "CaseMessage" WHERE "caseId"=$1 AND "senderRole"=$2 AND "senderId"=$3 AND "clientRequestId"=$4`,[caseId,who.role,who.id,b.clientRequestId]);
    if(prior){if(prior.text!==b.text||prior.kind!==b.kind||prior.audience!==audience||prior.planId!==(b.planId||null)||prior.replyToId!==(b.replyToId||null)||prior.caseFileId!==(b.attachment?.kind==='standard'?b.attachment.id:null)||prior.largeFileId!==(b.attachment?.kind==='large'?b.attachment.id:null))throw new PortalError(409,'This send reference was already used. Refresh before sending different content.');return {id:prior.id,duplicate:true};}
    const [rate]=await tx.query(`SELECT count(*)::int AS n FROM "CaseMessage" WHERE "senderId"=$1 AND "senderRole"=$2 AND "createdAt">now()-interval '1 minute'`,[who.id,who.role]);if(rate.n>=20)throw new PortalError(429,'Please wait a moment before sending more messages.');
    if(b.replyToId&&!(await tx.query('SELECT 1 FROM "CaseMessage" WHERE id=$1 AND "caseId"=$2',[b.replyToId,caseId])).length)throw new PortalError(400,'Reply to a message in this case.');
    if(b.planId&&!(await tx.query(`SELECT 1 FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED' WHERE p.id=$1 AND p."caseId"=$2`,[b.planId,caseId])).length)throw new PortalError(400,'Select a plan version released for doctor review in this case.');
    if(b.attachment){const table=b.attachment.kind==='standard'?'CaseFile':'LargeClinicalFile';if(!(await tx.query(`SELECT 1 FROM "${table}" WHERE id=$1 AND "caseId"=$2`,[b.attachment.id,caseId])).length)throw new PortalError(400,'Select an authorized document from this case.');}
    const messageId=randomUUID();
    await tx.query(`INSERT INTO "CaseMessage"(id,"caseId",author,kind,text,"senderId","senderRole",audience,"planId","replyToId","clientRequestId","statusAtSend","caseFileId","largeFileId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[messageId,caseId,who.name,b.kind,b.text,who.id,who.role,audience,b.planId||null,b.replyToId||null,b.clientRequestId,c.status,b.attachment?.kind==='standard'?b.attachment.id:null,b.attachment?.kind==='large'?b.attachment.id:null]);
    await recordCaseActivity(tx,caseId,String(c.clinicId),who.role==='DOCTOR'?'Doctor sent a case message':'Allen team sent a case message',{actor:who,action:'case_message',fromStatus:c.status as CaseStatus,status:c.status as CaseStatus,notes:null});
    if(a.kind==='internal')await tx.notification.create({data:{caseId,doctorId:c.doctorId,text:'Allen team replied to your case. Open Case Communication to read the message.'}});
    else await tx.query(`INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
      SELECT w.id::text,w."employeeId",current_date,'CASE_MESSAGE:'||$2,'New doctor message. Open the authorized case communication workspace: /clinical/cases/'||$1||'/communication'
      FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id WHERE w."employeeId" IS NOT NULL AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE'
      AND (w."clinicalRole" IN ('LEAD','ADMIN') OR (w."clinicalRole"='REVIEWER' AND EXISTS(SELECT 1 FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" WHERE p."caseId"=$1 AND r."assignedTo"=w.id AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=$1)))) ON CONFLICT DO NOTHING`,[caseId,messageId]);
    return {id:messageId,duplicate:false};
  });
}

export async function communicationInbox(a:CommunicationActor,search='',page=1) {
  const who=identity(a),doctor=a.kind==='doctor',role=a.kind==='internal'?a.actor.role:'DOCTOR';
  const safePage=Number.isSafeInteger(page)&&page>0?Math.min(page,100000):1;
  const q=search.trim().slice(0,100).replace(/[\\%_]/g,'\\$&');
  const rows=await db.query(`SELECT c.id,c."patientReference",c.status,d."fullName" AS "doctorName",cl.name AS "clinicName",m.author AS "lastAuthor",m.text AS "lastText",m."createdAt" AS "lastAt",(SELECT count(*)::int FROM "CaseMessage" WHERE "caseId"=c.id) AS "messageCount"
    FROM "PortalCase" c JOIN "Doctor" d ON d.id=c."doctorId" JOIN "Clinic" cl ON cl.id=c."clinicId"
    LEFT JOIN LATERAL(SELECT author,text,"createdAt" FROM "CaseMessage" WHERE "caseId"=c.id ORDER BY "createdAt" DESC,id DESC LIMIT 1)m ON true
    WHERE c.status<>'DRAFT' AND (($2::boolean AND c."doctorId"=$3 AND c."clinicId"=$4) OR (NOT $2::boolean AND ($5 IN ('LEAD','ADMIN') OR EXISTS(SELECT 1 FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId" WHERE p."caseId"=c.id AND r."assignedTo"::text=$3))))
      AND ($1='' OR c."patientReference" ILIKE $1 OR c.id ILIKE $1 OR d."fullName" ILIKE $1)
    ORDER BY coalesce(m."createdAt",c."createdAt") DESC,c.id LIMIT 51 OFFSET $6`,[q?'%'+q+'%':'',doctor,who.id,doctor?a.doctor.clinicId:null,role,(safePage-1)*50]);
  return {rows:rows.slice(0,50),hasMore:rows.length>50,page:safePage};
}
