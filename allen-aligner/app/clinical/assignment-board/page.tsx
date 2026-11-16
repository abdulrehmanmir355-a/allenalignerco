/* AA_CLINICAL_PLANNING_QUEUE_V1 */
import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { planningQueue, planningFilters as filters, planningFilter, planningPage, planningQueueUrl, type PlanningRow, type PlanningReviewer, type PlanningCounts } from "@/app/lib/planning-queue";
import AssignmentSubmit from "./assignment-submit";
import { assignReviewer } from "@/app/clinical/cases/[id]/review-actions/actions";
export const dynamic = "force-dynamic";
const navy = "#113847";
const teal = "#087989";
const results: Record<string,string> = {
  assigned: 'Assignment, priority and due date saved.',
  stale: 'This review changed or a newer plan was published. Check the current values and retry.',
  invalid: 'Check the selected planner, priority, due date and current review revision.',
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
  return <main style={{ maxWidth: 1250, margin: "30px auto", padding: "0 24px 60px", color: navy }}>
    <header style={{ background: navy, color: "white", padding: 28, borderRadius: 14 }}>
      <span style={{ letterSpacing: ".12em", fontSize: 12 }}>ALLEN ALIGNER · CLINICAL OPERATIONS</span>
      <h1 style={{ color: "white", margin: "10px 0" }}>Planning Queue</h1>
      <p style={{ color: "white", margin: "0 0 8px" }}>Plan workload, due dates, priorities and reassignment in one place.</p>
      <small style={{ color: "white" }}>Signed in: {actor.name} · {actor.role}</small>
    </header>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "22px 0 28px" }}>
      <Link href="/clinical/work-queue" style={{ padding: "12px 18px", background: teal, color: "white", borderRadius: 9, textDecoration: "none", fontWeight: 700 }}>Reviewer Work Queue</Link>
      <Link href="/clinical" style={{ padding: "12px 18px", border: `2px solid ${navy}`, color: navy, borderRadius: 9, textDecoration: "none", fontWeight: 700 }}>Clinical Workspace</Link>
    </nav>
    {feedback && <p role={params.result === "assigned" ? "status" : "alert"} style={{background:params.result === "assigned" ? "#e7f5f1" : "#fff1f2",padding:15,borderRadius:9}}>{feedback}</p>}
    {loadError && <p role="alert" style={{ background: "#fff1f2", color: "#991b1b", padding: 15, borderRadius: 9 }}>{loadError}</p>}
    {!loadError && <>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 26 }}>
        {cards.map(([label, value]) => <article key={label} style={{ background: label === "Overdue" && value ? "#8d2c25" : navy, borderRadius: 12, padding: 22, minHeight: 105 }}>
          <div style={{ color: "white", fontWeight: 700 }}>{label}</div><strong style={{ display: "block", color: "white", fontSize: 30, marginTop: 12 }}>{value}</strong>
        </article>)}
      </section>
      <nav aria-label="Planning queue filters" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
        {filters.map(filter => <Link key={filter.key} href={planningQueueUrl(filter.key)} aria-current={selected === filter.key ? "page" : undefined} style={{ padding: "11px 16px", borderRadius: 9, textDecoration: "none", fontWeight: 700, fontSize: 14, background: selected === filter.key ? teal : "white", color: selected === filter.key ? "white" : navy, border: `1px solid ${teal}` }}>{filter.label}</Link>)}
      </nav>
      <h2>Prepared plans and independent reviewer workload</h2><p>{summary.matching} matching cases · Page {summary.page} of {summary.pages}</p>
      {!reviewers.length && <p role="status">No active qualified clinical reviewers are available. An authorized clinical administrator must configure eligible staff before assignment.</p>}
      <section style={{ display: "grid", gap: 15 }}>
        {rows.map(row => <article key={row.reviewId} style={{ background: "white", border: `1px solid ${row.overdue ? "#e2a39d" : "#dce6eb"}`, borderRadius: 12, padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", alignItems: "start", gap: 20 }}>
          <div><strong style={{ display: "block", fontSize: 18 }}>Case: {row.patientReference}</strong><p>Plan version {row.version} · <Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}`}>Open case</Link></p>
            <p>Status: <strong>{row.status.replaceAll("_", " ")}</strong></p>
            <p>Priority: <strong>{row.priority}</strong></p>
          </div>
          <div><p>Preparer: <strong>{row.preparerName || "Identity not recorded"}</strong></p><p>Clinical reviewer: <strong>{row.reviewerName || "Unassigned"}</strong></p><p>Reviewer workload: <strong>{row.assignedTo ? row.workload : "—"}</strong> active cases</p>
            <p>Due date: <strong>{dateLabel(row.dueDate)}</strong></p>{row.overdue && <p role="status" style={{ color: "#a1261c", fontWeight: 700 }}>Overdue</p>}
          </div>
          <form action={assignReviewer} style={{ display: "grid", gap: 9, alignContent: "start" }}>
            <input type="hidden" name="caseId" value={row.caseId}/><input type="hidden" name="planId" value={row.planId}/>
            <input type="hidden" name="revision" value={row.revision}/><input type="hidden" name="returnTo" value={planningQueueUrl(selected,summary.page)}/>
            {!row.preparedByAccountId&&<p>Record the preparer evidence in <Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}`}>the case workspace</Link> before assigning review.</p>}
            <label>Assign independent reviewer<select name="assignedTo" required disabled={!row.preparedByAccountId} defaultValue={row.assignedTo || ""} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
              <option value="">Select a different qualified reviewer</option>{reviewers.filter(member => !!row.preparedByAccountId && member.id!==row.preparedByAccountId && member.employeeId!==row.preparedByEmployeeId && (row.status !== "ESCALATED" || member.clinicalRole === "LEAD")).map(member => <option key={member.id} value={member.id}>{member.fullName} · {member.clinicalRole} · {member.workload} active</option>)}
            </select></label>
            <label>Priority<select name="priority" defaultValue={row.priority} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>{["NORMAL", "HIGH", "URGENT"].map(priority => <option key={priority}>{priority}</option>)}</select></label>
            <label>Due date<input type="date" name="dueDate" defaultValue={row.dueDate?.slice(0, 10) || ""} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}/></label>
            <AssignmentSubmit/>
          </form>
        </article>)}
      </section>
      {!rows.length && <p>No cases match this filter.</p>}
      <nav aria-label="Planning queue pages" style={{display:'flex',gap:18,marginTop:24}}>
        {summary.page>1 && <Link href={planningQueueUrl(selected,summary.page-1)}>Previous page</Link>}
        {summary.page<summary.pages && <Link href={planningQueueUrl(selected,summary.page+1)}>Next page</Link>}
      </nav>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 25 }}>Planner → Independent Clinical Reviewer → Doctor. Clinical Leads and authorized Administrators assign reviewers. The preparer is excluded from reviewing the same version.</p>
    </>}
  </main>;
}
