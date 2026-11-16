import { redirect } from "next/navigation";
import { db } from "../../lib/database";
import { currentHR } from "../../lib/hr-auth";
import AssetRegister from "./asset-register";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const actor = await currentHR();

  if (!actor) redirect("/hr/login");

  if (actor.role !== "HR_ADMIN") {
    return <main style={{ padding: 30 }}>Access Denied</main>;
  }

  const employees = await db.query(
    `SELECT "id", "employeeCode", "fullName"
     FROM "Employee"
     ORDER BY "fullName"
     LIMIT 500`
  );

  return (
    <main style={{
      maxWidth: 1000,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        color: "#ffffff",
        padding: 24,
        borderRadius: 12
      }}>
        <h1 style={{ color: "#ffffff" }}>
          Employee Asset Register
        </h1>
        <p>Issue · Return · Automatic Asset Codes</p>
      </header>

      <AssetRegister employees={employees.map(e=>({id:String(e.id),employeeCode:String(e.employeeCode),fullName:String(e.fullName)}))} />
    </main>
  );
}