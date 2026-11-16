"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
export type TeamAccount = {
  accountId: string;
  employeeId: string;
  fullName: string;
  clinicalRole: "REVIEWER" | "LEAD" | "ADMIN";
  isActive: boolean;
  mustChangePassword: boolean;
  employeeStatus: string;
};
const inputStyle = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
  padding: 12,
  marginTop: 7,
  border: "1px solid #c9d9df",
  borderRadius: 9,
  font: "inherit"
};
export default function TeamPanel({
  accounts,
  administratorId
}: {
  accounts: TeamAccount[];
  administratorId: string;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!(/^(AA-EMP-\d{6,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/.test(employeeId.trim()))) {
      setMessage("Enter a valid employee ID or reviewer email.");
      setFailed(true);
      return;
    }
    if (reason.trim().length < 10) {
      setMessage("Enter a revocation reason of at least 10 characters.");
      setFailed(true);
      return;
    }
    const selected = accounts.find(account => account.employeeId === employeeId.trim());
    if (selected?.clinicalRole === "ADMIN") {
      setMessage("Clinical ADMIN access can only be removed by the Owner or an authorized database administrator.");
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/clinical/team", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          employeeId: employeeId.trim(),
          role: null,
          reason: reason.trim()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof result.message === "string"
            ? result.message
            : `Permission update failed (${response.status}).`
        );
      }
      setMessage("Clinical Reviewer or Lead access was removed.");
      setEmployeeId("");
      setReason("");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update permission."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <section style={{
        padding: 24,
        background: "#ffffff",
        border: "1px solid #dce6eb",
        borderRadius: 14,
        marginBottom: 25
      }}>
        <h2 style={{ color: "#113847" }}>
          Remove Reviewer or Lead Access
        </h2>
        <p>
          Clinical Administrators can remove REVIEWER or LEAD access only.
          New access is granted by deciding a registration request.
          ADMIN appointment and removal stay with the Owner or an authorized database administrator.
        </p>
        {message && (
          <p role={failed ? "alert" : "status"} style={{
            background: failed ? "#fff1f2" : "#e8f5f3",
            color: failed ? "#991b1b" : "#113847",
            padding: 14,
            borderRadius: 9
          }}>
            {message}
          </p>
        )}
        <form onSubmit={save} style={{
          display: "grid",
          gap: 18,
          maxWidth: 650
        }}>
          <label>
            Employee ID or reviewer email
            <input
              required
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              placeholder="AA-EMP-000001"
              style={inputStyle}
            />
          </label>
          <p>Action: remove REVIEWER or LEAD access. ADMIN roles are not changed here.</p>
          <label>
            Reason for removal
            <textarea
              required
              rows={3}
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={inputStyle}
              placeholder="Record why this Reviewer or Lead access is being removed"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{
              minHeight: 48,
              padding: "13px 22px",
              background: "#087989",
              border: 0,
              borderRadius: 10,
              color: "#ffffff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer"
            }}
          >
            {busy ? "Saving..." : "Remove clinical access"}
          </button>
        </form>
      </section>
      <section>
        <h2 style={{ color: "#113847" }}>
          Existing Clinical Team
        </h2>
        <p>{accounts.length} records displayed (maximum 500).</p>
        <div style={{
          display: "grid",
          gap: 14
        }}>
          {accounts.map(account => {
            const isSelf =
              account.accountId === administratorId;
            return (
              <article key={account.accountId} style={{
                background: "#ffffff",
                border: "1px solid #dce6eb",
                borderRadius: 12,
                padding: 20,
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 15
              }}>
                <div>
                  <strong>{account.fullName}</strong>
                  <p style={{ marginBottom: 5 }}>
                    {account.employeeId}
                  </p>
                  <small>
                    {account.employeeStatus} ·{" "}
                    {account.isActive
                      ? "Account Active"
                      : "Account Inactive"}
                    {account.mustChangePassword &&
                      " · Password Change Required"}
                  </small>
                </div>
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12
                }}>
                  <strong style={{
                    background: "#e8f5f3",
                    padding: "9px 13px",
                    borderRadius: 8,
                    color: "#113847"
                  }}>
                    {account.clinicalRole}
                  </strong>
                  <button
                    type="button"
                    disabled={isSelf || account.clinicalRole === "ADMIN"}
                    onClick={() => {
                      setEmployeeId(account.employeeId);
                      setReason("");
                      setMessage(
                        account.clinicalRole === "ADMIN"
                          ? "ADMIN access is reserved for the Owner or an authorized database administrator."
                          : "Account selected. Enter the reason for removing Reviewer or Lead access."
                      );
                      setFailed(account.clinicalRole === "ADMIN");
                    }}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 9,
                      border: "1px solid #113847",
                      background: "#ffffff",
                      color: "#113847",
                      fontWeight: 700,
                      cursor: isSelf || account.clinicalRole === "ADMIN" ? "not-allowed" : "pointer"
                    }}
                  >
                    {isSelf ? "Own Account" : account.clinicalRole === "ADMIN" ? "Owner only" : "Remove access"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {accounts.length === 0 && (
          <p>No clinical team members were found.</p>
        )}
      </section>
    </div>
  );
}