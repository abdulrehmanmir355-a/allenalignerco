import LiveCases from "../../components/live-cases";
export default async function History({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){const p=await searchParams;return <LiveCases title="Case History" query={p.q} status={p.status}/>}
