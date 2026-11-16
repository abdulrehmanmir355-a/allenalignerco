import Link from "next/link";
import { db } from "../../lib/database";
import { activityDetail } from "../../lib/case-lifecycle";
import { CaseStatus } from "../../lib/db-models";
import { requireDoctor } from "../../lib/portal-auth";

export const dynamic = "force-dynamic";

type TimelineRow = {
  id: string;
  caseId: string;
  patientReference: string;
  category: string;
  status: string;
  title: string;
  at: Date | string;
  metadata: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Karachi",
});

export default async function History({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const doctor = await requireDoctor();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  const status = Object.values(CaseStatus).includes(params.status as CaseStatus)
    ? params.status!
    : "";

  const rows = await db.query(
    `WITH own_cases AS (
       SELECT id,"patientReference",category,status,"createdAt"
       FROM "PortalCase"
       WHERE "doctorId"=$1 AND "clinicId"=$2
         AND ($3='' OR "patientReference" ILIKE $4)
         AND ($5='' OR status::text=$5)
     ), entries AS (
       SELECT 'created:'||c.id AS id,c.id AS "caseId",c."patientReference",c.category,c.status,
         'Case created'::text AS title,c."createdAt" AS at,NULL::text AS metadata
       FROM own_cases c
       UNION ALL
       SELECT 'event:'||e.id,c.id,c."patientReference",c.category,c.status,e.label,e."createdAt",a.action
       FROM own_cases c
       JOIN "CaseEvent" e ON e."caseId"=c.id
       LEFT JOIN "ManagementAudit" a ON a."recordId"=e.id AND a.scope=$2
         AND a.action LIKE '{"type":"case_activity",%'
     )
     SELECT id,"caseId","patientReference",category,status,title,at,metadata
     FROM entries ORDER BY at DESC,id COLLATE "C" DESC LIMIT 300`,
    [doctor.id, doctor.clinicId, query, `%${query}%`, status],
  ) as TimelineRow[];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PRIVATE PRACTICE</span>
          <h1>Case Timeline</h1>
          <p>Recorded activity across your cases, newest first. Open an entry for the complete case timeline.</p>
        </div>
        <Link className="button secondary" href="/doctor-dashboard/cases">All cases</Link>
      </div>

      <form className="portal-filters" action="/doctor-dashboard/history">
        <label>Patient reference<input name="q" defaultValue={query} placeholder="Search patient reference" maxLength={100} /></label>
        <label>Case status<select name="status" defaultValue={status}>
          <option value="">All statuses</option>
          {Object.values(CaseStatus).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select></label>
        <button className="button secondary">Filter timeline</button>
      </form>

      <section className="panel padded case-history-timeline" aria-label="Case activity timeline">
        <div className="case-history-heading">
          <div><span className="eyebrow">CASE ACTIVITY</span><h2>Latest recorded events</h2></div>
          <span className="badge">{rows.length === 300 ? "Latest 300" : `${rows.length} entries`}</span>
        </div>
        {rows.length ? (
          <ol className="portal-timeline case-history-feed">
            {rows.map(row => {
              const detail = activityDetail(row.metadata);
              const date = row.at instanceof Date ? row.at : new Date(row.at);
              return <li className="timeline-entry case-history-entry" key={row.id}>
                <div className="timeline-entry-header">
                  <span className="badge" data-status={row.status}>{row.status.replaceAll("_", " ")}</span>
                  <time dateTime={date.toISOString()}>{dateFormat.format(date)} PKT</time>
                </div>
                <Link className="case-history-title" href={`/doctor-dashboard/cases/${encodeURIComponent(row.caseId)}#case-timeline`}>
                  <strong>{row.title}</strong><span>Open full timeline →</span>
                </Link>
                <p><strong>{row.patientReference}</strong> · {row.category}</p>
                {detail && <p>{detail.actor.name} · {detail.actor.role.replaceAll("_", " ")}{detail.fromStatus && detail.status ? ` · ${detail.fromStatus.replaceAll("_", " ")} → ${detail.status.replaceAll("_", " ")}` : ""}</p>}
              </li>;
            })}
          </ol>
        ) : (
          <div className="empty-state"><h2>No recorded activity found</h2><p>Case creation and later workflow events will appear here.</p><Link className="text-link" href="/doctor-dashboard/cases">View all cases →</Link></div>
        )}
      </section>
    </>
  );
}
