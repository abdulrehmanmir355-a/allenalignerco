import { redirect } from "next/navigation";
import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";
export const dynamic = "force-dynamic";
type EmployeeRow = {
  code: string;
  name: string;
  department: string;
  designation: string;
  status: string;
};
export default async function LiveEmployeesPage() {
  const actor = await currentOwner();
  if (!actor) redirect("/owner-login");
  let employees: EmployeeRow[] = [];
  let message = "";
  let tableName = "";
  try {
    const found = (await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND lower(table_name) IN (
          'employee', 'hremployee', 'employees'
        )
      ORDER BY table_name
    `)) as Array<{ table_name: string }>;
    if (found.length === 0) {
      message =
        "Employee table not identified. Database schema needs checking.";
    } else if (found.length > 1) {
      message =
        "Multiple employee tables found: " +
        found.map(t => t.table_name).join(", ") +
        ". Select the correct source before connecting.";
    } else {
      tableName = found[0].table_name;
      // Table identifier originates from database metadata.
      // Escape quotes before including it in SQL.
      const safeTable = tableName.replace(/"/g, '""');
      const records = (await db.query(`
        SELECT
          COALESCE(
            to_jsonb(e)->>'employeeCode',
            to_jsonb(e)->>'employeeNo',
            to_jsonb(e)->>'employeeNumber',
            to_jsonb(e)->>'id',
            ''
          ) AS code,
          COALESCE(
            to_jsonb(e)->>'fullName',
            to_jsonb(e)->>'name',
            ''
          ) AS name,
          COALESCE(
            to_jsonb(e)->>'department',
            to_jsonb(e)->>'departmentName',
            ''
          ) AS department,
          COALESCE(
            to_jsonb(e)->>'designation',
            to_jsonb(e)->>'designationName',
            to_jsonb(e)->>'jobTitle',
            ''
          ) AS designation,
          COALESCE(
            to_jsonb(e)->>'status',
            CASE
              WHEN to_jsonb(e)->>'isActive' = 'true'
                THEN 'ACTIVE'
              WHEN to_jsonb(e)->>'isActive' = 'false'
                THEN 'INACTIVE'
              ELSE ''
            END
          ) AS status
        FROM public."${safeTable}" AS e
        ORDER BY
          COALESCE(
            to_jsonb(e)->>'fullName',
            to_jsonb(e)->>'name',
            ''
          )
        LIMIT 100
      `)) as Array<Record<string, unknown>>;
      employees = records.map(row => ({
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        department: String(row.department ?? ""),
        designation: String(row.designation ?? ""),
        status: String(row.status ?? ""),
      }));
    }
  } catch {
    message =
      "Employee database query failed. Check the existing " +
      "PostgreSQL connection and employee table schema.";
  }
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      <h1>Live Employee Database</h1>
      <p>
        Owner-only, read-only PostgreSQL employee records.
      </p>
      {message ? (
        <p role="alert" className="notice">
          {message}
        </p>
      ) : (
        <>
          <p>
            Connected table: <strong>{tableName}</strong>
          </p>
          <p>
            Records displayed: <strong>{employees.length}</strong>
            {" "}(maximum 100)
          </p>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr>
                  {[
                    "Employee ID",
                    "Full Name",
                    "Department",
                    "Designation",
                    "Status",
                  ].map(label => (
                    <th
                      key={label}
                      style={{
                        padding: 12,
                        borderBottom: "2px solid #cbd5e1",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => (
                  <tr key={`${employee.code}-${index}`}>
                    {[
                      employee.code,
                      employee.name,
                      employee.department,
                      employee.designation,
                      employee.status,
                    ].map((value, column) => (
                      <td
                        key={column}
                        style={{
                          padding: 12,
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        {value || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {employees.length === 0 && (
            <p>No employee records found in this table.</p>
          )}
        </>
      )}
    </main>
  );
}
