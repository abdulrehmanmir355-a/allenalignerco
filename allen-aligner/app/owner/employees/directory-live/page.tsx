import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOwner } from "../../../lib/owner-auth";
import { db } from "../../../lib/database";
export const dynamic = "force-dynamic";
type EmployeeData = Record<string, unknown>;
type EmployeeRow = { data: EmployeeData };
type TableRow = { tableName: string };
function field(row: EmployeeData, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined &&
        String(value).trim() !== "") {
      return String(value);
    }
  }
  return "?";
}
function nameOf(row: EmployeeData) {
  const full = field(
    row, "fullName", "name", "employeeName"
  );
  if (full !== "?") return full;
  const parts = [
    row.firstName,
    row.lastName
  ].filter(v => typeof v === "string" && v.trim());
  return parts.length ? parts.join(" ") : "?";
}
function statusOf(row: EmployeeData) {
  const status = field(
    row, "status", "employmentStatus"
  );
  if (status !== "?") return status;
  if (row.isActive === true) return "ACTIVE";
  if (row.isActive === false) return "INACTIVE";
  return "?";
}
export default async function LiveDirectory({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const actor = await currentOwner();
  if (!actor) redirect("/owner-login");
  const { q } = await searchParams;
  const search = (q || "").trim().slice(0, 100);
  let employees: EmployeeData[] = [];
  let tableName = "";
  let error = "";
  try {
    const tables = (await db.query(`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND lower(table_name) IN (
          'employee', 'employees',
          'hremployee', 'hr_employee'
        )
      ORDER BY table_name
    `)) as TableRow[];
    if (tables.length === 0) {
      error = "Employee table not identified. " +
        "Check the Employee Schema page.";
    } else if (tables.length > 1) {
      error = "Multiple possible employee tables: " +
        tables.map(t => t.tableName).join(", ") +
        ". Confirm the correct table before connecting.";
    } else {
      tableName = tables[0].tableName;
      const safeTable = tableName.replace(/"/g, '""');
      const results = (await db.query(`
        SELECT to_jsonb(e) AS data
        FROM public."${safeTable}" e
        WHERE (
          $1::text = ''
          OR COALESCE(
            to_jsonb(e)->>'fullName',
            to_jsonb(e)->>'name',
            to_jsonb(e)->>'employeeName',
            CONCAT_WS(
              ' ',
              to_jsonb(e)->>'firstName',
              to_jsonb(e)->>'lastName'
            ),
            ''
          ) ILIKE '%' || $1::text || '%'
          OR COALESCE(
            to_jsonb(e)->>'employeeCode',
            to_jsonb(e)->>'employeeNo',
            to_jsonb(e)->>'employeeNumber',
            ''
          ) ILIKE '%' || $1::text || '%'
        )
        ORDER BY
          COALESCE(
            to_jsonb(e)->>'fullName',
            to_jsonb(e)->>'name',
            to_jsonb(e)->>'firstName',
            ''
          )
        LIMIT 200
      `, [search])) as EmployeeRow[];
      employees = results.map(r => r.data);
    }
  } catch {
    error = "Unable to load employee records. " +
      "Check the database connection and schema.";
  }
  return (
    <main style={{
      maxWidth: 1200,
      margin: "0 auto",
      padding: "32px 20px"
    }}>
      <h1>Live Employee Directory</h1>
      <p>
        Owner-only employee data from PostgreSQL.
        Read-only access.
      </p>
      <p>
        <Link href="/owner/employees/schema">
          View Database Schema
        </Link>
      </p>
      <form
        method="get"
        action="/owner/employees/directory-live"
        style={{
          display: "flex",
          gap: 12,
          margin: "24px 0",
          flexWrap: "wrap"
        }}
      >
        <input
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search employee name or ID"
          maxLength={100}
          aria-label="Search employees"
          style={{
            flex: "1 1 260px",
            padding: 12,
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />
        <button className="button" type="submit">
          Search
        </button>
      </form>
      {error ? (
        <p role="alert" className="notice">
          {error}
        </p>
      ) : (
        <>
          <p>
            Database Table: <strong>{tableName}</strong>
          </p>
          <p>
            Displaying <strong>{employees.length}</strong>
            {" "}record(s), maximum 200.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left"
            }}>
              <thead>
                <tr>
                  {[
                    "Employee ID",
                    "Full Name",
                    "Department",
                    "Designation",
                    "Status"
                  ].map(label => (
                    <th key={label} style={{
                      padding: 12,
                      borderBottom: "2px solid #bfd5dc"
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee, index) => {
                  const values = [
                    field(
                      employee,
                      "employeeCode",
                      "employeeNo",
                      "employeeNumber",
                      "id"
                    ),
                    nameOf(employee),
                    field(
                      employee,
                      "departmentName",
                      "department"
                    ),
                    field(
                      employee,
                      "designationName",
                      "designation",
                      "jobTitle"
                    ),
                    statusOf(employee)
                  ];
                  return (
                    <tr key={String(employee.id ?? index)}>
                      {values.map((value, column) => (
                        <td key={column} style={{
                          padding: 12,
                          borderBottom:
                            "1px solid #e2e8f0"
                        }}>
                          {value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {employees.length === 0 && (
            <p>No matching employees found.</p>
          )}
        </>
      )}
    </main>
  );
}
