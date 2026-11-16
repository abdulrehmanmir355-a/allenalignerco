import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { db } from "@/app/lib/database";
export const dynamic = "force-dynamic";
type AuditRow = {
  id: string;
  actorName: string;
  action: string;
  detail: unknown;
};
const actions = [
  "ALL",
  "CLINICAL_REGISTRATION",
  "CLINICAL_REGISTRATION_DECISION",
  "TEAM_PERMISSION",
  "OWNER_CLINICAL_ADMIN_APPOINTED",
  "OWNER_CLINICAL_ADMIN_REMOVED",
  "DATABASE_CLINICAL_REGISTRATION_DECISION",
  "DATABASE_CLINICAL_ADMIN_APPOINTED",
  "DATABASE_CLINICAL_ADMIN_REMOVED"
] as const;
function obj(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
function label(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value
    : "—";
}
export default async function ClinicalAuditPage({
  searchParams
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const actor = await clinicalActor().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 30 }}>
        <h1>Clinical Login Required</h1>
        <Link href="/clinical/login">Clinical Login</Link>
      </main>
    );
  }
  if (actor.role !== "ADMIN") {
    return (
      <main style={{ padding: 30 }}>
        <h1>Access Denied</h1>
        <p>Administrator permission required.</p>
      </main>
    );
  }
  const params = await searchParams;
  const selected = actions.includes(
    params.action as (typeof actions)[number]
  ) ? params.action! : "ALL";
  let records: AuditRow[] = [];
  let error = "";
  try {
    records = await db.query(`
      SELECT
        id::text AS id,
        "actorName",
        action,
        detail
      FROM "ClinicalReviewAudit"
      WHERE action IN (
        'CLINICAL_REGISTRATION',
        'CLINICAL_REGISTRATION_DECISION',
        'TEAM_PERMISSION',
        'OWNER_CLINICAL_ADMIN_APPOINTED',
        'OWNER_CLINICAL_ADMIN_REMOVED',
        'DATABASE_CLINICAL_REGISTRATION_DECISION',
        'DATABASE_CLINICAL_ADMIN_APPOINTED',
        'DATABASE_CLINICAL_ADMIN_REMOVED'
      )
      AND ($1::text = 'ALL' OR action = $1)
      ORDER BY id DESC
      LIMIT 100
    `, [selected]) as AuditRow[];
  } catch (err) {
    console.error("Clinical audit loading failed:", err);
    error = "Unable to load clinical audit history.";
  }
  return (
    <main style={{
      maxWidth: 1150,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        padding: 26,
        color: "#ffffff",
        borderRadius: 14
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Clinical Audit History
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Administrator Access Only
        </p>
      </header>
      <p style={{ margin: "22px 0" }}>
        <Link href="/clinical/admin">
          ← Back to Clinical Admin
        </Link>
      </p>
      <nav aria-label="Audit filters" style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 24
      }}>
        {actions.map(action => (
          <Link
            key={action}
            href={`/clinical/admin/audit?action=${action}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "11px 15px",
              borderRadius: 9,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 700,
              background: selected === action
                ? "#087989" : "#ffffff",
              color: selected === action
                ? "#ffffff" : "#113847",
              border: "1px solid #087989"
            }}
          >
            {action.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {!error && (
        <p>Showing {records.length} audit entries (limit 100).</p>
      )}
      <section style={{ display: "grid", gap: 14 }}>
        {records.map(row => {
          const detail = obj(row.detail);
          const after = obj(detail.after);
          const changedRole =
            row.action === "TEAM_PERMISSION" || row.action.endsWith("_APPOINTED") || row.action.endsWith("_REMOVED")
              ? `${label(detail.before)} → ${detail.after === null ? "Removed" : label(detail.after)}`
              : label(after.role || detail.after);
          const status = label(after.status);
          const actorRole = label(detail.source || detail.decisionSource || after.decisionSource);
          const reason =
            typeof detail.reason === "string"
              ? detail.reason
              : typeof after.decisionReason === "string"
                ? after.decisionReason
                : "";
          return (
            <article key={row.id} style={{
              background: "#ffffff",
              border: "1px solid #dce6eb",
              borderRadius: 12,
              padding: 22
            }}>
              <strong style={{ color: "#087989" }}>
                {row.action.replaceAll("_", " ")}
              </strong>
              <p>
                <strong>Performed by:</strong>{" "}
                {label(row.actorName)}
              </p>
              {actorRole !== "—" && (
                <p><strong>Channel:</strong> {actorRole}</p>
              )}
              <p>
                <strong>Employee Account:</strong>{" "}
                <span style={{ overflowWrap: "anywhere" }}>
                  {label(detail.accountId)}
                </span>
              </p>
              {changedRole !== "—" && (
                <p><strong>Role:</strong> {changedRole}</p>
              )}
              {status !== "—" && (
                <p><strong>Request Status:</strong> {status}</p>
              )}
              {reason && (
                <p style={{ overflowWrap: "anywhere" }}>
                  <strong>Decision Reason:</strong> {reason}
                </p>
              )}
            </article>
          );
        })}
      </section>
      {!error && records.length === 0 && (
        <p>No matching audit entries found.</p>
      )}
      <p style={{
        color: "#64748b",
        fontSize: 13,
        marginTop: 25
      }}>
        Read-only records. No permissions or clinical
        cases can be changed from this page.
      </p>
    </main>
  );
}