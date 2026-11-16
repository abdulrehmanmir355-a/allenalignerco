import { currentOwner } from "../../lib/owner-auth";

export const dynamic = "force-dynamic";

type OwnerMetrics = {
  database: string;
  measured_at: string;
  metrics: {
    total_employees: number;
    active_employees: number | null;
  };
};

const navy = "#113847";
const teal = "#087989";

export default async function OwnerAnalyticsPage() {
  const actor = await currentOwner().catch(() => null);


  const authorized = !!actor;

  if (!authorized) {
    return (
      <main style={{ padding: 35, color: navy }}>
        <h1>Owner Access Restricted</h1>
        <p>Explicitly authorized owner access is required.</p>
        <a href="/hr/login">Authorized Account Login</a>
      </main>
    );
  }

  let data: OwnerMetrics | null = null;
  let error = "";

  const key = process.env.AA_OWNER_ENGINE_KEY;

  if (!key) {
    error = "Python integration is not configured.";
  } else {
    try {
      const response = await fetch(
        "http://127.0.0.1:8100/owner/kpis",
        {
          headers: { "x-engine-key": key },
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!response.ok) {
        throw new Error("Python service returned an error.");
      }

      const result = await response.json() as OwnerMetrics;

      if (
        result.database !== "connected" ||
        typeof result.metrics?.total_employees !== "number"
      ) {
        throw new Error("Analytics data is unavailable.");
      }

      data = result;
    } catch {
      error = "Python Analytics Engine is unavailable.";
    }
  }

  const modules = [
    ["Cash & Finance", "Not Connected"],
    ["Clinical Cases", "Not Connected"],
    ["Production", "Not Connected"],
    ["Quality Control", "Not Connected"],
    ["Stock & Inventory", "Not Connected"],
    ["Machines", "Not Connected"]
  ];

  const cardStyle = {
    border: "1px solid #d9e5e9",
    borderRadius: 12,
    background: "#ffffff",
    padding: 22
  };

  return (
    <main style={{
      maxWidth: 1240,
      margin: "30px auto",
      padding: "0 24px 60px",
      color: navy
    }}>
      <header style={{
        padding: 30,
        borderRadius: 15,
        background: navy,
        color: "#ffffff"
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Owner Command Center
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Python Executive Intelligence
        </p>
      </header>

      <h2 style={{ marginTop: 30 }}>
        Live Employee Intelligence
      </h2>

      {error && (
        <p role="alert" style={{
          padding: 15,
          borderRadius: 10,
          background: "#fff0f0",
          color: "#991b1b"
        }}>
          {error}
        </p>
      )}

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(210px,1fr))",
        gap: 16,
        marginTop: 20
      }}>
        {[
          ["Total Employees", data?.metrics.total_employees],
          ["Active Employees", data?.metrics.active_employees]
        ].map(([label, value]) => (
          <article key={label} style={{
            background: navy,
            padding: 24,
            borderRadius: 12
          }}>
            <p style={{
              color: "#ffffff",
              marginTop: 0,
              fontWeight: 600
            }}>
              {label}
            </p>
            <strong style={{
              fontSize: 34,
              color: "#ffffff"
            }}>
              {value ?? "N/A"}
            </strong>
          </article>
        ))}
      </section>

      {data && (
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Source: PostgreSQL Employee Table · Measured:{" "}
          {data.measured_at}
        </p>
      )}

      <h2 style={{ marginTop: 35 }}>
        Enterprise Intelligence Modules
      </h2>

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(220px,1fr))",
        gap: 16
      }}>
        {modules.map(([name, status]) => (
          <article key={name} style={cardStyle}>
            <h3 style={{ fontSize: 17, color: navy }}>
              {name}
            </h3>
            <p style={{
              color: "#64748b",
              fontSize: 14
            }}>
              {status}
            </p>
          </article>
        ))}
      </section>

      <p style={{
        marginTop: 35,
        color: teal,
        fontWeight: 600
      }}>
        Python + PostgreSQL Intelligence Integration
      </p>
    </main>
  );
}