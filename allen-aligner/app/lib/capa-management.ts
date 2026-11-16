import 'server-only';
import { z } from 'zod';
import { db, type Database } from './database';
import { PortalError } from './portal-http';

export type CapaActor = { id: string; email: string; role: string } | null;
const sourceType = z.enum(['CLINICAL','LABORATORY','SUPPLIER','INTERNAL_AUDIT','CUSTOMER','PROCESS','OTHER']);
const severity = z.enum(['LOW','MEDIUM','HIGH','CRITICAL']);
const status = z.enum(['OPEN','INVESTIGATING','ACTION_IN_PROGRESS','VERIFYING','CLOSED','CANCELLED']);
const fields = {
  sourceType,
  severity,
  title: z.string().trim().min(5,'Title must be at least 5 characters.').max(200),
  description: z.string().trim().min(10,'Describe the issue in at least 10 characters.').max(5000),
  containment: z.string().trim().max(3000).default(''),
  rootCause: z.string().trim().max(3000).default(''),
  correction: z.string().trim().max(3000).default(''),
  correctiveAction: z.string().trim().max(3000).default(''),
  preventiveAction: z.string().trim().max(3000).default(''),
  effectivenessCheck: z.string().trim().max(3000).default(''),
  assignedTo: z.string().trim().min(2,'Enter an owner for this CAPA.').max(200),
  dueDate: z.iso.date(),
};
export const capaCreateSchema = z.object(fields).strict();
export const capaUpdateSchema = z.object({ ...fields, status, actionNote: z.string().trim().min(5,'Add a note explaining this update.').max(2000) }).strict();
const idSchema = z.uuid();
const writers = ['HR_ADMIN','HR_OFFICER'];
function actorRequired(actor: CapaActor, write = false): asserts actor is NonNullable<CapaActor> {
  if (!actor || !actor.id || !['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(actor.role)) throw new PortalError(actor ? 403 : 401, actor ? 'HR permission required.' : 'Please sign in to access CAPA.');
  if (write && !writers.includes(actor.role)) throw new PortalError(403,'HR Admin or HR Officer permission is required to manage CAPA.');
}
export async function capaList(actor: CapaActor, database: Database = db) {
  actorRequired(actor);
  const [records,audit] = await Promise.all([
    database.query(`SELECT id,"sourceType",severity,title,description,containment,"rootCause",correction,"correctiveAction","preventiveAction","effectivenessCheck","assignedTo","dueDate"::text AS "dueDate",status,"createdBy","updatedBy","createdAt","updatedAt","closedAt" FROM "CAPA" ORDER BY CASE status WHEN 'CLOSED' THEN 2 WHEN 'CANCELLED' THEN 3 ELSE 0 END,"dueDate", "createdAt" DESC LIMIT 500`),
    database.query(`SELECT a.id,a."capaId",c.title,a.action,a.detail,a."createdAt",u.email AS "actorEmail" FROM "CAPAAudit" a JOIN "CAPA" c ON c.id=a."capaId" JOIN "HRUser" u ON u.id=a."actorId" ORDER BY a."createdAt" DESC,a.id DESC LIMIT 200`),
  ]);
  return { records, audit, canWrite: writers.includes(actor.role) };
}
export async function createCapa(body: unknown, actor: CapaActor, database: Database = db) {
  actorRequired(actor,true);
  const parsed = capaCreateSchema.safeParse(body);
  if (!parsed.success) throw new PortalError(400,parsed.error.issues[0]?.message ?? 'Check the CAPA details.');
  const v = parsed.data;
  return database.transaction(async tx => {
    const [record] = await tx.query(`INSERT INTO "CAPA"("sourceType",severity,title,description,containment,"rootCause",correction,"correctiveAction","preventiveAction","effectivenessCheck","assignedTo","dueDate","createdBy","updatedBy")
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,[v.sourceType,v.severity,v.title,v.description,v.containment,v.rootCause,v.correction,v.correctiveAction,v.preventiveAction,v.effectivenessCheck,v.assignedTo,v.dueDate,actor.id]);
    await tx.query(`INSERT INTO "CAPAAudit"("capaId","actorId",action,detail) VALUES($1,$2,'CREATED',$3::jsonb)`,[record.id,actor.id,JSON.stringify({title:v.title,sourceType:v.sourceType,severity:v.severity})]);
    return { id:String(record.id) };
  });
}
const allowed: Record<string,string[]> = {
  OPEN:['INVESTIGATING','CANCELLED'], INVESTIGATING:['ACTION_IN_PROGRESS','CANCELLED'],
  ACTION_IN_PROGRESS:['VERIFYING','CANCELLED'], VERIFYING:['CLOSED','ACTION_IN_PROGRESS'], CLOSED:[], CANCELLED:[],
};
export async function updateCapa(id: string, body: unknown, actor: CapaActor, database: Database = db) {
  actorRequired(actor,true);
  if (!idSchema.safeParse(id).success) throw new PortalError(400,'Invalid CAPA ID.');
  const parsed = capaUpdateSchema.safeParse(body);
  if (!parsed.success) throw new PortalError(400,parsed.error.issues[0]?.message ?? 'Check the CAPA update.');
  const v = parsed.data;
  return database.transaction(async tx => {
    const [before] = await tx.query('SELECT status,title FROM "CAPA" WHERE id=$1 FOR UPDATE',[id]);
    if (!before) throw new PortalError(404,'CAPA record not found.');
    if (['CLOSED','CANCELLED'].includes(String(before.status))) throw new PortalError(409,'Closed or cancelled CAPAs are locked. Create a new CAPA for follow-up.');
    if (v.status !== before.status && !allowed[String(before.status)]?.includes(v.status)) throw new PortalError(409,`CAPA cannot move from ${before.status} to ${v.status}.`);
    if (['VERIFYING','CLOSED'].includes(v.status) && (!v.rootCause || !v.correctiveAction || !v.preventiveAction)) throw new PortalError(409,'Record the root cause, corrective action and preventive action before effectiveness verification.');
    if (v.status === 'CLOSED' && (!v.effectivenessCheck || v.effectivenessCheck.length < 10)) throw new PortalError(409,'Record an effectiveness check of at least 10 characters before closing this CAPA.');
    await tx.query(`UPDATE "CAPA" SET "sourceType"=$2,severity=$3,title=$4,description=$5,containment=$6,"rootCause"=$7,correction=$8,"correctiveAction"=$9,"preventiveAction"=$10,"effectivenessCheck"=$11,"assignedTo"=$12,"dueDate"=$13,status=$14,"updatedBy"=$15,"updatedAt"=now(),"closedAt"=CASE WHEN $14='CLOSED' THEN now() WHEN $14='ACTION_IN_PROGRESS' THEN NULL ELSE "closedAt" END WHERE id=$1`,[id,v.sourceType,v.severity,v.title,v.description,v.containment,v.rootCause,v.correction,v.correctiveAction,v.preventiveAction,v.effectivenessCheck,v.assignedTo,v.dueDate,v.status,actor.id]);
    const action = v.status !== before.status ? 'STATUS_CHANGED' : 'UPDATED';
    await tx.query(`INSERT INTO "CAPAAudit"("capaId","actorId",action,detail) VALUES($1,$2,$3,$4::jsonb)`,[id,actor.id,action,JSON.stringify({titleBefore:before.title,titleAfter:v.title,statusBefore:before.status,statusAfter:v.status,note:v.actionNote})]);
    return { id, status:v.status };
  });
}
