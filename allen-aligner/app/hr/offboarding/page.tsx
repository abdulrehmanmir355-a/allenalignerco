import Link from "next/link";
import { hrScope } from '../../lib/hr-scope';
import { redirect } from "next/navigation";
import { currentHR } from "../../lib/hr-auth";
import { db } from "../../lib/database";

export const dynamic = "force-dynamic";

type Employee = {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string;
  status: string;
};

export default async function HROffboardingPage() {
  const hr = await currentHR().catch(() => null);

  if (!hr) redirect("/hr/login");

  let employees: Employee[] = [];
  let ready = true;

  try {
    const scope=hrScope(hr);
    employees = await db.query(scope.sql+
      `SELECT "id", "permanentId" AS "employeeCode", "fullName",
              "department", "status"
       FROM "Employee"
       ORDER BY "createdAt" DESC
       LIMIT 100`,scope.args
    ) as Employee[];
  } catch {
    ready = false;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 24 }}>
      <h1>Employee Offboarding</h1>
      <p>Allen Aligner — HR Management</p>
      <p>Signed in: {hr.email}</p>

      {!ready ? (
        <p role="alert">
          HR database tables are not installed or available yet.
        </p>
      ) : (
        <>
          <p style={{margin:"20px 0"}}><a href="/hr/employees/new" style={{display:"inline-block",padding:"14px 24px",background:"#087989",color:"#fff",borderRadius:10,textDecoration:"none",fontWeight:600}}>+ Add New Employee</a></p>
<h2>Employee Directory</h2>
          <p>Total records displayed: {employees.length}</p>

          <div style={{ overflowX: "auto" }}>
            <table cellPadding={12} style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.employeeCode}</td>
                    <td>{employee.fullName}</td>
                    <td>{employee.department}</td>
                    <td>{employee.status}</td><td><Link href={"/hr/employees/"+encodeURIComponent(employee.id)}>View Profile</Link>{" · "}<Link href={"/hr/manage/offboarding?employeeId="+encodeURIComponent(employee.id)}>Exit Workflow</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
