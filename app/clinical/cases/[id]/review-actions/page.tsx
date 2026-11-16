import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { clinicalWorkspace } from "@/app/lib/clinical-service";
import { assignReviewer, startReview } from "./actions";

export const dynamic = "force-dynamic";

type ReviewPlan = {
  id: string;
  preparedByAccountId: string | null;
  preparedByEmployeeId: string | null;
  version: number;
  reviewStatus: string;
  reviewRevision: number;
  assignedTo: string | null;
  priority: string;
  dueDate: Date | string | null;
  reviewerName: string | null;
};

type TeamMember = {
  id: string;
  employeeId: string;
  fullName: string;
  clinicalRole: string;
};

const navy = "#113847";
const teal = "#087989";

export default async function ReviewActionsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const actor = await clinicalActor().catch(() => null);

  if (!actor) redirect("/clinical/login");

  const workspace = await clinicalWorkspace(actor, id)
    .catch(() => null);

  if (!workspace) notFound();

  const plan = workspace.plans[0] as ReviewPlan | undefined;
  const members = workspace.team as TeamMember[];

  const openStatuses = [
    "PENDING", "IN_REVIEW", "ESCALATED"
  ];

  const isOpen =
    !!plan && openStatuses.includes(plan.reviewStatus);

  const canAssign =
    isOpen && (actor.role === "ADMIN" || actor.role === "LEAD");

  const canStart =
    !!plan &&
    ["PENDING", "ESCALATED"].includes(plan.reviewStatus) &&
    !!plan.preparedByAccountId && plan.preparedByAccountId !== actor.id &&
    actor.role !== "ADMIN" &&
    (
      plan.assignedTo === actor.id ||
      (actor.role === "LEAD" && plan.reviewStatus === "ESCALATED")
    );

  const eligible = members.filter(member =>
    !!plan?.preparedByAccountId && member.id!==plan.preparedByAccountId && member.employeeId!==plan.preparedByEmployeeId &&
    (plan?.reviewStatus !== "ESCALATED" ||
    member.clinicalRole === "LEAD")
  );

  const notifications: Record<string, string> = {
    assigned: "Reviewer assignment saved successfully.",
    started: "Clinical review started successfully.",
    invalid: "Invalid action details. Refresh and try again.",
    failed: "Action failed or review changed. Refresh and check permissions."
  };

  const control = {
    padding: "12px 16px",
    minHeight: 46,
    borderRadius: 9,
    border: "1px solid #cbd5df",
    background: "#ffffff",
    color: navy,
    font: "inherit"
  };

  const button = {
    padding: "13px 22px",
    minHeight: 48,
    border: 0,
    borderRadius: 10,
    background: teal,
    color: "#ffffff",
    fontWeight: 700 as const,
    cursor: "pointer"
  };

  return (
    <main style={{
      maxWidth: 1100,
      margin: "30px auto",
      padding: 24,
      color: navy
    }}>
      <header style={{
        padding: 28,
        background: navy,
        borderRadius: 14,
        color: "#ffffff"
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Clinical Review Actions
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Case Assignment & Review
        </p>
        <small>
          {actor.name} · {actor.role}
        </small>
      </header>

      <nav style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        margin: "22px 0"
      }}>
        <Link href={`/clinical/cases/${encodeURIComponent(id)}`}>
          Full Clinical Case
        </Link>
        <Link href="/clinical/work-queue">
          Reviewer Work Queue
        </Link>
        <Link href="/clinical/assignment-board">
          Planning Queue
        </Link>
      </nav>

      {query.result && notifications[query.result] && (
        <p role="status" style={{
          background: "#e8f4f4",
          padding: 15,
          borderRadius: 9
        }}>
          {notifications[query.result]}
        </p>
      )}

      <section style={{
        padding: 24,
        background: "#ffffff",
        border: "1px solid #dce6eb",
        borderRadius: 12,
        marginBottom: 22
      }}>
        <h2>Case Information</h2>
        <p>
          <strong>Patient Reference:</strong>{" "}
          {workspace.case.patientReference}
        </p>
        <p>
          <strong>Clinic:</strong> {workspace.case.clinicName}
        </p>
        <p>
          <strong>Treating Doctor:</strong>{" "}
          {workspace.case.doctorName}
        </p>

        {plan ? (
          <>
            <p>
              <strong>Treatment Plan:</strong> Version {plan.version}
            </p>
            <p>
              <strong>Review Status:</strong> {plan.reviewStatus}
            </p>
            <p>
              <strong>Priority:</strong> {plan.priority}
            </p>
            <p>
              <strong>Assigned Reviewer:</strong>{" "}
              {plan.reviewerName || "Not Assigned"}
            </p>
          </>
        ) : (
          <p>No treatment plan is available yet.</p>
        )}
      </section>

      {plan && canAssign && (
        <section style={{
          padding: 24,
          background: "#ffffff",
          border: "1px solid #dce6eb",
          borderRadius: 12,
          marginBottom: 22
        }}>
          <h2>Assign Clinical Reviewer</h2>

          <p>
            Only active, authorized clinical staff
            may receive case assignments.
          </p>

          <form action={assignReviewer} style={{
            display: "grid",
            gap: 15
          }}>
            <input type="hidden" name="caseId" value={id}/>
            <input type="hidden" name="planId" value={plan.id}/>
            <input
              type="hidden"
              name="revision"
              value={String(plan.reviewRevision)}
            />
            <input
              type="hidden"
              name="priority"
              value={plan.priority}
            />
            <label>Due date<input type="date" name="dueDate" defaultValue={plan.dueDate instanceof Date ? plan.dueDate.toISOString().slice(0, 10) : plan.dueDate?.slice(0, 10) || ""} style={{ ...control, display: "block", width: "100%", marginTop: 8 }}/></label>

            <label>
              Select Reviewer
              <select
                name="assignedTo"
                required
                defaultValue=""
                style={{
                  ...control,
                  display: "block",
                  width: "100%",
                  marginTop: 8
                }}
              >
                <option value="" disabled>
                  Choose authorized reviewer
                </option>
                {eligible.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.fullName} — {member.clinicalRole}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <button
                type="submit"
                disabled={eligible.length === 0}
                style={button}
              >
                Save Reviewer Assignment
              </button>
            </div>
          </form>
        </section>
      )}

      {plan && canStart && (
        <section style={{
          padding: 24,
          background: "#ffffff",
          border: "1px solid #dce6eb",
          borderRadius: 12,
          marginBottom: 22
        }}>
          <h2>Start Clinical Review</h2>
          <p>
            Start reviewing the current treatment
            plan version.
          </p>

          <form action={startReview}>
            <input type="hidden" name="caseId" value={id}/>
            <input type="hidden" name="planId" value={plan.id}/>
            <input
              type="hidden"
              name="revision"
              value={String(plan.reviewRevision)}
            />

            <button type="submit" style={button}>
              Start Review
            </button>
          </form>
        </section>
      )}

      <section style={{
        padding: 24,
        background: "#ffffff",
        border: "1px solid #dce6eb",
        borderRadius: 12
      }}>
        <h2>Checklist & Treatment Plan Decision</h2>
        <p>
          Open the existing Clinical Case page to
          complete the checklist, save review notes,
          escalate, request revision or approve.
        </p>

        <Link
          href={`/clinical/cases/${encodeURIComponent(id)}`}
          style={{
            display: "inline-flex",
            padding: "13px 22px",
            borderRadius: 10,
            background: navy,
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 700
          }}
        >
          Open Complete Clinical Review
        </Link>
      </section>
    </main>
  );
}
