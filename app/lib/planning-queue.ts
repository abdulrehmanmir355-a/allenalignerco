import 'server-only';
import { db, type Database } from './database';
import { manageClinical, type ClinicalActor } from './clinical-auth';

export const planningFilters = [
  { key: 'ALL', label: 'All Open' }, { key: 'UNASSIGNED', label: 'Unassigned' },
  { key: 'URGENT', label: 'Urgent / High' }, { key: 'OVERDUE', label: 'Overdue' },
  { key: 'ESCALATED', label: 'Escalated' }, { key: 'IN_REVIEW', label: 'In Review' },
] as const;
export function planningFilter(value?: string) { return planningFilters.find(f => f.key === value)?.key ?? 'ALL'; }
export function planningPage(value?: string) { const n = Number(value); return /^\d+$/.test(value ?? '') && Number.isSafeInteger(n) && n > 0 ? n : 1; }
export function planningQueueUrl(filter: string, page = 1) { return `/clinical/assignment-board?filter=${planningFilter(filter)}&page=${planningPage(String(page))}`; }
export type PlanningRow = {
  preparedByAccountId: string | null; preparedByEmployeeId: string | null; preparerName: string | null;
  reviewId: string; planId: string; caseId: string; patientReference: string; version: number;
  revision: number; status: string; priority: string; assignedTo: string | null; reviewerName: string | null;
  dueDate: string | null; workload: number; overdue: boolean;
};
export type PlanningReviewer = { id: string; employeeId: string; fullName: string; clinicalRole: string; workload: number };
export type PlanningCounts = { total: number; unassigned: number; urgent: number; overdue: number; matching: number };

export async function planningQueue(actor: ClinicalActor, filter = 'ALL', requestedPage = 1, database: Database = db) {
  manageClinical(actor);
  const selected = planningFilter(filter);
  // Counts, selected rows and reviewer workload share one statement/snapshot.
  const [result] = await database.query(`WITH open_reviews AS MATERIALIZED (
    SELECT r.*,p.version,p."caseId",p."preparedByAccountId",p."preparedByEmployeeId",pe."fullName" AS "preparerName",c."patientReference",e."fullName" AS "reviewerName",
      coalesce(r."dueDate" < CURRENT_DATE,false) AS overdue
    FROM "ClinicalReview" r JOIN "TreatmentPlan" p ON p.id=r."planId"
    JOIN "PortalCase" c ON c.id=p."caseId"
    LEFT JOIN "WorkAccount" w ON w.id=r."assignedTo" LEFT JOIN "ClinicalIdentity" e ON e."accountId"=w.id
    LEFT JOIN "Employee" pe ON pe.id=p."preparedByEmployeeId"
    WHERE c.status<>'DRAFT' AND r.status IN ('PENDING','IN_REVIEW','ESCALATED')
      AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=p."caseId")
  ), matching AS (
    SELECT * FROM open_reviews WHERE CASE $1::text
      WHEN 'UNASSIGNED' THEN "assignedTo" IS NULL WHEN 'URGENT' THEN priority IN ('URGENT','HIGH')
      WHEN 'OVERDUE' THEN overdue WHEN 'ESCALATED' THEN status='ESCALATED'
      WHEN 'IN_REVIEW' THEN status='IN_REVIEW' ELSE true END
  ), counts AS (
    SELECT count(*)::int AS total,count(*) FILTER(WHERE "assignedTo" IS NULL)::int AS unassigned,
      count(*) FILTER(WHERE priority IN ('URGENT','HIGH'))::int AS urgent,count(*) FILTER(WHERE overdue)::int AS overdue,
      (SELECT count(*)::int FROM matching) AS matching FROM open_reviews
  ), paging AS (
    SELECT *,greatest(1,ceil(matching/50.0)::int) AS pages,
      least($2::int,greatest(1,ceil(matching/50.0)::int)) AS page FROM counts
  ), workload AS (
    SELECT "assignedTo",count(*)::int AS n FROM open_reviews GROUP BY "assignedTo"
  ), selected AS (
    SELECT r.id::text AS "reviewId",r."planId",r."caseId",r."patientReference",r.version,r.revision,r."preparedByAccountId",r."preparedByEmployeeId",r."preparerName",
      r.status,r.priority,r."assignedTo"::text,r."reviewerName",r."dueDate"::text AS "dueDate",r.overdue,
      coalesce(w.n,0) AS workload,r."createdAt"
    FROM matching r LEFT JOIN workload w ON w."assignedTo"=r."assignedTo"
    ORDER BY r.overdue DESC,CASE r.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
      r."dueDate" ASC NULLS LAST,r."createdAt",r.id
    LIMIT 50 OFFSET ((SELECT page FROM paging)-1)*50
  ) SELECT (SELECT to_jsonb(paging) FROM paging) AS summary,
    coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.overdue DESC,CASE s.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,s."dueDate" ASC NULLS LAST,s."createdAt",s."reviewId") FROM selected s),'[]'::jsonb) AS rows,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id::text,'employeeId',w."employeeId",'fullName',e."fullName",'clinicalRole',w."clinicalRole",'workload',coalesce(l.n,0)) ORDER BY e."fullName",w.id)
      FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id LEFT JOIN workload l ON l."assignedTo"=w.id
      WHERE w."clinicalRole" IN ('REVIEWER','LEAD') AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE'),'[]'::jsonb) AS reviewers`,
    [selected, Math.min(planningPage(String(requestedPage)), 2147483647)]);
  return { rows: result.rows as PlanningRow[], reviewers: result.reviewers as PlanningReviewer[], summary: result.summary as PlanningCounts & { page: number; pages: number } };
}
