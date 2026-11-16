import 'server-only';
import { createHash } from 'node:crypto';
import type { Database } from './database';
import { PortalError } from './portal-http';
import { verifyStoredObject } from './large-upload-storage';

// Hash the written plan and actual version-bound bytes, never client-supplied identities.
export async function planArtifact(tx: Database, planId: string) {
  const [plan] = await tx.query('SELECT id,version,summary,"changeSummary" FROM "TreatmentPlan" WHERE id=$1', [planId]);
  if (!plan) throw new PortalError(409, 'Plan version is unavailable.');
  const refs = await tx.query(`SELECT f."caseFileId",f."largeFileId",cf.data,cf.size,lf."storageKey",lf."sizeBytes",lf.sha256
    FROM "TreatmentPlanFile" f LEFT JOIN "CaseFile" cf ON cf.id=f."caseFileId"
    LEFT JOIN "LargeClinicalFile" lf ON lf.id=f."largeFileId" WHERE f."planId"=$1 ORDER BY f.id`, [planId]);
  if (!refs.length) throw new PortalError(409, 'This plan has no version-bound files. Ask planning to publish a complete new version.');
  const files: { id: string; kind: string; size: number; sha256: string }[] = [];
  for (const f of refs) {
    if (f.caseFileId) {
      if (!Buffer.isBuffer(f.data) || f.data.length !== Number(f.size) || !f.data.length) throw new PortalError(409, 'A required plan file is unavailable.');
      files.push({ id: String(f.caseFileId), kind: 'standard', size: Number(f.size), sha256: createHash('sha256').update(f.data).digest('hex') });
    } else {
      await verifyStoredObject(String(f.storageKey), Number(f.sizeBytes), String(f.sha256));
      files.push({ id: String(f.largeFileId), kind: 'large', size: Number(f.sizeBytes), sha256: String(f.sha256) });
    }
  }
  const manifest = { planId: plan.id, version: plan.version, summary: plan.summary, changeSummary: plan.changeSummary, files };
  return { manifest, sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
}

export async function manufacturingApproval(tx: Database, caseId: string) {
  const [record] = await tx.query(`SELECT p.id,a.detail FROM "TreatmentPlan" p
    JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED'
    JOIN "TreatmentPlanVersionAudit" a ON a."planId"=p.id AND a.action='DOCTOR_APPROVED'
    WHERE p."caseId"=$1 AND p.decision='APPROVED'
      AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=$1)
      AND a.detail->>'decision'='APPROVED'`, [caseId]);
  if (!record) throw new PortalError(409, 'Manufacturing requires a current version-specific doctor decision with verified artifacts.');
  const artifact = await planArtifact(tx, String(record.id));
  if (record.detail.artifactSha256 !== artifact.sha256) throw new PortalError(409, 'Approved plan artifacts have changed or are unavailable. Manufacturing is blocked.');
}
