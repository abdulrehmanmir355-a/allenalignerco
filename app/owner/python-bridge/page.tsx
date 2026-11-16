"use client";
import { useEffect, useState } from "react";
type Result = {
  ok: boolean;
  data?: unknown;
  message?: string;
};
type Bridge = {
  health: Result;
  kpis: Result;
  checkedAt: string;
};
function readMetric(
  source: unknown,
  name: string
): string {
  if (!source || typeof source !== "object") {
    return "—";
  }
  const data = source as Record<string, unknown>;
  const value = data[name];
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "—";
}
export default function OwnerPythonBridge() {
  const [data, setData] = useState<Bridge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/owner/python-bridge",
        { cache: "no-store" }
      );
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Owner login required"
            : `Request failed: ${response.status}`
        );
      }
      setData((await response.json()) as Bridge);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load"
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #dce8ed",
    borderRadius: 12,
    padding: 20,
    minWidth: 0,
  };
  return (
    <main style={{
      maxWidth: 1100,
      margin: "auto",
      padding: "32px 20px",
      background: "#f5f9fa",
      minHeight: "100vh"
    }}>
      <h1>Owner Command Center</h1>
      <p>Python + JavaScript Live Connection</p>
      <button
        type="button"
        className="button"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? "Checking..." : "Refresh Live Data"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 24
          }}>
            <section style={card}>
              <h2>Python Server</h2>
              <strong>
                {data.health.ok ? "Connected" : "Offline / Error"}
              </strong>
              {!data.health.ok &&
                <p>{data.health.message}</p>}
            </section>
            <section style={card}>
              <h2>Employee Records</h2>
              <strong style={{ fontSize: 30 }}>
                {readMetric(
                  data.kpis.data,
                  "total_employees"
                )}
              </strong>
            </section>
            <section style={card}>
              <h2>Active Employees</h2>
              <strong style={{ fontSize: 30 }}>
                {readMetric(
                  data.kpis.data,
                  "active_employees"
                )}
              </strong>
            </section>
          </div>
          <section style={{ ...card, marginTop: 20 }}>
            <h2>Python KPI Connection</h2>
            <p>
              {data.kpis.ok
                ? "KPI API connected"
                : data.kpis.message}
            </p>
            <h3>Returned Data</h3>
            <pre style={{
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere"
            }}>
              {data.kpis.ok
                ? JSON.stringify(
                    data.kpis.data,
                    null,
                    2
                  )
                : "No KPI data available"}
            </pre>
            <p>
              Last checked: {data.checkedAt}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
