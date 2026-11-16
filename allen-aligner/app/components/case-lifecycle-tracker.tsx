import type { CaseStatus } from "../lib/db-models";

type Workflow = { qcState: string; careStage: string; caseClosedAt: string | null } | null;
type ProgressState = "complete" | "current" | "waiting" | "attention" | "optional" | "untracked";
type Stage = { label: string; state: ProgressState; note: string };

function getStages(status: CaseStatus, workflow: Workflow): Stage[] {
  const closed = !!workflow?.caseClosedAt;
  const laterThan = (values: CaseStatus[]) => values.includes(status);
  const caseStage: Stage = status === "DRAFT"
    ? { label: "Case", state: "current", note: "Draft" }
    : { label: "Case", state: "complete", note: "Submitted" };
  const planning: Stage = ["PLANNING", "CHANGES_REQUESTED"].includes(status)
    ? { label: "Planning", state: "current", note: status === "CHANGES_REQUESTED" ? "Revision requested" : "In progress" }
    : laterThan(["REVIEW", "APPROVED", "IN_PRODUCTION", "SHIPPED", "COMPLETED"])
      ? { label: "Planning", state: "complete", note: "Plan prepared" }
      : { label: "Planning", state: "waiting", note: "Awaiting assignment" };
  const approval: Stage = status === "REVIEW"
    ? { label: "Approval", state: "current", note: "Doctor review" }
    : laterThan(["APPROVED", "IN_PRODUCTION", "SHIPPED", "COMPLETED"])
      ? { label: "Approval", state: "complete", note: "Approved" }
      : { label: "Approval", state: "waiting", note: "After planning" };
  const manufacturing: Stage = status === "IN_PRODUCTION"
    ? { label: "Manufacturing", state: "current", note: "In production" }
    : laterThan(["SHIPPED", "COMPLETED"])
      ? { label: "Manufacturing", state: "complete", note: "Completed" }
      : { label: "Manufacturing", state: "waiting", note: "After approval" };
  const qc: Stage = !workflow
    ? { label: "Quality control", state: "untracked", note: "Tracking unavailable" }
    : workflow.qcState === "PASSED"
      ? { label: "Quality control", state: "complete", note: "Passed" }
      : workflow.qcState === "FAILED"
        ? { label: "Quality control", state: "attention", note: "Action required" }
        : status === "IN_PRODUCTION"
          ? { label: "Quality control", state: "current", note: "Pending inspection" }
          : { label: "Quality control", state: "waiting", note: workflow.qcState === "NOT_RECORDED" ? "Legacy QC not recorded" : "After manufacturing" };
  const shipment: Stage = laterThan(["SHIPPED", "COMPLETED"])
    ? { label: "Shipment", state: "complete", note: "Dispatched" }
    : status === "IN_PRODUCTION" && workflow?.qcState === "PASSED"
      ? { label: "Shipment", state: "current", note: "Ready for dispatch" }
      : { label: "Shipment", state: "waiting", note: "After QC" };
  const treatment: Stage = !workflow
    ? { label: "Treatment", state: "untracked", note: "Tracking unavailable" }
    : workflow.careStage === "ACTIVE"
      ? { label: "Treatment", state: "current", note: "Active" }
      : ["TREATMENT_COMPLETED", "RETENTION", "RETENTION_COMPLETED"].includes(workflow.careStage) || closed
        ? { label: "Treatment", state: "complete", note: "Completed" }
        : workflow.careStage === "NOT_STARTED" && laterThan(["SHIPPED", "COMPLETED"])
          ? { label: "Treatment", state: "current", note: "Confirm receipt to begin" }
          : { label: "Treatment", state: "waiting", note: "After shipment" };
  const refinement: Stage = !workflow
    ? { label: "Refinement", state: "untracked", note: "Tracking unavailable" }
    : workflow.careStage === "REFINEMENT"
      ? { label: "Refinement", state: "current", note: "New plan required" }
      : ["ACTIVE", "TREATMENT_COMPLETED", "RETENTION", "RETENTION_COMPLETED"].includes(workflow.careStage) || closed
        ? { label: "Refinement", state: "optional", note: "Only if needed" }
        : { label: "Refinement", state: "waiting", note: "During treatment" };
  const retainer: Stage = !workflow
    ? { label: "Retainer", state: "untracked", note: "Tracking unavailable" }
    : workflow.careStage === "RETENTION"
      ? { label: "Retainer", state: "current", note: "Follow-up active" }
      : workflow.careStage === "RETENTION_COMPLETED" || closed
        ? { label: "Retainer", state: "complete", note: "Follow-up complete" }
        : workflow.careStage === "TREATMENT_COMPLETED"
          ? { label: "Retainer", state: "current", note: "Ready to begin" }
          : { label: "Retainer", state: "waiting", note: "After treatment" };
  const closure: Stage = closed
    ? { label: "Closure", state: "complete", note: "Closed" }
    : workflow?.careStage === "RETENTION_COMPLETED"
      ? { label: "Closure", state: "current", note: "Ready to close" }
      : !workflow
        ? { label: "Closure", state: "untracked", note: "Tracking unavailable" }
        : { label: "Closure", state: "waiting", note: "After retention" };
  return [caseStage, planning, approval, manufacturing, qc, shipment, treatment, refinement, retainer, closure];
}

export default function CaseLifecycleTracker({ status, workflow }: { status: CaseStatus; workflow: Workflow }) {
  const stages = getStages(status, workflow);
  return <section className="case-lifecycle-summary" aria-label="Complete case lifecycle">
    <div className="case-lifecycle-summary-heading"><div><span className="eyebrow">MODULE 07</span><h3>Complete case lifecycle</h3></div><span className="badge">{workflow?.caseClosedAt ? "Closed" : status.replaceAll("_", " ")}</span></div>
    {!workflow && <p className="case-lifecycle-note">QC, treatment, retention and closure tracking are not enabled for this case. Existing milestones are not inferred.</p>}
    <ol className="case-lifecycle-track">{stages.map((stage, index) => <li key={stage.label} data-state={stage.state}>
      <span className="case-lifecycle-node" aria-hidden="true">{stage.state === "complete" ? "✓" : index + 1}</span>
      <span className="case-lifecycle-stage"><strong>{stage.label}</strong><small>{stage.note}</small></span>
    </li>)}</ol>
  </section>;
}
