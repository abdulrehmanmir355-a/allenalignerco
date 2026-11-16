import { redirect } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import SummaryClient from "./summary-client";

export const dynamic = "force-dynamic";

export default async function HRSummaryDashboard() {
  const hr = await currentHR().catch(() => null);

  if (!hr) redirect("/hr/login");

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 24 }}>
      <h1>HR Dashboard</h1>
      <p data-aa-hr-signed-in="true"
 style={{
   display: "inline-flex",
   flexWrap: "wrap",
   alignItems: "center",
   gap: 8,
   padding: "10px 16px",
   margin: "12px 0 20px",
   border: "1px solid #cbdfe4",
   borderRadius: 10,
   background: "#ffffff",
   color: "#113847",
   fontSize: 14,
   fontWeight: 600,
   lineHeight: 1.5
 }}
><strong style={{ color: "#087989" }}>Signed in:</strong>{" "}{hr.email}</p>
      <p><></></p>
      <SummaryClient />
<p><></></p>
      <p>
        <></>
      </p>
    </main>
  );
}
