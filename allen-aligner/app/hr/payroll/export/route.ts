import { currentFinance } from "../../../lib/finance-auth";
import { db } from "../../../lib/database";
import { canAccessPayroll } from "../../../lib/payroll-access";

export const dynamic = "force-dynamic";

type PayrollRow = {
  employeeCode: string;
  fullName: string;
  month: string;
  basic: string;
  allowance: string;
  deduction: string;
  gross: string;
  net: string;
  status: string;
};

function csvCell(value: unknown): string {
  const original = String(value ?? "")
    .replace(/[\r\n]/g, " ")
    .trim();

  const safe = /^[=+\-@]/.test(original)
    ? "'" + original
    : original;

  return '"' + safe.replace(/"/g, '""') + '"';
}

export async function GET(request: Request) {
  const hr = await currentFinance().catch(() => null);

  if (!hr) {
    return new Response("Finance login required.", {
      status: 401
    });
  }

  if (!canAccessPayroll(hr.role)) {
    return new Response("Access denied.", {
      status: 403
    });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new Response("Invalid payroll month.", {
      status: 400
    });
  }

  let rows: PayrollRow[];

  try {
    rows = await db.query(
      `SELECT
         e."employeeCode"::text AS "employeeCode",
         e."fullName"::text AS "fullName",
         to_char(d."period",'YYYY-MM') AS month,
         d."basic"::text AS basic,
         d."allowance"::text AS allowance,
         d."deduction"::text AS deduction,
         d."gross"::text AS gross,
         d."net"::text AS net,
         d."status"::text AS status
       FROM "HRPayrollDraft" d
       JOIN "Employee" e
         ON e."id" = d."employeeId"
       WHERE d."period" = $1::date
         AND d."status" = 'DRAFT'
       ORDER BY e."employeeCode"
       LIMIT 5001`,
      [month + "-01"]
    ) as PayrollRow[];
  } catch (error) {
    console.error("Payroll export query failed:", error);

    return new Response("Payroll report unavailable.", {
      status: 500
    });
  }

  if (rows.length > 5000) {
    return new Response(
      "Report exceeds the 5000-record export limit.",
      { status: 409 }
    );
  }

  const headers = [
    "Employee ID",
    "Employee Name",
    "Payroll Month",
    "Basic Salary PKR",
    "Allowances PKR",
    "Deductions PKR",
    "Gross Salary PKR",
    "Net Salary PKR",
    "Payroll Status"
  ];

  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map(row =>
      [
        row.employeeCode,
        row.fullName,
        row.month,
        row.basic,
        row.allowance,
        row.deduction,
        row.gross,
        row.net,
        row.status
      ].map(csvCell).join(",")
    )
  ];

  return new Response(
    "\uFEFF" + lines.join("\r\n") + "\r\n",
    {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="Allen-Payroll-Draft-${month}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    }
  );
}
