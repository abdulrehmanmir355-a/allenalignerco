import LocalModuleLogout from '@/app/components/local-module-logout';
import { redirect } from "next/navigation";
import { currentFinance } from "../../lib/finance-auth";
import { db } from "../../lib/database";
import { approvePayrollDraft, recordPayrollPayment, saveSalary } from "./actions";
import { canAccessPayroll, canApprovePayroll, canEditPayrollSalary, canRecordPayrollPayment } from "../../lib/payroll-access";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  status: string;
  basic: string | null;
  allowance: string | null;
  deduction: string | null;
};

type DraftRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  basic: string;
  allowance: string;
  deduction: string;
  gross: string;
  net: string;
  status: string;
  paymentReference: string | null;
  paymentMethod: string | null;
};

type HistoryRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  newBasic: string;
  reason: string;
  changedAt: string;
};

function money(value: string | null) {
  if (value === null) return "Not set";
  return "PKR " + Number(value).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export default async function PayrollPage({
  searchParams
}: {
  searchParams: Promise<{
    month?: string;
    result?: string;
  }>;
}) {
  const hr = await currentFinance().catch(() => null);

  if (!hr) redirect("/finance/login");

  if (!canAccessPayroll(hr.role)) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Access Denied</h1>
      </main>
    );
  }

  const params = await searchParams;

  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());

  const year = nowParts.find(p => p.type === "year")?.value;
  const currentMonth =
    nowParts.find(p => p.type === "month")?.value;

  const todayMonth = `${year}-${currentMonth}`;

  const selectedMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? "")
      ? String(params.month)
      : todayMonth;

  let employees: EmployeeRow[] = [];
  let drafts: DraftRow[] = [];
  let history: HistoryRow[] = [];
  let totalNet: string | null = null;
  let dataError = "";

  try {
    employees = await db.query(
      `SELECT
         e."id"::text AS id,
         e."employeeCode",
         e."fullName",
         e."status"::text AS status,
         s."basic"::text AS basic,
         s."allowance"::text AS allowance,
         s."deduction"::text AS deduction
       FROM "Employee" e
       LEFT JOIN "HRPayrollSalary" s
         ON s."employeeId" = e."id"
       ORDER BY e."fullName"
       LIMIT 500`
    ) as EmployeeRow[];

    drafts = await db.query(
      `SELECT
         d."id",
         e."employeeCode",
         e."fullName",
         d."basic"::text AS basic,
         d."allowance"::text AS allowance,
         d."deduction"::text AS deduction,
         d."gross"::text AS gross,
         d."net"::text AS net,
         d."status",
         d."paymentReference",
         d."paymentMethod"
       FROM "HRPayrollDraft" d
       JOIN "Employee" e
         ON e."id" = d."employeeId"
       WHERE d."period" = $1::date
       ORDER BY e."fullName"`,
      [selectedMonth + "-01"]
    ) as DraftRow[];

    const totals = await db.query(
      `SELECT COALESCE(SUM("net"), 0)::text AS total
       FROM "HRPayrollDraft"
       WHERE "period" = $1::date`,
      [selectedMonth + "-01"]
    );

    totalNet = totals[0]?.total ?? "0";

    history = await db.query(
      `SELECT
         h."id",
         e."employeeCode",
         e."fullName",
         h."newBasic"::text AS "newBasic",
         h."reason",
         to_char(
           h."changedAt" AT TIME ZONE 'Asia/Karachi',
           'YYYY-MM-DD HH24:MI'
         ) AS "changedAt"
       FROM "HRPayrollSalaryHistory" h
       JOIN "Employee" e
         ON e."id" = h."employeeId"
       ORDER BY h."changedAt" DESC
       LIMIT 20`
    ) as HistoryRow[];
  } catch (error) {
    console.error("Payroll dashboard failed:", error);
    dataError = "Payroll data unavailable. Check the migration.";
  }

  const messages: Record<string, string> = {
    saved: "Employee salary saved successfully.",
    unchanged: "No salary changes were needed.",
    generated: "New monthly payroll drafts generated.",
    none: "No new eligible payroll drafts to generate.",
    approved: "Payroll draft approved.",
    paid: "Payment recorded.",
    notdraft: "This payroll draft is no longer awaiting approval.",
    notapproved: "Approve this payroll draft before recording payment.",
    invalid: "Please check the entered information.",
    inactive: "Salary entry requires an ACTIVE employee.",
    missing: "Employee not found.",
    error: "Operation failed. Check the server log."
  };

  const inputStyle = {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 6,
    border: "1px solid #cbd5dc",
    borderRadius: 8
  };

  const buttonStyle = {
    background: "#087989",
    color: "#ffffff",
    padding: "13px 20px",
    border: 0,
    borderRadius: 9,
    fontWeight: 700 as const,
    cursor: "pointer"
  };

  return (
    <main className="aa-payroll" style={{
      maxWidth: 1250,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <style>{`
        .aa-payroll { font-family: Arial, sans-serif; }
        .aa-payroll h2 { letter-spacing: -.02em; }
        .aa-payroll > header, .aa-payroll > section, .aa-payroll > article {
          animation: aa-payroll-enter 420ms ease-out both;
        }
        .aa-payroll > section:nth-of-type(2) { animation-delay: 45ms; }
        .aa-payroll > section:nth-of-type(3) { animation-delay: 90ms; }
        .aa-payroll > section:nth-of-type(4) { animation-delay: 135ms; }
        .aa-payroll article { transition: transform 180ms ease, box-shadow 180ms ease; }
        .aa-payroll article:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 22px rgb(17 56 71 / 9%);
        }
        .aa-payroll a, .aa-payroll button {
          transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .aa-payroll a:hover, .aa-payroll button:hover { transform: translateY(-1px); }
        @keyframes aa-payroll-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .aa-payroll table tbody tr:nth-child(even) { background: #f7fafb; }
        .aa-payroll table tbody tr:hover { background: #edf6f6; }
        .aa-payroll [data-aa-payroll-report-tools] { flex-wrap: wrap; }
        .aa-payroll [data-aa-payroll-report-tools] a { max-width: 100%; }
        .aa-payroll [data-aa-payroll-table] {
          width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
        }
        .aa-payroll [data-aa-payroll-table] table { min-width: 720px; }
        .aa-payroll input, .aa-payroll select { max-width: 100%; box-sizing: border-box; }
        .aa-payroll h1 { font-size: clamp(1.45rem, 4vw, 2rem); }
        .aa-payroll h2 { font-size: clamp(1.12rem, 2.6vw, 1.5rem); }
        .aa-payroll input:focus, .aa-payroll select:focus {
          outline: 3px solid #9bd9dc; outline-offset: 1px; border-color: #087989;
        }
        .aa-payroll a:focus-visible, .aa-payroll button:focus-visible {
          outline: 3px solid #36a7b2; outline-offset: 3px;
        }
        @media (max-width: 640px) {
          .aa-payroll { margin: 0 auto !important; padding: 14px !important; }
          .aa-payroll header { padding: 20px !important; }
          .aa-payroll section { padding: 17px !important; }
          .aa-payroll h1 { font-size: 1.65rem; line-height: 1.2; }
          .aa-payroll h2 { font-size: 1.2rem; }
          .aa-payroll p, .aa-payroll label, .aa-payroll small, .aa-payroll th, .aa-payroll td {
            font-size: .9rem;
          }
          .aa-payroll header p { font-size: .88rem; }
          .aa-payroll article h2 { font-size: 1.45rem; }
          .aa-payroll [data-aa-payroll-table] table { font-size: .84rem; }
          .aa-payroll [data-aa-payroll-table] th,
          .aa-payroll [data-aa-payroll-table] td { padding: 9px !important; }
          .aa-payroll [data-aa-payroll-report-tools] { display: grid !important; grid-template-columns: 1fr; }
          .aa-payroll [data-aa-payroll-report-tools] a { width: 100%; box-sizing: border-box; text-align: center; }
          .aa-payroll form { min-width: 0; }
          .aa-payroll form label { min-width: 0; }
          .aa-payroll input, .aa-payroll select { font-size: 16px; }
          .aa-payroll [data-aa-payroll-table] { margin-left: -2px; width: calc(100% + 4px); }
        }
        @media (max-width: 380px) {
          .aa-payroll { padding: 10px !important; }
          .aa-payroll header { padding: 16px !important; }
          .aa-payroll section { padding: 13px !important; }
          .aa-payroll h1 { font-size: 1.4rem; }
          .aa-payroll h2 { font-size: 1.08rem; }
          .aa-payroll p, .aa-payroll label, .aa-payroll small { font-size: .84rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aa-payroll *, .aa-payroll *::before, .aa-payroll *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
      <header style={{
        background: "#113847",
        padding: 28,
        borderRadius: 14
      }}>
        <h1 style={{
          color: "#ffffff",
          margin: 0
        }}>
          Finance Management
        </h1>
        <p style={{ color: "#ffffff" }}>
          Allen Aligner — Salary Master & Monthly Drafts
        </p>
        <LocalModuleLogout module="finance"/>
      </header>

<div
  data-aa-payroll-report-tools="true"
  style={{
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    margin: "22px 0 28px"
  }}
>
  <a
    href={`/finance/export?month=${encodeURIComponent(selectedMonth)}`}
    style={{
      display: "inline-flex",
      padding: "14px 22px",
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      background: "#087989",
      color: "#ffffff",
      borderRadius: 10,
      fontWeight: 700,
      textDecoration: "none"
    }}
  >
    Download Monthly Payroll Report
  </a>

  <a
    href="/finance/payslips"
    style={{
      display: "inline-flex",
      padding: "14px 22px",
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      background: "#113847",
      color: "#ffffff",
      borderRadius: 10,
      fontWeight: 700,
      textDecoration: "none"
    }}
  >
    Employee Payslips
  </a>

  <a
    href="/hr/offboarding/dashboard"
    style={{
      display: "inline-flex",
      padding: "12px 20px",
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      background: "#ffffff",
      color: "#113847",
      border: "2px solid #113847",
      borderRadius: 10,
      fontWeight: 700,
      textDecoration: "none"
    }}
  >
    Back to HR Dashboard
  </a>
</div>

      {params.result && messages[params.result] && (
        <p role="status" style={{
          padding: 14,
          marginTop: 18,
          background: "#eaf4f4",
          borderRadius: 9
        }}>
          {messages[params.result]}
        </p>
      )}

      {dataError && (
        <p role="alert" style={{
          color: "#a12626",
          padding: 14
        }}>
          {dataError}
        </p>
      )}

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(220px,1fr))",
        gap: 16,
        marginTop: 24
      }}>
        <article style={{
          background: "#ffffff",
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 20
        }}>
          <p>Employee Records</p>
          <h2>{dataError ? "N/A" : employees.length}</h2>
          <small>First 500 employee records</small>
        </article>

        <article style={{
          background: "#ffffff",
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 20
        }}>
          <p>Payroll Drafts</p>
          <h2>{dataError ? "N/A" : drafts.length}</h2>
          <small>Selected payroll month</small>
        </article>

        <article style={{
          background: "#ffffff",
          border: "1px solid #dce7eb",
          borderRadius: 12,
          padding: 20
        }}>
          <p>Net Payroll Draft Total</p>
          <h2>{money(totalNet)}</h2>
          <small>Unapproved and unpaid</small>
        </article>
      </section>

      <section style={{
        background: "#ffffff",
        padding: 24,
        marginTop: 25,
        border: "1px solid #dce7eb",
        borderRadius: 14
      }}>
        <h2>Employee Salary Master</h2>

        {canEditPayrollSalary(hr.role) ? <form action={saveSalary} style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16
        }}>
          <label>
            Employee
            <select
              name="employeeId"
              required
              defaultValue=""
              style={inputStyle}
            >
              <option value="" disabled>
                Select Employee
              </option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.fullName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Basic Salary (PKR)
            <input
              type="number"
              name="basic"
              min="0.01"
              step="0.01"
              required
              style={inputStyle}
            />
          </label>

          <label>
            Allowances (PKR)
            <input
              type="number"
              name="allowance"
              min="0"
              step="0.01"
              defaultValue="0"
              required
              style={inputStyle}
            />
          </label>

          <label>
            Fixed Deductions (PKR)
            <input
              type="number"
              name="deduction"
              min="0"
              step="0.01"
              defaultValue="0"
              required
              style={inputStyle}
            />
          </label>

          <label>
            Effective Date
            <input
              type="date"
              name="effectiveFrom"
              required
              style={inputStyle}
            />
          </label>

          <label>
            Change Reason / Approval Reference
            <input
              name="reason"
              required
              minLength={5}
              maxLength={500}
              style={inputStyle}
            />
          </label>

          <div>
            <button type="submit" style={buttonStyle}>
              Save Salary Profile
            </button>
          </div>
        </form> : <p>Salary policy changes are restricted to HR administrators.</p>}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Current Employee Salary Records</h2>

        <div data-aa-payroll-table="true">
          <table style={{
            width: "100%",
            borderCollapse: "collapse"
          }}>
            <thead>
              <tr>
                {[
                  "Employee ID",
                  "Employee Name",
                  "Status",
                  "Basic Salary",
                  "Allowances",
                  "Deductions"
                ].map(col => (
                  <th key={col} style={{
                    textAlign: "left",
                    padding: 12,
                    background: "#113847",
                    color: "#ffffff"
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {employees.map(e => (
                <tr key={e.id} style={{
                  borderBottom: "1px solid #dce7eb"
                }}>
                  <td style={{ padding: 12 }}>
                    {e.employeeCode}
                  </td>
                  <td style={{ padding: 12 }}>
                    {e.fullName}
                  </td>
                  <td style={{ padding: 12 }}>
                    {e.status}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(e.basic)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(e.allowance)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(e.deduction)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Monthly Payroll Drafts</h2>

        <form method="get">
          <input
            type="month"
            name="month"
            defaultValue={selectedMonth}
          />
          <button type="submit" style={{
            ...buttonStyle,
            marginLeft: 10
          }}>
            View Month
          </button>
        </form>

        <div data-aa-payroll-table="true" style={{
          overflowX: "auto",
          marginTop: 16
        }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse"
          }}>
            <thead>
              <tr>
                {[
                  "Employee",
                  "Basic",
                  "Gross",
                  "Deductions",
                  "Net Pay",
                  "Status",
                  "Finance Action"
                ].map(col => (
                  <th key={col} style={{
                    textAlign: "left",
                    padding: 12,
                    background: "#113847",
                    color: "#ffffff"
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {drafts.map(d => (
                <tr key={d.id} style={{
                  borderBottom: "1px solid #dce7eb"
                }}>
                  <td style={{ padding: 12 }}>
                    {d.employeeCode} — {d.fullName}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(d.basic)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(d.gross)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {money(d.deduction)}
                  </td>
                  <td style={{ padding: 12 }}>
                    <strong>{money(d.net)}</strong>
                  </td>
                  <td style={{ padding: 12 }}>
                    <strong>{d.status}</strong>
                    {d.status === "PAID" && <small style={{ display: "block" }}>{d.paymentMethod?.replaceAll("_"," ")} · Ref {d.paymentReference}</small>}
                  </td>
                  <td style={{ padding: 12, minWidth: 210 }}>
                    {d.status === "DRAFT" && canApprovePayroll(hr.role) && <form action={approvePayrollDraft}>
                      <input type="hidden" name="draftId" value={d.id}/>
                      <input type="hidden" name="month" value={selectedMonth}/>
                      <button type="submit" style={buttonStyle}>Approve draft</button>
                    </form>}
                    {d.status === "APPROVED" && canRecordPayrollPayment(hr.role) && <form action={recordPayrollPayment} style={{ display:"grid",gap:7 }}>
                      <input type="hidden" name="draftId" value={d.id}/>
                      <input type="hidden" name="month" value={selectedMonth}/>
                      <select name="paymentMethod" required defaultValue="BANK_TRANSFER" style={{...inputStyle,marginTop:0}}>
                        <option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option><option value="OTHER">Other</option>
                      </select>
                      <input name="paymentReference" required minLength={3} maxLength={120} placeholder="Payment reference" style={{...inputStyle,marginTop:0}}/>
                      <input name="paidDate" type="date" required style={{...inputStyle,marginTop:0}}/>
                      <button type="submit" style={buttonStyle}>Record payment</button>
                    </form>}
                    {(d.status === "DRAFT" && !canApprovePayroll(hr.role) || d.status === "APPROVED" && !canRecordPayrollPayment(hr.role)) && <span>HR Admin action required</span>}
                    {d.status === "PAID" && <span>Payment recorded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {drafts.length === 0 && !dataError && (
          <p>No payroll drafts for this month.</p>
        )}
      </section>

      <section style={{ marginTop: 30 }}>
        <h2>Salary Revision History</h2>

        {history.map(h => (
          <article key={h.id} style={{
            padding: 16,
            marginBottom: 10,
            background: "#ffffff",
            border: "1px solid #dce7eb",
            borderRadius: 10
          }}>
            <strong>
              {h.employeeCode} — {h.fullName}
            </strong>
            <p>Revised Basic: {money(h.newBasic)}</p>
            <p>Reason: {h.reason}</p>
            <small>{h.changedAt} PKT</small>
          </article>
        ))}
      </section>

      <p style={{
        marginTop: 24,
        color: "#647887"
      }}>
        Payroll is in DRAFT mode only.
        Finance approval, statutory calculations,
        attendance adjustments and payments
        are not enabled in this module.
      </p>
    </main>
  );
}
