import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { clinicalLeaderQueue } from "@/app/lib/clinical-case-assignment";
import { PortalError } from "@/app/lib/portal-http";
import { assignCase } from "./actions";
export const dynamic = "force-dynamic";

const feedback: Record<string, string> = {
  assigned: "Case assignment saved. The doctor and assigned team member have been notified.",
  stale: "This case was changed by another leader. Refresh and check its current assignment.",
  invalid: "Choose an active qualified team member and enter an assignment reason of at least 10 characters.",
  denied: "Only an authorized Clinical Lead or administrator can manage case assignments.",
  failed: "Unable to save the assignment. Refresh and check the current case before retrying.",
};
const input = { width: "100%", boxSizing: "border-box" as const, padding: 10, border: "1px solid #b9d1d8", borderRadius: 7 };
const dateLabel = (value: string | Date | null) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }) + " PKT" : "—";

export default async function LeaderAssignments({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  let actor;
  try {
    actor = await clinicalActor();
  } catch (error) {
    if (!(error instanceof PortalError)) throw error;
    return <main className="clinical"><h1>Clinical Lead sign-in required</h1><p>{error.message}</p><Link href="/clinical/login">Internal Clinical Login</Link></main>;
  }
  if (!["LEAD", "ADMIN"].includes(actor.role)) {
    return <main className="clinical"><h1>Leader Case Assignments</h1><p>Clinical Lead or administrator access is required.</p><Link href="/clinical">Return to Clinical Review</Link></main>;
  }
  const [{ cases, team }, params] = await Promise.all([clinicalLeaderQueue(actor), searchParams]);
  const result = params.result ? feedback[params.result] : null;
  const unassigned = cases.filter(row => !row.assignedTo);
  const assigned = cases.filter(row => row.assignedTo);
  return <main className="clinical" style={{ maxWidth: 1200, margin: "30px auto", padding: "0 20px 60px" }}>
    <header style={{ background: "#113847", color: "white", borderRadius: 14, padding: 26 }}>
      <span style={{ letterSpacing: ".12em", fontSize: 12 }}>ALLEN ALIGNER · CASE ROUTING</span>
      <h1 style={{ color: "white", margin: "10px 0" }}>Leader Case Assignments</h1>
      <p style={{ color: "white" }}>Doctor-started conversations wait here until a Clinical Lead assigns a qualified person. Assigned staff can then open and reply in the same case thread.</p>
      <p style={{ color: "white" }}>Signed in: {actor.name} · {actor.role}</p>
    </header>
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "20px 0" }}>
      <Link href="/clinical/communications?tab=cases">Case Communication</Link>
      <Link href="/clinical/assignment-board">Plan Review Assignment Board</Link>
      <Link href="/clinical">Clinical Review Dashboard</Link>
    </nav>
    {result && <p role={result === "assigned" ? "status" : "alert"} style={{ padding: 14, borderRadius: 8, background: result === "assigned" ? "#e7f5f1" : "#fff1f2" }}>{result}</p>}
    {!team.length && <p role="alert">No active qualified Reviewers or Clinical Leads are available. An administrator must activate clinical access before assigning cases.</p>}
    <section style={{ background: "white", border: "1px solid #dce6eb", borderRadius: 12, padding: 20, marginTop: 18 }}>
      <h2>Unassigned doctor conversations ({unassigned.length})</h2>
      {!unassigned.length && <p>No doctor-started cases are waiting for assignment.</p>}
      <div style={{ display: "grid", gap: 16 }}>
        {unassigned.map(row => <article key={row.caseId} style={{ border: "1px solid #dce6eb", borderRadius: 10, padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 18 }}>
          <div><h3 style={{ marginTop: 0 }}>{row.patientReference}</h3><p>Dr. {row.doctorName} · {row.clinicName}</p><p>Case status: {String(row.caseStatus).replaceAll("_", " ")}</p><p>Doctor messages: {row.doctorMessageCount}</p><p>Latest doctor message: {row.lastDoctorMessage || "—"}</p><p><Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}/communication`}>Open conversation</Link></p></div>
          <form action={assignCase} style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <input type="hidden" name="caseId" value={row.caseId}/><input type="hidden" name="revision" value="0"/>
            <label>Assign case to<select name="assignedTo" required style={{ ...input, marginTop: 5 }} defaultValue="">
              <option value="" disabled>Choose a qualified person</option>
              {team.map(member => <option key={member.id} value={member.id}>{member.fullName} · {member.clinicalRole} · {member.workload} assigned</option>)}
            </select></label>
            <label>Assignment reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} style={{ ...input, marginTop: 5 }} placeholder="For example: primary contact for this case"/></label>
            <button type="submit" disabled={!team.length} style={{ padding: "11px 14px", border: 0, borderRadius: 8, background: "#087989", color: "white", fontWeight: 700 }}>Assign case</button>
          </form>
        </article>)}
      </div>
    </section>
    <section style={{ background: "white", border: "1px solid #dce6eb", borderRadius: 12, padding: 20, marginTop: 18 }}>
      <h2>Assigned cases ({assigned.length})</h2>
      {!assigned.length && <p>No doctor conversations have been assigned yet.</p>}
      <div style={{ display: "grid", gap: 16 }}>
        {assigned.map(row => <article key={row.caseId} style={{ border: "1px solid #dce6eb", borderRadius: 10, padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 18 }}>
          <div><h3 style={{ marginTop: 0 }}>{row.patientReference}</h3><p>Dr. {row.doctorName} · {row.clinicName}</p><p>Assigned to: <strong>{row.assigneeName} · {row.assigneeRole}</strong></p><p>Assigned: {dateLabel(row.assignedAt)}</p><p>Reason: {row.reason}</p><p><Link href={`/clinical/cases/${encodeURIComponent(row.caseId)}/communication`}>Open conversation</Link></p></div>
          <form action={assignCase} style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <input type="hidden" name="caseId" value={row.caseId}/><input type="hidden" name="revision" value={row.assignmentRevision}/>
            <label>Reassign to<select name="assignedTo" required style={{ ...input, marginTop: 5 }} defaultValue={row.assignedTo}>
              {team.map(member => <option key={member.id} value={member.id}>{member.fullName} · {member.clinicalRole} · {member.workload} assigned</option>)}
            </select></label>
            <label>Reassignment reason<textarea name="reason" required minLength={10} maxLength={1000} rows={3} style={{ ...input, marginTop: 5 }} placeholder="Record why the case is being reassigned"/></label>
            <button type="submit" disabled={!team.length} style={{ padding: "11px 14px", border: 0, borderRadius: 8, background: "#087989", color: "white", fontWeight: 700 }}>Save reassignment</button>
          </form>
        </article>)}
      </div>
    </section>
    <p style={{ color: "#526b75", fontSize: 13, marginTop: 18 }}>Assignment actions require active clinical authorization, lock the case against concurrent changes, and are retained in an append-only audit history.</p>
  </main>;
}
