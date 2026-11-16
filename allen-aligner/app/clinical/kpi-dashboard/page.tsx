import { currentHR } from "../../lib/hr-auth";
import { db } from "../../lib/database";

export const dynamic = "force-dynamic";

type CountRow = { total: number };
type StatusRow = { status: string; total: number };

export default async function ClinicalKPIDashboard({
  searchParams
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const hr = await currentHR().catch(() => null);

  if (
    !hr ||
    hr.role !== "HR_ADMIN" ||
    process.env.NODE_ENV !== "development"
  ) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Access Denied</h1>
        <p>Authorized clinical management access required.</p>
      </main>
    );
  }

  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.days))
    ? Number(params.days)
    : 30;

  let cases: number | null = null;
  let plans: number | null = null;
  let statuses: StatusRow[] = [];
  const problems: string[] = [];

  try {
    const rows = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM "PortalCase"
       WHERE "createdAt" >=
         NOW() - ($1::int * INTERVAL '1 day')`,
      [days]
    ) as CountRow[];

    cases = Number(rows[0]?.total ?? 0);
  } catch (error) {
    console.error("Case KPI query:", error);
    problems.push("Case statistics are unavailable.");
  }

  try {
    const rows = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM "TreatmentPlan"`
    ) as CountRow[];

    plans = Number(rows[0]?.total ?? 0);
  } catch (error) {
    console.error("Treatment plan KPI query:", error);
    problems.push("Treatment plan statistics are unavailable.");
  }

  try {
    statuses = await db.query(
      `SELECT
         COALESCE("status"::text, 'Unknown') AS status,
         COUNT(*)::int AS total
       FROM "PortalCase"
       WHERE "createdAt" >=
         NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY "status"
       ORDER BY total DESC`,
      [days]
    ) as StatusRow[];
  } catch (error) {
    console.error("Status KPI query:", error);
    problems.push("Case status breakdown is unavailable.");
  }

  const cards = [
    {
      title: "Cases Received",
      value: cases,
      note: `Last ${days} days`
    },
    {
      title: "Treatment Plan Records",
      value: plans,
      note: "All-time total"
    },
    {
      title: "Pending Clinical Review",
      value: null,
      note: "Review source verification required"
    },
    {
      title: "Clinical Approval Rate",
      value: null,
      note: "Approval history verification required"
    },
    {
      title: "Doctor Approval Rate",
      value: null,
      note: "Doctor decision history required"
    },
    {
      title: "Average Review Time",
      value: null,
      note: "Clinical timestamps required"
    }
  ];

  const max = Math.max(
    1,
    ...statuses.map(s => Number(s.total))
  );

  return (
    <main style={{
      maxWidth: 1250,
      margin: "30px auto",
      padding: 24,
      fontFamily: "Arial, sans-serif",
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        padding: 28,
        borderRadius: 14,
        color: "#ffffff"
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Clinical KPI Dashboard
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Management Analytics
        </p>
        <small>Development Preview · PostgreSQL Data</small>
      </header>

      <form method="get" style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        margin: "24px 0"
      }}>
        <label htmlFor="period">Reporting Period</label>
        <select
          id="period"
          name="days"
          defaultValue={String(days)}
          style={{
            padding: 12,
            borderRadius: 8
          }}
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>

        <button type="submit" style={{
          background: "#087989",
          color: "#ffffff",
          padding: "12px 20px",
          border: 0,
          borderRadius: 8
        }}>
          Apply
        </button>
      </form>

      {problems.map(problem => (
        <p key={problem} role="alert" style={{
          color: "#a12626",
          background: "#fff2f2",
          padding: 12,
          borderRadius: 8
        }}>
          {problem}
        </p>
      ))}

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16
      }}>
        {cards.map(card => (
          <article key={card.title} style={{
            background: "#ffffff",
            border: "1px solid #dce7eb",
            borderRadius: 12,
            padding: 22
          }}>
            <div style={{ color: "#536876" }}>
              {card.title}
            </div>

            <strong style={{
              display: "block",
              fontSize: 32,
              margin: "14px 0"
            }}>
              {card.value === null
                ? "N/A"
                : card.value.toLocaleString()}
            </strong>

            <small style={{ color: "#536876" }}>
              {card.note}
            </small>
          </article>
        ))}
      </section>

      <section style={{
        marginTop: 28,
        background: "#ffffff",
        border: "1px solid #dce7eb",
        borderRadius: 12,
        padding: 24
      }}>
        <h2>Case Status Distribution</h2>

        {statuses.length === 0 && (
          <p>No status data available.</p>
        )}

        {statuses.map(item => (
          <div key={item.status} style={{
            marginBottom: 18
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 7
            }}>
              <strong>{item.status}</strong>
              <span>{item.total}</span>
            </div>

            <div style={{
              height: 14,
              background: "#edf2f5",
              borderRadius: 8,
              overflow: "hidden"
            }}>
              <div style={{
                width: `${Number(item.total) / max * 100}%`,
                background: "#087989",
                height: "100%"
              }} />
            </div>
          </div>
        ))}
      </section>

      <p style={{
        color: "#647887",
        marginTop: 24
      }}>
        All displayed numeric values come from database queries.
        Unverified clinical and doctor approval KPIs show N/A.
      </p>
    </main>
  );
}