
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { db } from "../../../lib/database";

export const dynamic = "force-dynamic";

type HistoryRecord = {
  id: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  previousDepartment: string;
  newDepartment: string;
  previousDesignation: string;
  newDesignation: string;
  effectiveDate: string;
  reason: string;
  approvalReference: string;
  changedBy: string;
  changedAt: string;
};

export default async function PositionHistoryPage() {
  const hr = await currentHR().catch(() => null);

  if (!hr) redirect("/hr/login");

  if (hr.role !== "HR_ADMIN") {
    return (
      <main style={{ padding: 40 }}>
        <h1>Access Denied</h1>
        <p>Only HR Administrators can access this page.</p>
      </main>
    );
  }

  let records: HistoryRecord[] = [];
  let error = "";

  try {
    records = await db.query(
      `SELECT
         h."id",
         h."employeeId",
         e."employeeCode",
         e."fullName",
         h."previousDepartment",
         h."newDepartment",
         h."previousDesignation",
         h."newDesignation",
         h."effectiveDate",
         h."reason",
         h."approvalReference",
         h."changedBy",
         h."changedAt"
       FROM "EmployeePositionHistory" h
       JOIN "Employee" e ON e."id" = h."employeeId"
       ORDER BY h."changedAt" DESC
       LIMIT 200`
    ) as HistoryRecord[];
  } catch {
    error = "Position history is unavailable. Please verify the database migration.";
  }

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Not available"
      : date.toLocaleDateString("en-GB");
  };

  return (
    <main style={{
      maxWidth: 1150,
      margin: "30px auto",
      padding: 24,
      color: "#163541"
    }}>
      <header style={{
        background: "#113847",
        color: "#ffffff",
        padding: 26,
        borderRadius: 14
      }}>
        <h1 style={{ color: "#ffffff", margin: 0 }}>
          Employee Position History
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — HR Administration
        </p>
      </header>

      <p style={{ marginTop: 20 }}>
        <Link href="/hr/employees/directory">
          Back to Employee Directory
        </Link>
      </p>

      <h2>Promotion & Transfer Records</h2>

      {error && <p role="alert">{error}</p>}

      {!error && records.length === 0 && (
        <p>No position changes recorded yet.</p>
      )}

      {!error && records.map(record => (
        <section key={record.id} style={{
          background: "#ffffff",
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16
        }}>
          <h3>{record.fullName}</h3>

          <p>
            <strong>Employee ID:</strong>{" "}
            {record.employeeCode}
          </p>

          <p>
            <strong>Previous Position:</strong>{" "}
            {record.previousDesignation}
          </p>

          <p>
            <strong>New Position:</strong>{" "}
            {record.newDesignation}
          </p>

          <p>
            <strong>Department:</strong>{" "}
            {record.previousDepartment}
            {" → "}
            {record.newDepartment}
          </p>

          <p>
            <strong>Effective Date:</strong>{" "}
            {formatDate(record.effectiveDate)}
          </p>

          <p>
            <strong>Reason:</strong> {record.reason}
          </p>

          <p>
            <strong>Approval Reference:</strong>{" "}
            {record.approvalReference}
          </p>

          <p>
            <strong>Changed At:</strong>{" "}
            {formatDate(record.changedAt)}
          </p>

          <Link
            href={`/hr/employees/${encodeURIComponent(record.employeeId)}/history`}
            style={{
              display: "inline-block",
              background: "#087989",
              color: "#ffffff",
              padding: "10px 16px",
              borderRadius: 8,
              textDecoration: "none"
            }}
          >
            View Employee History
          </Link>
        </section>
      ))}
    </main>
  );
}
