import LiveCases from "../../components/live-cases";
export default async function ClinicCollaboration({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const p = await searchParams;
  return <main style={{ padding: "32px 5%", maxWidth: 1250, margin: "auto" }}><p>Open one of your cases to read laboratory messages, send comments, review plans and view its activity timeline.</p><LiveCases title="Case collaboration" query={p.q} status={p.status} /></main>;
}
