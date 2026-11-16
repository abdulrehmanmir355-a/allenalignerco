import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { db } from "@/app/lib/database";
import TeamPanel, { type TeamAccount } from "./team-panel";
export const dynamic = "force-dynamic";
export default async function ClinicalTeamPage() {
  const actor = await clinicalActor().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Clinical Login Required</h1>
        <Link href="/clinical/login">Clinical Login</Link>
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
  let team: TeamAccount[] = [];
  let error = "";
  try {
    team = await db.query(`
      SELECT
        w.id::text AS "accountId",
        e."permanentId"::text AS "employeeId",
        e."fullName"::text AS "fullName",
        w."clinicalRole"::text AS "clinicalRole",
        w."isActive" AS "isActive",
        w."mustChangePassword" AS "mustChangePassword",
        e.status::text AS "employeeStatus"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE w."clinicalRole" IS NOT NULL
      ORDER BY e."fullName"
      LIMIT 500
    `) as TeamAccount[];
  } catch (err) {
    console.error("Clinical team query failed:", err);
    error = "Unable to load clinical team records.";
  }
  return (
    <main style={{
      maxWidth: 1150,
      margin: "25px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        borderRadius: 14,
        padding: 28,
        color: "#ffffff"
      }}>
        <h1 style={{ margin: 0, color: "#ffffff" }}>
          Clinical Team Management
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Clinical Roles & Permissions
        </p>
      </header>
      <nav style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        margin: "22px 0"
      }}>
        <Link href="/clinical/admin/approvals">
          Registration Approvals
        </Link>
        <Link href="/clinical">
          Clinical Workspace
        </Link>
      </nav>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <TeamPanel
          accounts={team}
          administratorId={actor.id}
        />
      )}
    </main>
  );
}