import Link from "next/link";
import { clinicalActor } from "@/app/lib/clinical-auth";
import { db } from "@/app/lib/database";
import ApprovalQueue from "./approval-queue";
import RegistrationHistory from "./registration-history";
export const dynamic = "force-dynamic";
export type RequestRow = {
  accountId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  employeeStatus: string;
  accountActive: boolean;
  mustChangePassword: boolean;
  requestedRole: string;
  reason: string;
  requestedAt: string;
};
export default async function Page() {
  const actor = await clinicalActor().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 35 }}>
        <h1>Clinical Administrator Login Required</h1>
        <Link href="/clinical/login">Internal Clinical Login</Link>
        <p>No Clinical Administrator may have been appointed yet. An authenticated Owner can bootstrap the first administrator and review pending registrations through the Owner Command Center.</p>
        <Link href="/owner-login">Owner sign in</Link>
      </main>
    );
  }
  if (actor.role !== "ADMIN") {
    return (
      <main style={{ padding: 35 }}>
        <h1>Access Denied</h1>
        <p>Clinical Administrator permission is required.</p>
      </main>
    );
  }
  let rows: RequestRow[] = [];
  let error = "";
  try {
    rows = await db.query(`
      SELECT
        w.id::text AS "accountId",
        e."permanentId" AS "employeeId",
        e."fullName" AS "employeeName",
        e.status AS "employeeStatus",
        w."isActive" AS "accountActive",
        w."mustChangePassword" AS "mustChangePassword",
        w."clinicalRequest"->>'id' AS "requestId",
        w."clinicalRequest"->>'role' AS "requestedRole",
        w."clinicalRequest"->>'reason' AS reason,
        w."clinicalRequest"->>'requestedAt' AS "requestedAt"
      FROM "WorkAccount" w
      JOIN "ClinicalIdentity" e ON e."accountId"=w.id
      WHERE w."clinicalRequest"->>'status' = 'PENDING'
      ORDER BY w."clinicalRequest"->>'requestedAt'
      LIMIT 200
    `) as RequestRow[];
  } catch (e) {
    console.error("Clinical requests loading failed:", e);
    error = "Unable to load registration requests.";
  }
  return (
    <main style={{
      maxWidth: 1150,
      margin: "28px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        color: "#ffffff",
        borderRadius: 14,
        padding: 28
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Clinical Access Administration
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Internal Clinical Team
        </p>
      </header>
      <nav style={{ margin: "20px 0" }}>
        <Link href="/clinical">Clinical Workspace</Link>
      </nav>
      <section style={{
        background: "#ffffff",
        padding: 24,
        borderRadius: 12,
        border: "1px solid #dce6eb",
        marginTop: 20
      }}>
        <p>Pending Clinical Registration Requests</p>
        <strong style={{ fontSize: 34, color: "#087989" }}>
          {error ? "—" : rows.length}
        </strong>
        {rows.length === 200 && (
          <p>Showing the first 200 pending requests.</p>
        )}
      </section>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <ApprovalQueue
          initialRequests={rows}
          administratorId={actor.id}
        />
      )}
      <RegistrationHistory />
    </main>
  );
}
