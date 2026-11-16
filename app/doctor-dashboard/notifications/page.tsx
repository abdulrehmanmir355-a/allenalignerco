import Link from "next/link";
import PortalForm from "../../components/portal-form";
import { requireDoctor } from "../../lib/portal-auth";
import { db } from "../../lib/database";
export default async function Notifications(){const d=await requireDoctor();const rows=await db.notification.findMany({where:{doctorId:d.id},orderBy:{createdAt:"desc"},take:100});return <><div className="page-heading"><div><h1>Notifications</h1><p>Latest 100 in-app laboratory updates. Refresh to check for new updates.</p></div></div><section className="panel padded">{!rows.length&&<p>No laboratory updates yet.</p>}{rows.map(n=><article className="plan-version" key={n.id}><Link href={`/doctor-dashboard/cases/${n.caseId}`}>{n.text}</Link><p><small>{n.createdAt.toISOString().replace("T"," ").slice(0,16)} UTC · {n.readAt?"Read":"Unread"}</small></p>{!n.readAt&&<PortalForm action="/api/portal/notifications" label="Mark read"><input type="hidden" name="id" value={n.id}/></PortalForm>}</article>)}</section></>;}
