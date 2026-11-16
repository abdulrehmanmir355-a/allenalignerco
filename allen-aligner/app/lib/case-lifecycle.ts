import type { QCState, CareStage } from './extended-workflow-policy';
import type { CaseStatus } from './db-models';

// Only persisted CaseStatus values belong here. No inferred milestones.
export const lifecycleStages: { label: string; statuses: CaseStatus[]; detail: string }[] = [
  { label: 'Registration / records', statuses: ['DRAFT', 'SUBMITTED'], detail: 'Patient registration is separate; a draft is submitted after records are attached.' },
  { label: 'Planning / internal clinical review', statuses: ['PLANNING', 'CHANGES_REQUESTED'], detail: 'Internal review is tracked by ClinicalReview; changes require a new plan version.' },
  { label: 'Doctor review / approval', statuses: ['REVIEW', 'APPROVED'], detail: 'Only the assigned doctor may decide on the latest internally approved plan.' },
  { label: 'Manufacture', statuses: ['IN_PRODUCTION'], detail: 'Enrolled cases require current-plan QC before dispatch; legacy history is not reconstructed.' },
  { label: 'Dispatch', statuses: ['SHIPPED'], detail: 'Shipment status does not establish delivery or active treatment.' },
  { label: 'Completion', statuses: ['COMPLETED'], detail: 'The existing laboratory completion status is retained.' },
];
export const pendingLifecycle = 'Enrolled cases track QC, treatment, refinement and retention separately. Existing case history is preserved, and earlier milestones are not inferred.';

const transitions: Record<string, Partial<Record<CaseStatus, CaseStatus[]>>> = {
  DOCTOR: { DRAFT: ['SUBMITTED'], REVIEW: ['APPROVED', 'CHANGES_REQUESTED'] },
  LAB: { SUBMITTED: ['PLANNING'], APPROVED: ['IN_PRODUCTION'], IN_PRODUCTION: ['SHIPPED'], SHIPPED: ['COMPLETED'] },
};
export function canTransition(role: string, from: CaseStatus, to: CaseStatus) {
  return transitions[role]?.[from]?.includes(to) ?? false;
}

export type ActivityDetail = {
  type: 'case_activity'; actor: { id: string; name: string; role: string };
  action: string; fromStatus: CaseStatus | null; status: CaseStatus; notes: string | null;
  workflow?: {qcState: QCState; qcPlanId: string | null; careStage: CareStage};
};
export function activityDetail(value: unknown): ActivityDetail | null {
  if (typeof value !== 'string') return null;
  try {
    const v = JSON.parse(value);
    if (v?.type !== 'case_activity' || typeof v.actor?.id !== 'string' || typeof v.actor?.name !== 'string' || typeof v.actor?.role !== 'string' || typeof v.action !== 'string') return null;
    const statuses = lifecycleStages.flatMap(s => s.statuses);
    if (!statuses.includes(v.status) || (v.fromStatus !== null && !statuses.includes(v.fromStatus)) || (v.notes !== null && typeof v.notes !== 'string')) return null;
    if (v.workflow !== undefined && (!v.workflow || !['PENDING','PASSED','FAILED','NOT_RECORDED'].includes(v.workflow.qcState) || !['NOT_STARTED','ACTIVE','REFINEMENT','TREATMENT_COMPLETED','RETENTION','RETENTION_COMPLETED'].includes(v.workflow.careStage) || (v.workflow.qcPlanId !== null && typeof v.workflow.qcPlanId !== 'string'))) return null;
    return v;
  } catch { return null; }
}
