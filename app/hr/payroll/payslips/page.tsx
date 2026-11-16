import { redirect } from "next/navigation";
import { currentFinance } from "../../../lib/finance-auth";
import { db } from "../../../lib/database";
import { canAccessPayroll } from "../../../lib/payroll-access";

export const dynamic = "force-dynamic";

type Payslip = {
  id: string;
  employeeCode: string;
  fullName: string;
  period: string;
  basic: string;
  allowance: string;
  deduction: string;
  gross: string;
  net: string;
  status: string;
};

function money(v: string) {
  return "PKR " + Number(v).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

const cell = {
  padding: "12px",
  borderBottom: "1px solid #e0e8ec",
  textAlign: "left" as const
};

const button = {
  display: "inline-block",
  padding: "12px 18px",
  background: "#087989",
  color: "#ffffff",
  borderRadius: 9,
  textDecoration: "none",
  fontWeight: 700 as const
};

export default async function PayslipsPage({
  searchParams
}: {
  searchParams: Promise<{
    month?: string;
    id?: string;
  }>;
}) {
  const hr = await currentFinance().catch(() => null);

  if (!hr) redirect("/finance/login");

  if (!canAccessPayroll(hr.role)) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Access Denied</h1>
        <p>You are not authorized to view salary records.</p>
      </main>
    );
  }

  const params = await searchParams;

  const month =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
      ? params.month!
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Karachi",
          year: "numeric",
          month: "2-digit"
        }).format(new Date()).slice(0, 7);

  const id = params.id ?? "";
  const validId = /^[a-f0-9-]{36}$/i.test(id);

  let rows: Payslip[] = [];
  let selected: Payslip | null = null;
  let errorMessage = "";

  try {
    if (validId) {
      const result = await db.query(
        `SELECT
           d."id"::text AS id,
           e."employeeCode",
           e."fullName",
           to_char(d."period",'YYYY-MM') AS period,
           d."basic"::text AS basic,
           d."allowance"::text AS allowance,
           d."deduction"::text AS deduction,
           d."gross"::text AS gross,
           d."net"::text AS net,
           d."status"
         FROM "HRPayrollDraft" d
         JOIN "Employee" e
           ON e."id" = d."employeeId"
         WHERE d."id" = $1::uuid`,
        [id]
      );

      selected = (result[0] as Payslip) ?? null;
    } else {
      rows = await db.query(
        `SELECT
           d."id"::text AS id,
           e."employeeCode",
           e."fullName",
           to_char(d."period",'YYYY-MM') AS period,
           d."basic"::text AS basic,
           d."allowance"::text AS allowance,
           d."deduction"::text AS deduction,
           d."gross"::text AS gross,
           d."net"::text AS net,
           d."status"
         FROM "HRPayrollDraft" d
         JOIN "Employee" e
           ON e."id" = d."employeeId"
         WHERE d."period" = $1::date
         ORDER BY e."fullName"
         LIMIT 500`,
        [month + "-01"]
      ) as Payslip[];
    }
  } catch (error) {
    console.error("Payslip query failed:", error);
    errorMessage =
      "Unable to load payslips. Check the payroll database.";
  }

  return (
    <main style={{
      maxWidth: 1150,
      margin: "25px auto",
      padding: 25,
      fontFamily: "Arial, sans-serif",
      color: "#113847"
    }}>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          main { margin: 0 !important; padding: 0 !important; }
          .payslip-sheet { border: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 20 }}>
        <a href="/finance" style={{
          color: "#087989",
          fontWeight: 700
        }}>
          Back to Payroll
        </a>
      </div>

      <header className="no-print" style={{
        background: "#113847",
        padding: 24,
        borderRadius: 12,
        color: "#ffffff"
      }}>
        <h1 style={{ margin: 0 }}>
          Allen Aligner — Payroll Payslips
        </h1>
        <p>HR Administration · Confidential</p>
      </header>

      {errorMessage && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {errorMessage}
        </p>
      )}

      {selected ? (
        <>
          <div className="no-print" style={{ marginTop: 20 }}>
            <p>
              To print or save as PDF, press
              <strong> Ctrl + P</strong>.
            </p>
          </div>

          <section className="payslip-sheet" style={{
            border: "1px solid #ccd8dd",
            borderRadius: 12,
            padding: 30,
            marginTop: 20,
            background: "#ffffff"
          }}>
            <h1 style={{
              marginBottom: 5,
              color: "#113847"
            }}>
              ALLEN ALIGNER
            </h1>

            <p>Employee Salary Statement</p>

            <div style={{
              background: "#fff1db",
              border: "1px solid #deb76c",
              padding: 12,
              fontWeight: 700
            }}>
              DRAFT — NOT APPROVED FOR PAYMENT
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 15,
              marginTop: 25
            }}>
              <p><strong>Employee ID:</strong> {selected.employeeCode}</p>
              <p><strong>Payroll Month:</strong> {selected.period}</p>
              <p><strong>Employee:</strong> {selected.fullName}</p>
              <p><strong>Status:</strong> {selected.status}</p>
            </div>

            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 20
            }}>
              <thead>
                <tr style={{
                  background: "#113847",
                  color: "#ffffff"
                }}>
                  <th style={cell}>Description</th>
                  <th style={cell}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={cell}>Basic Salary</td>
                  <td style={cell}>{money(selected.basic)}</td>
                </tr>
                <tr>
                  <td style={cell}>Allowances</td>
                  <td style={cell}>{money(selected.allowance)}</td>
                </tr>
                <tr>
                  <td style={cell}>Gross Salary</td>
                  <td style={cell}>{money(selected.gross)}</td>
                </tr>
                <tr>
                  <td style={cell}>Fixed Deductions</td>
                  <td style={cell}>{money(selected.deduction)}</td>
                </tr>
                <tr style={{
                  background: "#e7f4f4",
                  fontWeight: 700
                }}>
                  <td style={cell}>Draft Net Salary</td>
                  <td style={cell}>{money(selected.net)}</td>
                </tr>
              </tbody>
            </table>

            <p style={{
              marginTop: 30,
              fontSize: 12,
              color: "#64748b"
            }}>
              This is a preliminary payroll calculation.
              It is not proof of salary approval or payment.
            </p>
          </section>
        </>
      ) : (
        <>
          <section className="no-print" style={{
            marginTop: 25,
            padding: 20,
            background: "#ffffff",
            border: "1px solid #dce7eb",
            borderRadius: 12
          }}>
            <h2>Monthly Payslip Register</h2>

            <form method="get">
              <label>
                Select Payroll Month{" "}
                <input
                  type="month"
                  name="month"
                  defaultValue={month}
                  required
                />
              </label>
              {" "}
              <button type="submit" style={{
                padding: 10,
                background: "#087989",
                color: "#ffffff",
                border: 0,
                borderRadius: 7
              }}>
                Search
              </button>
            </form>
          </section>

          <div style={{
            overflowX: "auto",
            marginTop: 25
          }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse"
            }}>
              <thead>
                <tr style={{
                  background: "#113847",
                  color: "#ffffff"
                }}>
                  {[
                    "Employee ID",
                    "Employee Name",
                    "Month",
                    "Draft Net Salary",
                    "Status",
                    "Action"
                  ].map(h => (
                    <th key={h} style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={cell}>{r.employeeCode}</td>
                    <td style={cell}>{r.fullName}</td>
                    <td style={cell}>{r.period}</td>
                    <td style={cell}>{money(r.net)}</td>
                    <td style={cell}>{r.status}</td>
                    <td style={cell}>
                      <a
                        href={`/finance/payslips?id=${r.id}`}
                        style={button}
                      >
                        Preview Slip
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!errorMessage && rows.length === 0 && (
              <p>No payroll drafts found for this month.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
