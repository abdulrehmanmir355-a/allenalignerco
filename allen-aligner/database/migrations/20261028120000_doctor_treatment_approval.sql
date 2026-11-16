BEGIN;
SET LOCAL lock_timeout='10s';
-- Extend Module 12's existing immutable decision history; no parallel approval table.
ALTER TABLE "TreatmentPlanVersionAudit" DROP CONSTRAINT IF EXISTS "TreatmentPlanVersionAudit_action_check";
ALTER TABLE "TreatmentPlanVersionAudit" ADD CONSTRAINT "TreatmentPlanVersionAudit_action_check"
 CHECK(action IN ('VERSION_CREATED','DOCTOR_APPROVED','DOCTOR_REVISION_REQUESTED','DOCTOR_REJECTED','DOCTOR_OPENED','LEGACY_VERSION_REGISTERED'));
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanVersionAudit_decision_once"
 ON "TreatmentPlanVersionAudit"("planId") WHERE detail ? 'decision';
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanVersionAudit_open_once"
 ON "TreatmentPlanVersionAudit"("planId","actorId") WHERE action='DOCTOR_OPENED';

CREATE OR REPLACE FUNCTION aa_treatment_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "PortalCase"%ROWTYPE; decision text; manifest jsonb;
BEGIN
 IF NEW.decision IS NOT DISTINCT FROM OLD.decision THEN RETURN NEW; END IF;
 SELECT * INTO c FROM "PortalCase" WHERE id=NEW."caseId" FOR UPDATE;
 decision:=current_setting('allen.plan_decision',true);
 IF c.status<>'REVIEW' OR NOT EXISTS(SELECT 1 FROM "Doctor" d WHERE d.id=c."doctorId" AND d."clinicId"=c."clinicId" AND d."isVerified" AND d.id=current_setting('allen.plan_actor_id',true)) THEN
  RAISE EXCEPTION 'Only the assigned verified doctor in this clinic may decide on a released plan'; END IF;
 IF decision IS NULL OR decision NOT IN ('APPROVED','CHANGES_REQUESTED','REJECTED')
    OR (decision='APPROVED') IS DISTINCT FROM (NEW.decision='APPROVED') THEN
  RAISE EXCEPTION 'An explicit authenticated treatment decision is required'; END IF;
 IF decision='APPROVED' AND current_setting('allen.plan_confirmed',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'Review confirmation required'; END IF;
 IF decision<>'APPROVED' AND length(trim(coalesce(current_setting('allen.plan_comments',true),'')))<5 THEN RAISE EXCEPTION 'Written decision reason required'; END IF;
 IF coalesce(current_setting('allen.plan_sha256',true),'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Verified artifact fingerprint required'; END IF;
 manifest:=nullif(current_setting('allen.plan_manifest',true),'')::jsonb;
 IF manifest IS NULL OR manifest->>'planId' IS DISTINCT FROM NEW.id OR manifest->>'summary' IS DISTINCT FROM NEW.summary
   OR jsonb_array_length(manifest->'files')<1
   OR jsonb_array_length(manifest->'files')<>(SELECT count(*) FROM "TreatmentPlanFile" WHERE "planId"=NEW.id) THEN
   RAISE EXCEPTION 'Complete version-bound artifact manifest required'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_treatment_decision_guard ON "TreatmentPlan";
CREATE TRIGGER aa_treatment_decision_guard BEFORE UPDATE ON "TreatmentPlan" FOR EACH ROW EXECUTE FUNCTION aa_treatment_decision_guard();

CREATE OR REPLACE FUNCTION aa_plan_version_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id text; actor_name text; actor_role text; event_action text; decision text; c "PortalCase"%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail)
  VALUES(NEW.id,NEW."caseId",coalesce(nullif(NEW."createdById",''),'SYSTEM'),coalesce(nullif(NEW."authorName",''),'System'),coalesce(NEW."createdByRole",'SYSTEM'),'VERSION_CREATED',jsonb_build_object('version',NEW.version,'changeSummary',NEW."changeSummary",'parentPlanId',NEW."parentPlanId"));
 ELSIF NEW.decision IS DISTINCT FROM OLD.decision THEN
  SELECT * INTO c FROM "PortalCase" WHERE id=NEW."caseId";
  actor_id:=current_setting('allen.plan_actor_id',true); actor_name:=current_setting('allen.plan_actor_name',true); actor_role:=current_setting('allen.plan_actor_role',true);
  decision:=current_setting('allen.plan_decision',true);
  event_action:=CASE decision WHEN 'APPROVED' THEN 'DOCTOR_APPROVED' WHEN 'REJECTED' THEN 'DOCTOR_REJECTED' ELSE 'DOCTOR_REVISION_REQUESTED' END;
  INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail)
  VALUES(NEW.id,NEW."caseId",actor_id,actor_name,actor_role,event_action,jsonb_build_object(
   'version',NEW.version,'decision',decision,'comments',coalesce(current_setting('allen.plan_comments',true),''),
   'clinicId',c."clinicId",'patientId',c."patientId",'doctorUserId',actor_id,'fromStatus',c.status,
   'toStatus',CASE decision WHEN 'APPROVED' THEN 'APPROVED' ELSE 'CHANGES_REQUESTED' END,
   'fromDecision',OLD.decision,'toDecision',NEW.decision,'approvedAt',NEW."approvedAt",'decidedAt',NEW."reviewedAt",
   'artifactSha256',current_setting('allen.plan_sha256',true),'artifact',current_setting('allen.plan_manifest',true)::jsonb));
  -- Existing employee inbox; no patient data in notification text. Clinical case authorization still applies.
  INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
   SELECT w.id::text,w."employeeId",current_date,'PLAN_DECISION:'||NEW.id,'Treatment plan decision: '||decision||'. Open the authorized clinical case workspace.'
   FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId"
   WHERE w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE'
    AND (w."clinicalRole" IN ('LEAD','ADMIN') OR EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=NEW.id AND r."assignedTo"=w.id))
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

