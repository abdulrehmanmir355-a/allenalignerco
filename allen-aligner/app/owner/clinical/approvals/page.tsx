
"use client";

import { useEffect, useState, type FormEvent } from "react";

type ClinicalRequest = {
  accountId: string;
  employeeId: string;
  employeeName: string;
  identityStatus: string;
  accountActive: boolean;
  mustChangePassword: boolean;
  currentClinicalRole: string | null;
  requestId: string;
  requestedRole: string;
  reason: string;
  requestedAt: string;
};

type AppointmentCandidate = {
  employeeId: string;
  employeeName: string;
  isSignedInOwner?: boolean;
  identityStatus: string;
  accountActive: boolean;
  mustChangePassword: boolean;
  clinicalRole: string | null;
  requestStatus: string | null;
  eligible: boolean;
  blocker: string | null;
};

type OwnerIdentity = { fullName: string; email: string };

export default function OwnerClinicalApprovalsPage() {
  const [requests, setRequests] = useState<ClinicalRequest[]>([]);
  const [eligibleAdministrators, setEligibleAdministrators] = useState<AppointmentCandidate[]>([]);
  const [appointmentCandidates, setAppointmentCandidates] = useState<AppointmentCandidate[]>([]);
  const [administrators, setAdministrators] = useState<AppointmentCandidate[]>([]);
  const [ownerIdentity, setOwnerIdentity] = useState<OwnerIdentity | null>(null);
  const [administratorCount, setAdministratorCount] = useState(0);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [adminEmployeeId, setAdminEmployeeId] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const [adminAction, setAdminAction] = useState<"APPOINT" | "REMOVE">("APPOINT");
  const [adminBusy, setAdminBusy] = useState(false);

  async function loadRequests() {
    const response = await fetch(
      "/api/owner/clinical/registrations",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load requests.");
    }

    setRequests(Array.isArray(data.requests) ? data.requests : []);
    setOwnerIdentity(data.owner && typeof data.owner.fullName === "string" && typeof data.owner.email === "string" ? data.owner : null);
    setAppointmentCandidates(Array.isArray(data.appointmentCandidates) ? data.appointmentCandidates : []);
    setEligibleAdministrators(Array.isArray(data.eligibleAdministrators) ? data.eligibleAdministrators : []);
    setAdministrators(Array.isArray(data.administrators) ? data.administrators : []);
    setAdministratorCount(Number(data.administratorCount) || 0);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadRequests();
      } catch (err) {
        if (active) setError(String(err instanceof Error ? err.message : err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function decide(
    request: ClinicalRequest,
    decision: "APPROVE" | "REJECT"
  ) {
    const reason = (reasons[request.requestId] || "").trim();

    if (reason.length < 10) {
      setError("Please provide a reason of at least 10 characters.");
      return;
    }

    if (
      decision === "APPROVE" &&
      (!request.accountActive ||
        request.identityStatus !== "ACTIVE" ||
        request.mustChangePassword ||
        request.currentClinicalRole)
    ) {
      setError("Employee identity, activation or role requires verification.");
      return;
    }

    setBusy(request.requestId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/owner/clinical/registrations",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountId: request.accountId,
            requestId: request.requestId,
            decision,
            reason,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Decision failed.");
      }

      setMessage(data.message || "Decision recorded.");
      await loadRequests();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to record the decision."
      );
    } finally {
      setBusy(null);
    }
  }

  async function changeAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/owner/clinical/admin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: adminEmployeeId, action: adminAction, reason: adminReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update Clinical Administrator access.");
      setMessage(data.message || "Clinical Administrator access updated.");
      setAdminEmployeeId("");
      setAdminReason("");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update Clinical Administrator access.");
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "30px auto",
        padding: 24,
        fontFamily: "Arial, sans-serif",
        color: "#183b48",
      }}
    >
      <header
        style={{
          background: "#113847",
          color: "white",
          padding: 28,
          borderRadius: 12,
        }}
      >
        <h1>Owner Clinical Approvals</h1>
        <p>Allen Aligner — Owner Command Center</p>
        <p>Clinical Registration & Access Decisions</p>
      </header>

      <section style={{ padding: "24px 0" }}>
        <h2>Pending Clinical Registrations</h2>

        <p>
          Approval is an administrative access decision.
          Treatment plan approval remains the responsibility
          of a qualified independent clinical reviewer.
        </p>

        {message && (
          <p role="status" style={{ color: "#087989" }}>
            {message}
          </p>
        )}

        {error && (
          <p role="alert" style={{ color: "#b42318" }}>
            {error}
          </p>
        )}

        {loading ? (
          <p>Loading requests...</p>
        ) : (
          <p>
            Total pending requests: <strong>{requests.length}</strong>
          </p>
        )}

        {!loading && !error && requests.length === 0 && (
          <p>No pending clinical registration requests.</p>
        )}

        {requests.map((item) => (
          <article
            key={item.requestId}
            style={{
              padding: 22,
              marginBottom: 20,
              border: "1px solid #dce6eb",
              borderRadius: 12,
            }}
          >
            <h3>{item.employeeName}</h3>

            <p><strong>Employee ID:</strong> {item.employeeId}</p>
            <p><strong>Requested Role:</strong> {item.requestedRole}</p>
            <p><strong>Identity:</strong> {item.identityStatus}</p>
            <p><strong>Account Active:</strong> {item.accountActive ? "Yes" : "No"}</p>
            <p><strong>Existing Role:</strong> {item.currentClinicalRole || "None"}</p>
            <p><strong>Request Reason:</strong> {item.reason}</p>
            <p><strong>Requested At:</strong> {item.requestedAt}</p>

            <label
              htmlFor={`reason-${item.requestId}`}
              style={{ display: "block", marginBottom: 8 }}
            >
              <strong>Owner Decision Reason</strong>
            </label>

            <textarea
              id={`reason-${item.requestId}`}
              value={reasons[item.requestId] || ""}
              onChange={(event) =>
                setReasons((previous) => ({
                  ...previous,
                  [item.requestId]: event.target.value,
                }))
              }
              minLength={10}
              maxLength={2000}
              rows={3}
              style={{
                width: "100%",
                padding: 12,
                boxSizing: "border-box",
                borderRadius: 8,
                border: "1px solid #9eafb8",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => decide(item, "APPROVE")}
                style={{
                  padding: "12px 24px",
                  background: "#087989",
                  color: "white",
                  border: 0,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {busy === item.requestId
                  ? "Processing..."
                  : "Approve"}
              </button>

              <button
                type="button"
                disabled={busy !== null}
                onClick={() => decide(item, "REJECT")}
                style={{
                  padding: "12px 24px",
                  background: "#aa3333",
                  color: "white",
                  border: 0,
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
      </section>
      <section style={{ padding: "24px 0", borderTop: "1px solid #dce6eb" }}>
        <h2>Clinical Administrator Appointment</h2>
        <p>Only an authenticated Owner can appoint or remove a Clinical Administrator. The Owner account is separate from clinical staff accounts and does not receive a clinical role. Choose a different eligible employee below.</p>
        {ownerIdentity && <p><strong>Signed in as Owner:</strong> {ownerIdentity.fullName} · {ownerIdentity.email}</p>}
        <p>Current Clinical Administrators: <strong>{administratorCount}</strong></p>
        {administratorCount === 0 && (
          <p>No Clinical Administrator is appointed. Select an eligible employee below. This does not approve that employee’s registration, and it does not turn a pending applicant into an administrator.</p>
        )}
        {eligibleAdministrators.length > 0 && (
          <ul>
            {eligibleAdministrators.map(candidate => (
              <li key={candidate.employeeId}>
                <button type="button" onClick={() => { setAdminEmployeeId(candidate.employeeId); setAdminAction("APPOINT"); }}>
                  Use {candidate.employeeId}
                </button>
                {" "}{candidate.employeeName} · {candidate.employeeId} · eligible for appointment
              </li>
            ))}
          </ul>
        )}
        {administrators.length > 0 && (
          <ul>
            {administrators.map(candidate => (
              <li key={candidate.employeeId}>
                <button type="button" onClick={() => { setAdminEmployeeId(candidate.employeeId); setAdminAction("REMOVE"); }}>
                  Use {candidate.employeeId}
                </button>
                {" "}{candidate.employeeName} · {candidate.employeeId} · current administrator
              </li>
            ))}
          </ul>
        )}
        {appointmentCandidates.some(candidate => candidate.isSignedInOwner && candidate.clinicalRole === "ADMIN") && (
          <p role="note" style={{ padding: 12, borderRadius: 8, background: "#fff7e6", color: "#684b00" }}>
            The Owner account cannot hold clinical access. Its matching employee record currently has administrator access; select that record and choose “Remove” to clear the role.
          </p>
        )}
        {!loading && eligibleAdministrators.length === 0 && administratorCount === 0 && (
          <p>No eligible employee is available for the first administrator appointment.</p>
        )}
        <form onSubmit={changeAdministrator} style={{ display: "grid", gap: 12, maxWidth: 700 }}>
          <label>Employee<select required value={adminEmployeeId} onChange={e => setAdminEmployeeId(e.target.value)}>
            <option value="">Choose an eligible employee</option>
            {appointmentCandidates.map(candidate => {
              const canAppoint = candidate.eligible && candidate.clinicalRole !== "ADMIN";
              const canRemove = candidate.clinicalRole === "ADMIN";
              const disabled = adminAction === "APPOINT" ? !canAppoint : !canRemove;
              const status = candidate.isSignedInOwner ? "Owner account — not clinical staff" : candidate.clinicalRole === "ADMIN" ? "Current administrator" : candidate.blocker || (canAppoint ? "Eligible" : "Not eligible");
              return <option key={candidate.employeeId} value={candidate.employeeId} disabled={disabled}>{candidate.employeeName} · {candidate.employeeId} · {status}</option>;
            })}
          </select></label>
          <label>Action<select value={adminAction} onChange={e => setAdminAction(e.target.value as "APPOINT" | "REMOVE")}><option value="APPOINT">Appoint Clinical Administrator</option><option value="REMOVE">Remove Clinical Administrator access</option></select></label>
          <label>Reason<textarea required minLength={10} maxLength={2000} value={adminReason} onChange={e => setAdminReason(e.target.value)} rows={3} /></label>
          <button type="submit" disabled={adminBusy || adminReason.trim().length < 10}>{adminBusy ? "Processing…" : adminAction === "APPOINT" ? "Appoint administrator" : "Remove administrator access"}</button>
        </form>
      </section>
    </main>
  );
}
