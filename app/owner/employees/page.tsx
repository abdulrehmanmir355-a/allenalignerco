import { currentOwner } from "../../lib/owner-auth";
export const dynamic = "force-dynamic";
type EmployeeData = {
  total: number;
  active: number;
  other: number;
  unique_database_ids: number;
  employee_code_validation: string;
  employees: { id: string; status: string }[];
};
export default async function Page() {
  const actor = await currentOwner().catch(() => null);
  if (!actor) {
    return (
      <main style={{ padding: 30 }}>
        <h1>Owner Access Restricted</h1>
        <p>Authorized owner login required.</p>
      </main>
    );
  }
  let data: EmployeeData | null = null;
  let error = "";
  try {
    const key = process.env.AA_OWNER_ENGINE_KEY;
    if (!key) throw new Error("Missing secret");
    const res = await fetch(
      "http://127.0.0.1:8100/owner/employees/dashboard",
      {
        headers: { "x-engine-key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!res.ok) throw new Error("API unavailable");
    data = (await res.json()) as EmployeeData;
  } catch {
    error = "Python Employee API unavailable";
  }
  const cards = [
    ["Total Employees", data?.total],
    ["Active Employees", data?.active],
    ["Other Status", data?.other],
    ["Unique Database IDs", data?.unique_database_ids]
  ];
  return (
    <main style={{
      maxWidth: 1200,
      margin: "30px auto",
      padding: 24,
      color: "#113847"
    }}>
      <header style={{
        background: "#113847",
        color: "white",
        padding: 28,
        borderRadius: 14
      }}>
        <h1 style={{ color: "white", margin: 0 }}>
          EMPLOYEE COMMAND CENTER
        </h1>
        <p>Allen Aligner | Python HR Intelligence</p>
      </header>
      {error && <p role="alert">{error}</p>}
      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(190px,1fr))",
        gap: 16,
        marginTop: 24
      }}>
        {cards.map(([label, value]) => (
          <article key={String(label)} style={{
            padding: 22,
            border: "1px solid #dce5e8",
            borderRadius: 12
          }}>
            <p>{label}</p>
            <strong style={{ fontSize: 32 }}>
              {value ?? "N/A"}
            </strong>
          </article>
        ))}
      </section>
      <h2 style={{ marginTop: 30 }}>
        Employee Identity Register
      </h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", textAlign: "left" }}>
          <thead>
            <tr><th>Database ID</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data?.employees.map((e) => (
              <tr key={e.id}>
                <td style={{ padding: 10 }}>{e.id}</td>
                <td style={{ padding: 10 }}>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 20, color: "#64748b" }}>
        Business Employee Code Validation: Not Yet Connected
      </p>
    </main>
  );
}