-- Referenced file bytes and metadata form part of the immutable approved artifact.
CREATE OR REPLACE FUNCTION aa_bound_artifact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "TreatmentPlanFile" f WHERE (TG_TABLE_NAME='CaseFile' AND f."caseFileId"=OLD.id) OR (TG_TABLE_NAME='LargeClinicalFile' AND f."largeFileId"=OLD.id)) THEN
  RAISE EXCEPTION 'Version-bound files are immutable; upload a new file and publish a new version'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_bound_artifact_immutable ON "CaseFile";
CREATE TRIGGER aa_bound_artifact_immutable BEFORE UPDATE OR DELETE ON "CaseFile" FOR EACH ROW EXECUTE FUNCTION aa_bound_artifact_immutable();
DROP TRIGGER IF EXISTS aa_bound_artifact_immutable ON "LargeClinicalFile";
CREATE TRIGGER aa_bound_artifact_immutable BEFORE UPDATE OR DELETE ON "LargeClinicalFile" FOR EACH ROW EXECUTE FUNCTION aa_bound_artifact_immutable();
CREATE OR REPLACE FUNCTION aa_plan_file_release_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM "PortalCase" c JOIN "TreatmentPlan" p ON p."caseId"=c.id WHERE p.id=NEW."planId" FOR UPDATE OF c;
 IF EXISTS(SELECT 1 FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p.id=NEW."planId" AND (r.status<>'PENDING' OR p.decision<>'PENDING')) THEN
 RAISE EXCEPTION 'Reviewed plan file bindings are locked; create a new version'; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_file_release_lock ON "TreatmentPlanFile";
CREATE TRIGGER aa_plan_file_release_lock BEFORE INSERT ON "TreatmentPlanFile" FOR EACH ROW EXECUTE FUNCTION aa_plan_file_release_lock();

CREATE OR REPLACE FUNCTION aa_manufacturing_decision_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='IN_PRODUCTION' AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status<>'APPROVED' OR NOT EXISTS(
   SELECT 1 FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED'
   JOIN "TreatmentPlanVersionAudit" a ON a."planId"=p.id AND a.action='DOCTOR_APPROVED'
   WHERE p."caseId"=NEW.id AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=NEW.id)
    AND p.decision='APPROVED' AND p."approvedByDoctorId"=NEW."doctorId"
    AND a.detail->>'decision'='APPROVED' AND a.detail->>'clinicId'=NEW."clinicId"
    AND a.detail->>'artifactSha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_array_length(a.detail->'artifact'->'files')=(SELECT count(*) FROM "TreatmentPlanFile" WHERE "planId"=p.id)
  ) THEN RAISE EXCEPTION 'Manufacturing requires the current exact artifact and doctor approval'; END IF;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_manufacturing_decision_gate ON "PortalCase";
CREATE TRIGGER aa_manufacturing_decision_gate BEFORE UPDATE ON "PortalCase" FOR EACH ROW EXECUTE FUNCTION aa_manufacturing_decision_gate();
COMMIT;
