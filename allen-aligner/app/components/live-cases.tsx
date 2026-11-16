import Link from "next/link";
import { CaseStatus } from "../lib/db-models";
import { requireDoctor, ownCases } from "../lib/portal-auth";
import { db } from "../lib/database";
export default async function LiveCases({ title = "Cases", query = "", status = "" }: { title?: string; query?: string; status?: string }) {
 const doctor = await requireDoctor();
 const filterStatus = Object.values(CaseStatus).includes(status as CaseStatus) ? status as CaseStatus : undefined;
 const rows = await db.portalCase.findMany({ where: { ...ownCases(doctor), ...(filterStatus ? { status: filterStatus } : {}), ...(query ? { patientReference: { contains: query.slice(0, 100), mode: "insensitive" as const } } : {}) }, orderBy: { updatedAt: "desc" }, take: 200 });
 const cases = rows;
 return <><div className="page-heading"><div><span className="eyebrow">YOUR PRIVATE PRACTICE</span><h1>{title}</h1><p>Find a case by patient reference or workflow stage. Latest 200 cases.</p></div><Link className="button" href="/doctor-dashboard/cases/new">+ New case</Link></div><form className="portal-filters"><label>Patient reference<input name="q" defaultValue={query} placeholder="Search reference" maxLength={100}/></label><label>Status<select name="status" defaultValue={status}><option value="">All statuses</option>{["DRAFT","SUBMITTED","PLANNING","REVIEW","CHANGES_REQUESTED","APPROVED","IN_PRODUCTION","SHIPPED","COMPLETED"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label><button className="button secondary">Filter</button></form><section className="panel">{cases.length ? cases.map(c=><Link className="case-row" key={c.id} href={`/doctor-dashboard/cases/${c.id}`}><span className="avatar">AA</span><div><strong>{c.patientReference}</strong><small>{c.category} · {c.updatedAt.toISOString().slice(0,10)}</small></div><span className="badge" data-status={c.status}>{c.status.replaceAll("_"," ")}</span></Link>) : <div className="empty-state"><h2>No cases found</h2><p>Create a case to start your doctor-lab workflow.</p></div>}</section></>;
}
