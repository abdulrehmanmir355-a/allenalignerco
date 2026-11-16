"use client";
import { useState, type FormEvent } from "react";

type Row = {
  requestId: string;
  accountId: string;
  employeeId: string;
  employeeName: string;
  email: string;
  department: string;
  jobTitle: string;
  status: string;
  pathway: string;
  requestedRole: string;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
};

export default function RegistrationHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters = Object.fromEntries(new FormData(event.currentTarget));
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (String(value || "").trim()) params.set(key, String(value));
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/clinical/registrations?" + params.toString(), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to load registration history.");
      setRows(result.requests || []);
      setMessage(result.requests?.length ? "" : "No registration records match these filters.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load registration history.");
    } finally { setBusy(false); }
  }
  async function suspend(accountId: string) {
    const reason = window.prompt("Why are you suspending this clinical account? (At least 10 characters)");
    if (!reason || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const response = await fetch("/api/clinical/registrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suspend", accountId, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to suspend the account.");
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to suspend the account.");
    } finally { setBusy(false); }
  }
  return <section style={{ marginTop: 36 }}>
    <h2>Registration history</h2>
    <form onSubmit={load} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
      <label>Employee ID<input name="employeeId" /></label>
      <label>Email<input name="email" type="email" /></label>
      <label>Department<input name="department" /></label>
      <label>Status<select name="status" defaultValue=""><option value="">Any</option>{["INVITED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED", "REVOKED"].map(status => <option key={status}>{status}</option>)}</select></label>
      <button type="submit" disabled={busy}>Search</button>
    </form>
    {message && <p role="status">{message}</p>}
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th>Employee</th><th>Email</th><th>Department</th><th>Pathway</th><th>Status</th><th>Requested</th><th></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.requestId}><td>{row.employeeName}<br />{row.employeeId}</td><td>{row.email}</td><td>{row.department}<br />{row.jobTitle}</td><td>{row.pathway}<br />{row.requestedRole}</td><td>{row.status}</td><td>{new Date(row.requestedAt).toLocaleString()}</td><td>{row.status === "APPROVED" && <button type="button" disabled={busy} onClick={() => void suspend(row.accountId)}>Suspend</button>}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
