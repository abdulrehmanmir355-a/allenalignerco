/* AA_CLINICAL_PLANNING_QUEUE_V1 */
import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { planningQueue, planningFilters as filters, planningFilter, planningPage, planningQueueUrl, type PlanningRow, type PlanningReviewer, type PlanningCounts } from "@/app/lib/planning-queue";
import AssignmentSubmit from "./assignment-submit";
import { assignReviewer } from "@/app/clinical/cases/[id]/review-actions/actions";
export const dynamic = "force-dynamic";
const results: Record<string,string> = {
      assigned: 'Assignment, priority and due date saved. Any reassignment reason is in the case audit history.',
  stale: 'This review changed or a newer plan was published. Check the current values and retry.',
  invalid: 'Check the selected reviewer, priority and due date. Provide a reason of at least 10 characters if you change reviewers.',
  denied: 'You no longer have permission to change this assignment.',
  failed: 'Unable to save the assignment. Refresh to check the current values before retrying.',
};
const dateLabel = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString() : "Not set";
export default async function AssignmentBoard({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string; result?: string }> }) {
  const actor = await clinicalActor().catch(() => null);
  if (!actor) return <main style={{ padding: 35 }}><h1>Clinical Login Required</h1><Link href="/clinical/login">Internal Clinical Login</Link></main>;
  if (!["LEAD", "ADMIN"].includes(actor.role)) return <main style={{ padding: 35 }}><h1>Access Denied</h1><p>Clinical Lead or Administrator access required.</p></main>;
  const params = await searchParams;
  const selected = planningFilter(params.filter);
  let rows: PlanningRow[] = [];
  let reviewers: PlanningReviewer[] = [];
  let summary: PlanningCounts & {page:number;pages:number} = {total:0,unassigned:0,urgent:0,overdue:0,matching:0,page:1,pages:1};
  let loadError = "";
  try {
    ({rows,reviewers,summary} = await planningQueue(actor,selected,planningPage(params.page)));
  } catch (error) { console.error("Planning queue query failed:", error); loadError = "Unable to load the planning queue. Refresh to retry."; }
  const cards = [["Open Cases",summary.total],["Unassigned",summary.unassigned],["Urgent / High",summary.urgent],["Overdue",summary.overdue]] as const;
  const feedback = params.result ? results[params.result] : null;
  return <main className="clinical planning-board">
    <header className="planning-hero">
      <span className="planning-eyebrow">ALLEN ALIGNER · CLINICAL OPERATIONS</span>
      <h1>Module 13 · Planning Queue</h1>
      <p>Plan workload, due dates, priorities and reassignment in one place.</p>
      <small>Signed in: {actor.name} · {actor.role}</small>
    </header>
    <section className="planning-workflow" aria-labelledby="planning-workflow-title">
      <div className="planning-workflow-heading"><div><span className="planning-section-kicker">INDEPENDENT REVIEW WORKFLOW</span><h2 id="planning-workflow-title">One plan, three accountable steps</h2></div><p>Each handoff keeps the plan version and its review history connected.</p></div>
      <div className="planning-workflow-cards">
        <article className="planning-workflow-card"><span className="planning-workflow-number">01</span><div><h3>Planner prepares</h3><p>Publish the plan version, identify its preparer, then set its priority and due date.</p></div><span className="planning-workflow-tag">Case owner</span></article>
        <article className="planning-workflow-card is-current"><span className="planning-workflow-number">02</span><div><h3>Clinical reviewer assesses</h3><p>Assign a different qualified reviewer. Track workload, overdue work and any reasoned reassignment.</p></div><span className="planning-workflow-tag">This queue</span></article>
        <article className="planning-workflow-card"><span className="planning-workflow-number">03</span><div><h3>Doctor receives handoff</h3><p>After independent clinical review, send that exact plan version to the doctor for a decision.</p></div><span className="planning-workflow-tag">Next handoff</span></article>
      </div>
    </section>
    <nav className="planning-actions" aria-label="Clinical planning navigation">
      <Link href="/clinical/leader" className="planning-button">Leader Case Assignments</Link>
      <Link href="/clinical/work-queue" className="planning-button planning-button-secondary">Reviewer Work Queue</Link>
      <Link href="/clinical" className="planning-button planning-button-outline">Clinical Workspace</Link>
    </nav>
    {feedback && <p className={`planning-feedback ${params.result === "assigned" ? "is-success" : "is-error"}`} role={params.result === "assigned" ? "status" : "alert"}>{feedback}</p>}
    {loadError && <p className="planning-feedback is-error" role="alert">{loadError}</p>}
    {!loadError && <>
      <section className="planning-metrics" aria-label="Queue summary">
        {cards.map(([label, value]) => <article className={`planning-metric${label === "Overdue" && value ? " is-overdue" : ""}`} key={label}>
          <span>{label}</span><strong>{value}</strong>
        </article>)}
      </section>
      <nav className="planning-filters" aria-label="Planning queue filters">
        {filters.map(filter => <Link className={selected === filter.key ? "is-selected" : ""} key={filter.key} href={planningQueueUrl(filter.key)} aria-current={selected === filter.key ? "page" : undefined}>{filter.label}</Link>)}
      </nav>
      <div className="planning-list-heading"><div><h2>Plans awaiting independent review</h2><p>{summary.matching} matching cases · Page {summary.page} of {summary.pages}</p></div></div>
      {!reviewers.length && <p className="clinical-notice" role="status">No active qualified clinical reviewers are available. An authorized clinical administrator must configure eligible staff before assignment.</p>}
      <section className="planning-list">
        {rows.map(row => <article className={`planning-row${row.overdue ? " is-overdue" : ""}`} key={row.reviewId}>
          <div className="planning-case"><strong>Case: {row.patientReference}</strong><p>Plan version {row.version} · <Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}`}>Open case</Link></p>
            <p>Status <strong className="planning-status">{row.status.replaceAll("_", " ")}</strong></p>
            <p>Priority <strong className={`planning-priority priority-${row.priority.toLowerCase()}`}>{row.priority}</strong></p>
          </div>
          <div className="planning-assignment"><p>Planner / preparer <strong>{row.preparerName || "Identity not recorded"}</strong></p><p>Independent reviewer <strong>{row.reviewerName || "Unassigned"}</strong></p><p>Reviewer workload <strong>{row.assignedTo ? row.workload : "—"}</strong> active cases</p>
            <p>Due date <strong>{dateLabel(row.dueDate)}</strong></p>{row.overdue && <p className="planning-overdue" role="status">Overdue</p>}
          </div>
          <form action={assignReviewer} className="planning-form">
            <input type="hidden" name="caseId" value={row.caseId}/><input type="hidden" name="planId" value={row.planId}/>
            <input type="hidden" name="revision" value={row.revision}/><input type="hidden" name="returnTo" value={planningQueueUrl(selected,summary.page)}/>
            {!row.preparedByAccountId&&<p>Record the preparer evidence in <Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}`}>the case workspace</Link> before assigning review.</p>}
            <label>Assign independent reviewer<select name="assignedTo" required disabled={!row.preparedByAccountId} defaultValue={row.assignedTo || ""}>
              <option value="">Select a different qualified reviewer</option>{reviewers.filter(member => !!row.preparedByAccountId && member.id!==row.preparedByAccountId && member.employeeId!==row.preparedByEmployeeId && (row.status !== "ESCALATED" || member.clinicalRole === "LEAD")).map(member => <option key={member.id} value={member.id}>{member.fullName} · {member.clinicalRole} · {member.workload} active</option>)}
            </select></label>
            <label>Priority<select name="priority" defaultValue={row.priority}>{["NORMAL", "HIGH", "URGENT"].map(priority => <option key={priority}>{priority}</option>)}</select></label>
            <label>Due date<input type="date" name="dueDate" defaultValue={row.dueDate?.slice(0, 10) || ""}/></label>
            {row.assignedTo && <label>Reassignment reason <span>(required only if reviewer changes)</span><textarea name="reason" minLength={10} maxLength={1000} rows={2} placeholder="Why is this case moving to another reviewer?"/></label>}
            <AssignmentSubmit/>
          </form>
        </article>)}
      </section>
      {!rows.length && <p>No cases match this filter.</p>}
      <nav className="planning-pagination" aria-label="Planning queue pages">
        {summary.page>1 && <Link href={planningQueueUrl(selected,summary.page-1)}>Previous page</Link>}
        {summary.page<summary.pages && <Link href={planningQueueUrl(selected,summary.page+1)}>Next page</Link>}
      </nav>
      <p className="planning-note">Planner → Independent Clinical Reviewer → Doctor. Clinical Leads and authorized Administrators assign reviewers. The preparer is excluded from reviewing the same version.</p>
    </>}
  </main>;
}
