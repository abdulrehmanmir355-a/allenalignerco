import LiveCases from "../../components/live-cases";
export default async function Cases({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) { const p = await searchParams; return <LiveCases query={p.q} status={p.status}/>; }
