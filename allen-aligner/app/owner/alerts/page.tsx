import Link from "next/link";
import { currentOwner } from "../../lib/owner-auth";
export const dynamic = "force-dynamic";
const navy = "#113847";
const teal = "#087989";
const modules = [
  "Finance & Cash",
  "Clinical Cases",
  "Production",
  "Quality Control",
  "Stock & Inventory",
  "Machines",
  "People & HR"
];
export default async function OwnerAlertsPage() {
  const actor = await currentOwner().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 35 }}>
        <h1>Owner Access Restricted</h1>
        <p>Authorized owner account required.</p>
        <Link href="/hr/login">HR Login</Link>
      </main>
    );
  }
  const key = process.env.AA_OWNER_ENGINE_KEY;
  let issue = "";
  let connected = false;
  if (!key) {
    issue = "Python Engine secret is not configured.";
  } else {
    try {
      const response = await fetch(
        "http://127.0.0.1:8100/owner/kpis",
        {
          headers: { "x-engine-key": key },
          cache: "no-store",
          signal: AbortSignal.timeout(6000)
        }
      );
      if (!response.ok) {
        issue = response.status === 401
          ? "Python authentication mismatch."
          : "Python Analytics service returned an error.";
      } else {
        const data = await response.json();
        if (
          data.database === "connected" &&
          Number.isInteger(data.metrics?.total_employees)
        ) {
          connected = true;
        } else {
          issue = "Analytics database or data is unavailable.";
        }
      }
    } catch {
      issue = "Python Intelligence Engine is unreachable.";
    }
  }
  return (
    <main style={{
      maxWidth: 1200,
      margin: "30px auto",
      padding: "0 22px 60px",
      color: navy
    }}>
      <header style={{
        background: navy,
        color: "white",
        padding: 28,
        borderRadius: 14
      }}>
        <h1 style={{ margin: 0, color: "white" }}>
          OWNER RED ALERT CENTER
        </h1>
        <p>Allen Aligner — Executive Risk Monitoring</p>
        <Link
          href="/owner/analytics"
          style={{ color: "#9ce7eb" }}
        >
          Back to Owner Analytics
        </Link>
      </header>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 16,
        marginTop: 25
      }}>
        <article style={{
          padding: 24,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12
        }}>
          <h3>System Connectivity Alerts</h3>
          <strong style={{
            fontSize: 34,
            color: issue ? "#b42318" : teal
          }}>
            {issue ? 1 : 0}
          </strong>
        </article>
        <article style={{
          padding: 24,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: 12
        }}>
          <h3>Python + Database</h3>
          <strong style={{
            color: connected ? teal : "#b42318"
          }}>
            {connected ? "CONNECTED" : "ATTENTION"}
          </strong>
        </article>
      </section>
      <h2 style={{ marginTop: 32 }}>
        System Alerts
      </h2>
      {issue ? (
        <div role="alert" style={{
          border: "2px solid #b42318",
          borderRadius: 12,
          padding: 22,
          background: "#fff5f5"
        }}>
          <h3 style={{ color: "#b42318" }}>
            CRITICAL — Analytics Connectivity
          </h3>
          <p>{issue}</p>
          <p>
            Check the Python service and database.
            No automatic corrective action was taken.
          </p>
        </div>
      ) : (
        <div style={{
          border: "1px solid #9acfc8",
          borderRadius: 12,
          padding: 22
        }}>
          <h3 style={{ color: teal }}>
            Analytics Connection Healthy
          </h3>
          <p>
            Python and PostgreSQL are responding.
            Operational alert monitoring is not yet connected.
          </p>
        </div>
      )}
      <h2 style={{ marginTop: 32 }}>
        Operational Alert Sources
      </h2>
      <section style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 14
      }}>
        {modules.map((name) => (
          <article key={name} style={{
            padding: 20,
            background: "#fff",
            border: "1px solid #dce4e8",
            borderRadius: 12
          }}>
            <h3 style={{ color: navy }}>
              {name}
            </h3>
            <p style={{ color: "#64748b" }}>
              Alert rules not configured
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}