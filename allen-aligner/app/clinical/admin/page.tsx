import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { db } from "@/app/lib/database";
export const dynamic = "force-dynamic";
type Counts = {
  pending: number;
  approved: number;
  rejected: number;
  activeTeam: number;
};
const sections = [
  {
    title: "Registration Approvals",
    description: "Review and decide pending clinical access requests.",
    href: "/clinical/admin/approvals"
  },
  {
    title: "Clinical Team Management",
    description: "Remove Reviewer or Lead access. Administrator appointment stays with the Owner.",
    href: "/clinical/admin/team"
  },
  {
    title: "Clinical Audit History",
    description: "Review registration and permission changes.",
    href: "/clinical/admin/audit"
  }
];
export default async function ClinicalAdminHome() {
  const actor = await clinicalActor().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Clinical Login Required</h1>
        <Link href="/clinical/login">Internal Clinical Login</Link>
      </main>
    );
  }
  if (actor.role !== "ADMIN") {
    return (
      <main style={{ padding: 32 }}>
        <h1>Access Denied</h1>
        <p>Clinical Administrator permission required.</p>
      </main>
    );
  }
  let counts: Counts | null = null;
  let error = "";
  try {
    const rows = await db.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE w."clinicalRequest"->>'status' = 'PENDING'
        )::int AS pending,
        COUNT(*) FILTER (
          WHERE w."clinicalRequest"->>'status' = 'APPROVED'
        )::int AS approved,
        COUNT(*) FILTER (
          WHERE w."clinicalRequest"->>'status' = 'REJECTED'
        )::int AS rejected,
        COUNT(*) FILTER (
          WHERE w."clinicalRole" IS NOT NULL
            AND w."isActive"
            AND e.status = 'ACTIVE'
        )::int AS "activeTeam"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
    `) as Counts[];
    counts = rows[0] ?? null;
  } catch (err) {
    console.error("Clinical admin summary error:", err);
    error = "Clinical records could not be loaded.";
  }
  const stats = [
    ["Pending Requests", counts?.pending],
    ["Approved Requests", counts?.approved],
    ["Rejected Requests", counts?.rejected],
    ["Active Clinical Team", counts?.activeTeam]
  ] as const;
  return (
    <main style={{
      maxWidth: 1200,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        color: "#ffffff",
        borderRadius: 14,
        padding: 28
      }}>
        <h1 style={{ margin: 0, color: "#ffffff" }}>
          Clinical Admin Control Center
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Internal Clinical Administration
        </p>
        <small>Administrator: {actor.name}</small>
      </header>
      {error && <p role="alert">{error}</p>}
      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(190px,1fr))",
        gap: 16,
        margin: "25px 0 32px"
      }}>
        {stats.map(([label, value]) => (
          <article key={label} style={{
            background: "#ffffff",
            border: "1px solid #dce6eb",
            borderRadius: 12,
            padding: 22
          }}>
            <p style={{ marginTop: 0 }}>{label}</p>
            <strong style={{
              fontSize: 32,
              color: "#087989"
            }}>
              {value ?? "—"}
            </strong>
          </article>
        ))}
      </section>
      <h2>Administration Modules</h2>
      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(260px,1fr))",
        gap: 18
      }}>
        {sections.map(section => (
          <Link
            key={section.href}
            href={section.href}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 24,
              background: "#ffffff",
              border: "1px solid #dce6eb",
              borderRadius: 12,
              color: "#113847",
              textDecoration: "none"
            }}
          >
            <strong style={{ fontSize: 18 }}>
              {section.title}
            </strong>
            <span style={{ fontSize: 14 }}>
              {section.description}
            </span>
            <span style={{
              marginTop: "auto",
              color: "#087989",
              fontWeight: 700
            }}>
              Open Module →
            </span>
          </Link>
        ))}
      </section>
      <p style={{ marginTop: 28 }}>
        <Link href="/clinical">Back to Clinical Workspace</Link>
      </p>
    </main>
  );
}