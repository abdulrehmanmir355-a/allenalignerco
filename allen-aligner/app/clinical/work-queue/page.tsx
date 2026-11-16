"use client";
import { useEffect, useState } from "react";
type Actor = {
  id: string;
  name: string;
  role: "REVIEWER" | "LEAD" | "ADMIN";
};
type Review = {
  caseId: string;
  patientReference: string;
  caseStatus: string;
  version: number;
  status: string;
  priority: string;
  assignedTo: string | null;
  reviewerName: string | null;
  createdAt: string;
};
type Dashboard = {
  actor: Actor;
  cases: Review[];
};
const navy = "#113847";
const teal = "#087989";
export default function ClinicalWorkQueue() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("ALL");
  const [status, setStatus] = useState("OPEN");
  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/clinical/reviews", {
        cache: "no-store",
        credentials: "same-origin",
        signal
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.message || "Clinical access denied."
        );
      }
      if (!result.actor || !Array.isArray(result.cases)) {
        throw new Error("Invalid Clinical API response.");
      }
      setData(result as Dashboard);
    } catch (err) {
      if (signal?.aborted) return;
      setData(null);
      setError(
        err instanceof Error ? err.message : "Loading failed."
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);
  const cases = data?.cases ?? [];
  const openStatuses = [
    "PENDING", "IN_REVIEW", "ESCALATED"
  ];
  const filtered = cases.filter(item => {
    const query = search.trim().toLowerCase();
    if (query &&
        !`${item.patientReference} ${item.caseId}
           ${item.reviewerName ?? ""}`
          .toLowerCase().includes(query)) {
      return false;
    }
    if (scope === "MINE" &&
        item.assignedTo !== data?.actor.id) return false;
    if (scope === "UNASSIGNED" &&
        item.assignedTo) return false;
    if (status === "OPEN" &&
        !openStatuses.includes(item.status)) return false;
    if (status === "COMPLETED" &&
        openStatuses.includes(item.status)) return false;
    return true;
  });
  const button = {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "11px 18px",
    borderRadius: 9,
    background: teal,
    color: "#ffffff",
    border: 0,
    fontWeight: 700 as const,
    textDecoration: "none",
    cursor: "pointer"
  };
  return (
    <main style={{
      maxWidth: 1250,
      margin: "25px auto",
      padding: 24,
      color: navy
    }}>
      <header style={{
        background: navy,
        borderRadius: 14,
        padding: 28,
        color: "#ffffff"
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Clinical Reviewer Work Queue
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Internal Clinical Operations
        </p>
      </header>
      {data && (
        <p style={{ margin: "20px 0" }}>
          Signed in: <strong>{data.actor.name}</strong>
          {" · "}
          {data.actor.role}
        </p>
      )}
      <nav style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        margin: "20px 0"
      }}>
        <a href="/clinical" style={button}>
          Clinical Workspace
        </a>
        {data?.actor.role === "ADMIN" && (
          <a href="/clinical/admin" style={{
            ...button,
            background: navy
          }}>
            Clinical Administration
          </a>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            ...button,
            background: "#ffffff",
            color: navy,
            border: `2px solid ${navy}`
          }}
        >
          {loading ? "Refreshing..." : "Refresh Queue"}
        </button>
      </nav>
      {loading && <p role="status">Loading reviews...</p>}
      {error && (
        <div role="alert">
          <p style={{ color: "#a12626" }}>{error}</p>
          <a href="/clinical/login">Clinical Login</a>
        </div>
      )}
      {data && (
        <>
          <section style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(170px,1fr))",
            gap: 14,
            margin: "25px 0"
          }}>
            {[
              ["Total Reviews", cases.length],
              ["Open Reviews", cases.filter(x =>
                openStatuses.includes(x.status)).length],
              ["Unassigned", cases.filter(x =>
                !x.assignedTo).length],
              ["My Reviews", cases.filter(x =>
                x.assignedTo === data.actor.id).length]
            ].map(([label, value]) => (
              <article key={label} style={{
                background: navy,
                padding: 20,
                borderRadius: 12,
                color: "#ffffff"
              }}>
                <div style={{
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 600
                }}>
                  {label}
                </div>
                <strong style={{
                  display: "block",
                  color: "#ffffff",
                  fontSize: 30,
                  marginTop: 12
                }}>
                  {value}
                </strong>
              </article>
            ))}
          </section>
          <section style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            marginBottom: 24
          }}>
            <input
              aria-label="Search cases"
              placeholder="Search case or reviewer"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: 12,
                border: "1px solid #cbd5df",
                borderRadius: 9,
                flex: "1 1 210px"
              }}
            />
            <select
              aria-label="Review ownership"
              value={scope}
              onChange={e => setScope(e.target.value)}
              style={{ padding: 12, borderRadius: 9 }}
            >
              <option value="ALL">All Visible Reviews</option>
              <option value="MINE">My Reviews</option>
              <option value="UNASSIGNED">Unassigned</option>
            </select>
            <select
              aria-label="Review status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              style={{ padding: 12, borderRadius: 9 }}
            >
              <option value="OPEN">Open</option>
              <option value="COMPLETED">Not Open</option>
              <option value="ALL">All Statuses</option>
            </select>
          </section>
          <p>{filtered.length} matching reviews</p>
          <section style={{
            display: "grid",
            gap: 14
          }}>
            {filtered.slice(0, 150).map((item, index) => (
              <article key={`${item.caseId}-${index}`} style={{
                background: "#ffffff",
                border: "1px solid #dce6eb",
                borderRadius: 12,
                padding: 22,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 18
              }}>
                <div>
                  <strong style={{ fontSize: 17 }}>
                    Case: {item.patientReference}
                  </strong>
                  <p>
                    Plan Version: {item.version}
                    {" · "}
                    Priority: {item.priority}
                  </p>
                  <p>
                    Review: <strong>{item.status}</strong>
                  </p>
                  <p>
                    Reviewer: {item.reviewerName ||
                      "Not assigned"}
                  </p>
                </div>
                <a
                  href={
                    "/clinical/cases/" +
                    encodeURIComponent(item.caseId)
                  }
                  style={button}
                >
                  Open Clinical Case
                </a>
              </article>
            ))}
          </section>
          {filtered.length > 150 && (
            <p>Showing the first 150 matching reviews.</p>
          )}
          {filtered.length === 0 && (
            <p>No matching reviews found.</p>
          )}
        </>
      )}
    </main>
  );
}