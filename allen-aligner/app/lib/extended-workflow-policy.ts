import { z } from 'zod';
import type { CaseStatus } from './db-models';

export const qcStates = ['PENDING', 'PASSED', 'FAILED', 'NOT_RECORDED'] as const;
export const careStages = ['NOT_STARTED', 'ACTIVE', 'REFINEMENT', 'TREATMENT_COMPLETED', 'RETENTION', 'RETENTION_COMPLETED'] as const;
export type QCState = typeof qcStates[number];
export type CareStage = typeof careStages[number];
export const workflowActions = ['enable', 'start_treatment', 'progress', 'request_refinement', 'resume_treatment', 'complete_treatment', 'start_retention', 'retention_review', 'complete_retention', 'close_case', 'qc_pass', 'qc_fail'] as const;
export type WorkflowAction = typeof workflowActions[number];
export const qcLabels = {
  caseAndPlan: 'Case and approved plan identity verified',
  prescription: 'Prescription and quantity verified',
  inspection: 'Manufacturing inspection completed',
  packaging: 'Packaging and labels verified',
} as const;
const revision = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe())]);
export const workflowActionSchema = z.object({
  action: z.enum(workflowActions), revision, notes: z.string().trim().min(5).max(4000),
  confirmed: z.union([z.literal(true), z.literal('yes')]),
  checklist: z.object({ caseAndPlan: z.boolean(), prescription: z.boolean(), inspection: z.boolean(), packaging: z.boolean() }).strict().optional(),
}).strict().superRefine((v, ctx) => {
  if (v.action === 'qc_pass' && (!v.checklist || Object.values(v.checklist).some(x => !x))) ctx.addIssue({ code: 'custom', message: 'Confirm all four QC findings before release.' });
  if (!v.action.startsWith('qc_') && v.checklist) ctx.addIssue({ code: 'custom', message: 'QC findings belong to laboratory actions.' });
});
export type WorkflowInput = z.infer<typeof workflowActionSchema>;
export type WorkflowState = {
  status: CaseStatus; qcState: QCState | null; qcPlanId: string | null; careStage: CareStage | null;
  latestPlanId: string | null; clinicalApproved: boolean; doctorApproved: boolean; caseClosedAt?: string | null; caseClosureEnabled?: boolean;
};
export type WorkflowResult = Pick<WorkflowState, 'status' | 'qcState' | 'qcPlanId' | 'careStage'>;
export class WorkflowRuleError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const conflict = (message: string): never => { throw new WorkflowRuleError(409, message); };
const approved = (s: WorkflowState) => !!s.latestPlanId && s.clinicalApproved && s.doctorApproved;
export function managedLabProblem(s: WorkflowState, next: CaseStatus): string | null {
  if (!s.careStage) return null;
  if (next === 'SHIPPED' && !(s.qcState === 'PASSED' && s.qcPlanId === s.latestPlanId && approved(s))) return 'Pass QC against the latest internally and doctor-approved plan before dispatch.';
  if (next === 'COMPLETED') return 'Clinical treatment completion belongs to the assigned doctor.';
  return null;
}
export function transitionWorkflow(role: string, s: WorkflowState, action: WorkflowAction): WorkflowResult {
  if ((action.startsWith('qc_') && role !== 'LAB') || (!action.startsWith('qc_') && role !== 'DOCTOR')) throw new WorkflowRuleError(403, 'This action is not permitted for your role.');
  if (s.caseClosedAt && action !== 'close_case') return conflict('This case is closed. Its lifecycle is read-only.');
  const next: WorkflowResult = { status: s.status, qcState: s.qcState, qcPlanId: s.qcPlanId, careStage: s.careStage };
  if (action === 'enable') {
    if (s.careStage || s.qcState) return conflict('This case already uses the extended workflow.');
    return { ...next, qcState: ['SHIPPED', 'COMPLETED'].includes(s.status) ? 'NOT_RECORDED' : 'PENDING', qcPlanId: null, careStage: 'NOT_STARTED' };
  }
  if (!s.careStage || !s.qcState) return conflict('The assigned doctor must first enroll this existing case.');
  if (action === 'qc_pass' || action === 'qc_fail') {
    if (s.status !== 'IN_PRODUCTION' || !approved(s)) return conflict('QC requires manufacture and the latest clinical and doctor approvals.');
    return { ...next, qcState: action === 'qc_pass' ? 'PASSED' : 'FAILED', qcPlanId: s.latestPlanId };
  }
  if (action === 'start_treatment' || action === 'resume_treatment') {
    const expected = action === 'start_treatment' ? 'NOT_STARTED' : 'REFINEMENT';
    if (s.careStage !== expected || !['SHIPPED', 'COMPLETED'].includes(s.status)) return conflict('Dispatch and the appropriate treatment stage are required.');
    const legacy = action === 'start_treatment' && s.qcState === 'NOT_RECORDED';
    if (!legacy && !(s.qcState === 'PASSED' && s.qcPlanId === s.latestPlanId && approved(s))) return conflict('Current-plan QC and approvals are required.');
    return { ...next, careStage: 'ACTIVE' };
  }
  if (action === 'progress') {
    if (s.careStage !== 'ACTIVE' || !['SHIPPED', 'COMPLETED'].includes(s.status)) return conflict('Treatment must be active to record progress.');
    return next;
  }
  if (action === 'request_refinement') {
    if (s.careStage !== 'ACTIVE' || !['SHIPPED', 'COMPLETED'].includes(s.status)) return conflict('Refinement can be requested during active treatment.');
    return { status: 'CHANGES_REQUESTED', careStage: 'REFINEMENT', qcState: 'PENDING', qcPlanId: null };
  }
  if (action === 'complete_treatment') {
    if (s.careStage !== 'ACTIVE' || !['SHIPPED', 'COMPLETED'].includes(s.status)) return conflict('Only active treatment can be completed.');
    return { ...next, status: 'COMPLETED', careStage: 'TREATMENT_COMPLETED' };
  }
  if (action === 'start_retention') {
    if (s.careStage !== 'TREATMENT_COMPLETED' || s.status !== 'COMPLETED') return conflict('Complete treatment before starting retention.');
    return { ...next, careStage: 'RETENTION' };
  }
  if (action === 'close_case') {
    if (!s.caseClosureEnabled) return conflict('Case closure requires the approved closure database update.');
    if (s.status !== 'COMPLETED' || s.careStage !== 'RETENTION_COMPLETED' || s.caseClosedAt) return conflict('Complete treatment and retention follow-up before closing this case.');
    return next;
  }
  if (action === 'retention_review' || action === 'complete_retention') {
    if (s.careStage !== 'RETENTION' || s.status !== 'COMPLETED') return conflict('Retention must be active.');
    return { ...next, careStage: action === 'complete_retention' ? 'RETENTION_COMPLETED' : 'RETENTION' };
  }
  return conflict('Unsupported workflow action.');
}

export function availableWorkflowActions(role: string, s: WorkflowState) {
  return workflowActions.filter(action => { try { transitionWorkflow(role, s, action); return true; } catch { return false; } });
}
