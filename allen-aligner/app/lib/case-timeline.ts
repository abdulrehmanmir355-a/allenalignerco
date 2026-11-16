import 'server-only';
import { db } from './database';
import { ownCases } from './portal-auth';
import { currentDoctor } from './portal-auth';
import { currentClinic } from './clinic-auth';
import { clinicPermission } from './clinic-management';
import { PortalError } from './portal-http';
import { activityDetail } from './case-lifecycle';
import type { CaseStatus } from './db-models';

export type TimelineViewer = { kind: 'doctor'; id: string; clinicId: string } | { kind: 'clinic'; id: string; clinicId: string };
export type TimelineEntry = { id: string; at: string; category: string; title: string; actor: { id: string; name: string; role: string } | null; action: string; fromStatus: CaseStatus | null; status: CaseStatus | null; notes: string | null; workflow: { qcState: string; qcPlanId: string | null; careStage: string } | null };
export async function timelineViewer(kind: 'doctor' | 'clinic'): Promise<TimelineViewer> {
  if (kind === 'doctor') {
    const d = await currentDoctor();
    if (!d?.clinicId) throw new PortalError(401, 'Please sign in with a verified doctor account.');
    return { kind, id: d.id, clinicId: d.clinicId };
  }
  const u = await currentClinic();
  if (!u) throw new PortalError(401, 'Clinic sign in required.');
  clinicPermission(u, 'cases');
  return { kind, id: u.id, clinicId: u.clinicId };
}

export async function caseTimeline(id: string, viewer: TimelineViewer) {
  if (!id || id.length > 100) throw new PortalError(404, 'Case not found.');
  // Scope every data source through the authorized parent, in one database snapshot.
  const rows = await db.query(`WITH c AS (
    SELECT id,"clinicId","patientReference",status,revision,"createdAt",
      to_jsonb("PortalCase")->>'qcState' AS "qcState",to_jsonb("PortalCase")->>'qcPlanId' AS "qcPlanId",to_jsonb("PortalCase")->>'careStage' AS "careStage",to_jsonb("PortalCase")->>'caseClosedAt' AS "caseClosedAt"
    FROM "PortalCase" WHERE id=$1 AND "clinicId"=$2 AND ($3::text IS NULL OR "doctorId"=$3)
  ), entries AS (
    SELECT 'case:'||id AS key,'CASE' AS category,'Case draft created' AS title,"createdAt" AS at,
      NULL::text AS metadata,NULL::text AS notes,NULL::text AS author,'created' AS action FROM c
    UNION ALL
    SELECT 'event:'||e.id,'EVENT',e.label,e."createdAt",a.action,NULL,NULL,'recorded'
      FROM c JOIN "CaseEvent" e ON e."caseId"=c.id
      LEFT JOIN "ManagementAudit" a ON a."recordId"=e.id AND a.scope=c."clinicId" AND a.action LIKE '{"type":"case_activity",%'
    UNION ALL
    SELECT 'file:'||f.id,'FILE','Clinical record attached: '||f.name,f."createdAt",NULL,NULL,NULL,'file_attached'
      FROM c JOIN "CaseFile" f ON f."caseId"=c.id WHERE $4
    UNION ALL
    SELECT 'large-file:'||f.id,'FILE','Clinical planning file attached: '||f."originalName"||' (v'||f.version||')',f."createdAt",NULL,NULL,f."uploadedByLabel",f."uploadedByRole"
      FROM c JOIN "LargeClinicalFile" f ON f."caseId"=c.id WHERE $4
    UNION ALL
    SELECT 'message:'||m.id,'MESSAGE','Case message',m."createdAt",NULL,m.text,m.author,m.kind
      FROM c JOIN "CaseMessage" m ON m."caseId"=c.id WHERE $4
    UNION ALL
    SELECT 'plan:'||p.id,'PLAN','Released treatment plan v'||p.version,p."createdAt",NULL,p.summary,NULL,'plan_created'
      FROM c JOIN "TreatmentPlan" p ON p."caseId"=c.id
      JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED' WHERE $4
  ) SELECT c.id,c."patientReference",c.status,c.revision,c."qcState",c."qcPlanId",c."careStage",e.* FROM c JOIN entries e ON true
    ORDER BY e.at ASC,e.key COLLATE "C" ASC`, [id, viewer.clinicId, viewer.kind === 'doctor' ? ownCases({ id: viewer.id, clinicId: viewer.clinicId }).doctorId : null, viewer.kind === 'doctor']);
  if (!rows.length) throw new PortalError(404, 'Case not found.');
  const entries: TimelineEntry[] = rows.map(r => {
    const detail = activityDetail(r.metadata);
    return { id: r.key, at: r.at.toISOString(), category: r.category, title: r.title,
      actor: detail?.actor ?? (r.author ? { id: '', name: r.author, role: r.category === 'FILE' && ['DOCTOR', 'LAB'].includes(String(r.action)) ? String(r.action) : 'Recorded author' } : null),
      action: detail?.action ?? r.action, fromStatus: detail?.fromStatus ?? null, status: detail?.status ?? null,
      notes: viewer.kind === 'doctor' ? detail?.notes ?? r.notes ?? null : null, workflow: detail?.workflow ?? null };
  });
  return { case: { id: rows[0].id, patientReference: rows[0].patientReference, status: rows[0].status as CaseStatus, revision: rows[0].revision, workflow: rows[0].careStage ? { qcState: String(rows[0].qcState), qcPlanId: rows[0].qcPlanId as string | null, careStage: String(rows[0].careStage), caseClosedAt: rows[0].caseClosedAt ? String(rows[0].caseClosedAt) : null } : null }, entries, visibility: viewer.kind === 'clinic' ? 'activity_metadata' : 'assigned_doctor' };
}
