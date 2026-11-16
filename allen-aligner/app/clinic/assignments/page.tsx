import { currentClinic } from "../../lib/clinic-auth";
import { redirect } from "next/navigation";
import LiveCases from "../../components/live-cases";
export default async function ClinicAssignments({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  if(await currentClinic())redirect("/clinic/manage/cases");
  const p = await searchParams;
  return <main style={{ padding: "32px 5%", maxWidth: 1250, margin: "auto" }}><p>These cases are assigned to your doctor account. Reassignment to another doctor is not enabled yet.</p><LiveCases title="Your assigned cases" query={p.q} status={p.status} /></main>;
}
