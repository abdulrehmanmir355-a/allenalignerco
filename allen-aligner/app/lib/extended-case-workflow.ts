import 'server-only';
import { manufacturingApproval } from './treatment-approval';
import { db, type Database } from './database';
import { ownCases } from './portal-auth';
import { PortalError } from './portal-http';
import { recordCaseActivity } from './case-activity';
import { availableWorkflowActions, managedLabProblem, transitionWorkflow, workflowActionSchema, WorkflowRuleError, type WorkflowState } from './extended-workflow-policy';
import {productionQCTransitionProblem} from './production-qc';

export function extendedWorkflowEnabled() { return process.env.ENABLE_EXTENDED_CASE_WORKFLOW === 'true'; }
export async function workflowSchemaReady(database: Database = db) {
  const [r] = await database.query(`SELECT
    (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='"PortalCase"'::regclass AND atttypid='text'::regtype AND NOT attisdropped AND attname IN ('qcState','qcPlanId','careStage'))
    AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='"PortalCase"'::regclass AND tgname='aa_extended_case_guard' AND NOT tgisinternal AND tgenabled='O')
    AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"PortalCase"'::regclass AND conname='PortalCase_extended_workflow_check' AND convalidated)
    AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"PortalCase"'::regclass AND conname='PortalCase_qc_plan_fkey' AND convalidated) AS ready`);
  return r?.ready === true;
}
export async function requireExtendedWorkflow(database: Database = db) {
  if (!extendedWorkflowEnabled() || !await workflowSchemaReady(database)) throw new PortalError(503, 'Extended case workflow is not enabled.');
}
type DoctorIdentity = { id: string; clinicId: string | null; fullName: string };
export type WorkflowActor = { role: 'DOCTOR'; doctor: DoctorIdentity } | { role: 'LAB'; id: string; name: string };
async function loadState(database: Database, id: string, actor?: WorkflowActor, lock = false) {
  const doctor = actor?.role === 'DOCTOR' ? ownCases(actor.doctor) : null;
  const [c] = await database.query(`SELECT c.id,c."clinicId",c."doctorId",c.status,c.revision,
      to_jsonb(c)->>'qcState' AS "qcState",to_jsonb(c)->>'qcPlanId' AS "qcPlanId",to_jsonb(c)->>'careStage' AS "careStage",
      p.id AS "latestPlanId",coalesce(p.decision='APPROVED',false) AS "doctorApproved",coalesce(r.status='APPROVED',false) AS "clinicalApproved"
    FROM "PortalCase" c LEFT JOIN LATERAL (SELECT id,decision FROM "TreatmentPlan" WHERE "caseId"=c.id ORDER BY version DESC LIMIT 1) p ON true
    LEFT JOIN "ClinicalReview" r ON r."planId"=p.id
    WHERE c.id=$1 AND ($2::text IS NULL OR (c."doctorId"=$2 AND c."clinicId"=$3)) ${lock ? 'FOR UPDATE OF c' : ''}`, [id, doctor?.doctorId ?? null, doctor?.clinicId ?? null]);
  if (!c) throw new PortalError(404, 'Case not found.');
  return c as WorkflowState & { id: string; clinicId: string; doctorId: string; revision: number };
}
export async function workflowView(id: string, actor: WorkflowActor) {
  await requireExtendedWorkflow();
  const c = await loadState(db, id, actor);
  return { caseId: c.id, revision: c.revision, status: c.status, qcState: c.qcState, qcPlanId: c.qcPlanId, careStage: c.careStage, latestPlanId: c.latestPlanId, actions: availableWorkflowActions(actor.role, c) };
}
export async function doctorWorkflowView(id: string, doctor: DoctorIdentity) {
  if (!extendedWorkflowEnabled() || !await workflowSchemaReady()) return null;
  return workflowView(id, { role: 'DOCTOR', doctor });
}
export async function updateCaseWorkflow(id: string, actor: WorkflowActor, input: unknown, reauthorize?: (tx: Database) => Promise<unknown>) {
  await requireExtendedWorkflow();
  const parsed = workflowActionSchema.safeParse(input);
  if (!parsed.success) throw new PortalError(400, 'Supply the current revision, written notes, confirmation and required QC findings.');
  const body = parsed.data;
  return db.transaction(async tx => {
    const c = await loadState(tx, id, actor, true);
    if (reauthorize) await reauthorize(tx);
    if (c.revision !== body.revision) throw new PortalError(409, 'Case changed. Refresh before retrying.');
    let next;
    try { next = transitionWorkflow(actor.role, c, body.action); } catch (e) { if (e instanceof WorkflowRuleError) throw new PortalError(e.status, e.message); throw e; }
    const rows = await tx.query(`UPDATE "PortalCase" SET status=$2,"qcState"=$3,"qcPlanId"=$4,"careStage"=$5,revision=revision+1,"updatedAt"=clock_timestamp() WHERE id=$1 AND revision=$6 RETURNING revision`, [id, next.status, next.qcState, next.qcPlanId, next.careStage, body.revision]);
    if (rows.length !== 1) throw new PortalError(409, 'Case changed. Refresh before retrying.');
    const identity = actor.role === 'DOCTOR' ? { id: actor.doctor.id, name: actor.doctor.fullName, role: 'DOCTOR' } : { id: actor.id, name: actor.name, role: 'LAB' };
    const notes = body.notes + (body.checklist ? '\nQC findings: ' + JSON.stringify(body.checklist) : '');
    await recordCaseActivity(tx,id,c.clinicId,`Case workflow: ${body.action.replaceAll('_',' ')}`,{ actor: identity, action: body.action, fromStatus: c.status, status: next.status, notes, workflow: { qcState: next.qcState!, qcPlanId: next.qcPlanId, careStage: next.careStage! } });
    await tx.notification.create({ data: { caseId: id, doctorId: c.doctorId, text: `Case workflow: ${body.action.replaceAll('_',' ')}` } });
    return { message: 'Case workflow updated.', revision: rows[0].revision };
  });
}
// These guards apply to enrolled cases even if the feature flag is later disabled.
export async function guardManagedLabTransition(tx: Database, id: string, nextStatus: WorkflowState['status']) {
  if (nextStatus === 'IN_PRODUCTION') await manufacturingApproval(tx, id);
  await productionQCTransitionProblem(tx,id,nextStatus);
  const c = await loadState(tx, id);
  const problem = managedLabProblem(c, nextStatus);
  if (problem) throw new PortalError(409, problem);
}
export async function enrollNewCase(tx: Database, id: string) {
  if (!extendedWorkflowEnabled()) return;
  await requireExtendedWorkflow(tx);
  await tx.query(`UPDATE "PortalCase" SET "qcState"='PENDING',"careStage"='NOT_STARTED' WHERE id=$1`, [id]);
}
