"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestRow } from "./page";
type Decision = "APPROVE" | "REJECT";
export default function ApprovalQueue({
  initialRequests,
  administratorId
}: {
  initialRequests: RequestRow[];
  administratorId: string;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(row: RequestRow, decision: Decision) {
    const reason = (reasons[row.requestId] ?? "").trim();
    if (reason.length < 10) {
      setMessage("Enter a decision reason of at least 10 characters.");
      return;
    }
    if (row.accountId === administratorId) {
      setMessage("Administrators cannot approve their own requests.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/clinical/registration", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "decide",
          accountId: row.accountId,
          requestId: row.requestId,
          decision,
          reason
        })
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || "Decision failed.");
      }
      setRequests(current =>
        current.filter(x => x.requestId !== row.requestId)
      );
      setMessage("Clinical registration decision recorded.");
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to save decision."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ marginTop: 30 }}>
      <h2>Pending Employee Requests</h2>
      {message && <p role="status">{message}</p>}
      {requests.length === 0 && (
        <p>No pending clinical requests.</p>
      )}
      <div style={{ display: "grid", gap: 18 }}>
        {requests.map(row => {
          const eligible =
            row.accountActive &&
            row.employeeStatus === "ACTIVE" &&
            !row.mustChangePassword &&
            row.accountId !== administratorId;
          const reason = reasons[row.requestId] ?? "";
          const button = {
            padding: "12px 22px",
            borderRadius: 9,
            fontWeight: 700 as const,
            cursor: "pointer"
          };
          return (
            <article key={row.requestId} style={{
              background: "#ffffff",
              border: "1px solid #dce6eb",
              borderRadius: 12,
              padding: 24
            }}>
              <h3 style={{ color: "#113847" }}>
                {row.employeeName}
              </h3>
              <p><strong>Employee ID / reviewer email:</strong> {row.employeeId}</p>
              <p><strong>Requested Role:</strong> {row.requestedRole}</p>
              <p><strong>Requested:</strong> {row.requestedAt}</p>
              <p style={{ overflowWrap: "anywhere" }}>
                <strong>Qualifications:</strong> {row.reason}
              </p>
              {!eligible && (
                <p style={{ color: "#a12626" }}>
                  Approval unavailable: account
                  or permissions require verification.
                </p>
              )}
              <label style={{
                display: "block",
                fontWeight: 700
              }}>
                Administrator Decision Reason
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  onChange={e =>
                    setReasons(previous => ({
                      ...previous,
                      [row.requestId]: e.target.value
                    }))
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 10,
                    marginBottom: 15,
                    padding: 12,
                    boxSizing: "border-box",
                    border: "1px solid #ccd8dd",
                    borderRadius: 8
                  }}
                />
              </label>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12
              }}>
                <button
                  type="button"
                  disabled={busy || !eligible || reason.trim().length < 10}
                  onClick={() => void decide(row, "APPROVE")}
                  style={{
                    ...button,
                    background: "#087989",
                    color: "#ffffff",
                    border: 0
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    row.accountId === administratorId ||
                    reason.trim().length < 10
                  }
                  onClick={() => void decide(row, "REJECT")}
                  style={{
                    ...button,
                    background: "#ffffff",
                    color: "#113847",
                    border: "2px solid #113847"
                  }}
                >
                  Reject
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}