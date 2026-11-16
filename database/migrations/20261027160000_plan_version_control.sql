BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "TreatmentPlan"
  ADD COLUMN IF NOT EXISTS "changeSummary" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdByRole" text CHECK ("createdByRole" IS NULL OR "createdByRole" IN ('LAB','DOCTOR','SYSTEM')),
  ADD COLUMN IF NOT EXISTS "createdById" text,
  ADD COLUMN IF NOT EXISTS "authorName" text,
  ADD COLUMN IF NOT EXISTS "parentPlanId" text REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "approvedByDoctorId" text REFERENCES "Doctor"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz;

CREATE TABLE IF NOT EXISTS "TreatmentPlanFile" (
  id bigserial PRIMARY KEY,
  "planId" text NOT NULL REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT,
  "caseFileId" text REFERENCES "CaseFile"(id) ON DELETE RESTRICT,
  "largeFileId" text REFERENCES "LargeClinicalFile"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "TreatmentPlanFile_one_source" CHECK (("caseFileId" IS NOT NULL) <> ("largeFileId" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanFile_plan_caseFile_key"
  ON "TreatmentPlanFile"("planId","caseFileId") WHERE "caseFileId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "TreatmentPlanFile_plan_largeFile_key"
  ON "TreatmentPlanFile"("planId","largeFileId") WHERE "largeFileId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "TreatmentPlanVersionAudit" (
  id bigserial PRIMARY KEY,
  "planId" text NOT NULL REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT,
  "caseId" text NOT NULL REFERENCES "PortalCase"(id) ON DELETE RESTRICT,
  "actorId" text NOT NULL,
  "actorName" text NOT NULL,
  "actorRole" text NOT NULL,
  action text NOT NULL CHECK (action IN ('VERSION_CREATED','DOCTOR_APPROVED','DOCTOR_REVISION_REQUESTED','LEGACY_VERSION_REGISTERED')),
  detail jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "TreatmentPlanVersionAudit_case_created_idx"
  ON "TreatmentPlanVersionAudit"("caseId",id);
CREATE INDEX IF NOT EXISTS "TreatmentPlanVersionAudit_plan_created_idx"
  ON "TreatmentPlanVersionAudit"("planId",id);
ALTER TABLE "TreatmentPlanVersionAudit" DROP CONSTRAINT IF EXISTS "TreatmentPlanVersionAudit_action_check";
ALTER TABLE "TreatmentPlanVersionAudit" ADD CONSTRAINT "TreatmentPlanVersionAudit_action_check"
  CHECK (action IN ('VERSION_CREATED','DOCTOR_APPROVED','DOCTOR_REVISION_REQUESTED','LEGACY_VERSION_REGISTERED'));
INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail,"createdAt")
  SELECT p.id,p."caseId",'MIGRATION','Legacy version history import','SYSTEM','LEGACY_VERSION_REGISTERED',
    jsonb_build_object('version',p.version,'originalCreatedAt',p."createdAt",'changeSummaryRecorded',p."changeSummary"<>''),now()
  FROM "TreatmentPlan" p
  WHERE NOT EXISTS (SELECT 1 FROM "TreatmentPlanVersionAudit" a WHERE a."planId"=p.id);

CREATE OR REPLACE FUNCTION aa_plan_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected_version integer;
  parent_case text;
  latest_version integer;
  actor_role text;
  actor_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Treatment plan versions are permanent; restore by creating a new version';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM "PortalCase" WHERE id=NEW."caseId" FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Treatment plan case does not exist'; END IF;
    SELECT COALESCE(MAX(version),0)+1 INTO expected_version FROM "TreatmentPlan" WHERE "caseId"=NEW."caseId";
    IF NEW.version <> expected_version THEN RAISE EXCEPTION 'Plan version must be the next sequential case version'; END IF;
    IF NEW."parentPlanId" IS NOT NULL THEN
      SELECT "caseId" INTO parent_case FROM "TreatmentPlan" WHERE id=NEW."parentPlanId";
      IF parent_case IS DISTINCT FROM NEW."caseId" THEN RAISE EXCEPTION 'A restored plan must come from this case'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."caseId" IS DISTINCT FROM OLD."caseId"
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW."changeSummary" IS DISTINCT FROM OLD."changeSummary"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR NEW."createdByRole" IS DISTINCT FROM OLD."createdByRole"
     OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
     OR NEW."authorName" IS DISTINCT FROM OLD."authorName"
     OR NEW."parentPlanId" IS DISTINCT FROM OLD."parentPlanId" THEN
    RAISE EXCEPTION 'Plan version content is immutable; create a new version';
  END IF;
  IF NEW.decision IS NOT DISTINCT FROM OLD.decision THEN
    IF NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
       OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
       OR NEW."approvedByDoctorId" IS DISTINCT FROM OLD."approvedByDoctorId" THEN
      RAISE EXCEPTION 'Approval metadata is immutable';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.decision <> 'PENDING' OR NEW.decision NOT IN ('APPROVED','CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'A plan decision can be recorded only once';
  END IF;
  actor_role := current_setting('allen.plan_actor_role',true);
  actor_id := current_setting('allen.plan_actor_id',true);
  IF actor_role IS DISTINCT FROM 'DOCTOR' OR actor_id IS NULL OR actor_id=''
     OR NEW."reviewedAt" IS NULL THEN
    RAISE EXCEPTION 'A doctor identity and decision timestamp are required';
  END IF;
  SELECT MAX(version) INTO latest_version FROM "TreatmentPlan" WHERE "caseId"=NEW."caseId";
  IF latest_version IS DISTINCT FROM NEW.version THEN
    RAISE EXCEPTION 'Only the current latest version may receive a doctor decision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ClinicalReview" WHERE "planId"=NEW.id AND status='APPROVED') THEN
    RAISE EXCEPTION 'Internal clinical approval is required for this exact plan version';
  END IF;
  IF NEW.decision='APPROVED' THEN
    IF NEW."approvedByDoctorId" IS DISTINCT FROM actor_id OR NEW."approvedAt" IS NULL THEN
      RAISE EXCEPTION 'Doctor approval must be bound to the approving doctor and timestamp';
    END IF;
  ELSIF NEW."approvedByDoctorId" IS NOT NULL OR NEW."approvedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'A revision request is not an approval';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_version_guard ON "TreatmentPlan";
CREATE TRIGGER aa_plan_version_guard BEFORE INSERT OR UPDATE OR DELETE ON "TreatmentPlan"
  FOR EACH ROW EXECUTE FUNCTION aa_plan_version_guard();

CREATE OR REPLACE FUNCTION aa_plan_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_case text; file_case text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Treatment plan file references are immutable'; END IF;
  SELECT "caseId" INTO plan_case FROM "TreatmentPlan" WHERE id=NEW."planId";
  IF plan_case IS NULL THEN RAISE EXCEPTION 'Treatment plan does not exist'; END IF;
  IF NEW."caseFileId" IS NOT NULL THEN
    SELECT "caseId" INTO file_case FROM "CaseFile" WHERE id=NEW."caseFileId";
  ELSE
    SELECT "caseId" INTO file_case FROM "LargeClinicalFile" WHERE id=NEW."largeFileId";
  END IF;
  IF file_case IS DISTINCT FROM plan_case THEN RAISE EXCEPTION 'Plan files must belong to the same case'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_file_immutable ON "TreatmentPlanFile";
CREATE TRIGGER aa_plan_file_immutable BEFORE INSERT OR UPDATE OR DELETE ON "TreatmentPlanFile"
  FOR EACH ROW EXECUTE FUNCTION aa_plan_file_guard();
CREATE OR REPLACE FUNCTION aa_plan_file_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Treatment plan file history is immutable'; END $$;
DROP TRIGGER IF EXISTS aa_plan_file_no_truncate ON "TreatmentPlanFile";
CREATE TRIGGER aa_plan_file_no_truncate BEFORE TRUNCATE ON "TreatmentPlanFile"
  FOR EACH STATEMENT EXECUTE FUNCTION aa_plan_file_no_truncate();

CREATE OR REPLACE FUNCTION aa_plan_version_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Treatment plan version audit is immutable'; END $$;
DROP TRIGGER IF EXISTS aa_plan_version_audit_immutable ON "TreatmentPlanVersionAudit";
CREATE TRIGGER aa_plan_version_audit_immutable BEFORE UPDATE OR DELETE ON "TreatmentPlanVersionAudit"
  FOR EACH ROW EXECUTE FUNCTION aa_plan_version_audit_immutable();
DROP TRIGGER IF EXISTS aa_plan_version_audit_no_truncate ON "TreatmentPlanVersionAudit";
CREATE TRIGGER aa_plan_version_audit_no_truncate BEFORE TRUNCATE ON "TreatmentPlanVersionAudit"
  FOR EACH STATEMENT EXECUTE FUNCTION aa_plan_version_audit_immutable();

CREATE OR REPLACE FUNCTION aa_plan_snapshot_files() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW."parentPlanId" IS NOT NULL THEN
    INSERT INTO "TreatmentPlanFile"("planId","caseFileId","largeFileId")
      SELECT NEW.id,"caseFileId","largeFileId" FROM "TreatmentPlanFile" WHERE "planId"=NEW."parentPlanId";
  ELSE
    INSERT INTO "TreatmentPlanFile"("planId","caseFileId") SELECT NEW.id,id FROM "CaseFile" WHERE "caseId"=NEW."caseId";
    INSERT INTO "TreatmentPlanFile"("planId","largeFileId") SELECT NEW.id,id FROM "LargeClinicalFile" WHERE "caseId"=NEW."caseId";
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_snapshot_files ON "TreatmentPlan";
CREATE TRIGGER aa_plan_snapshot_files AFTER INSERT ON "TreatmentPlan"
  FOR EACH ROW EXECUTE FUNCTION aa_plan_snapshot_files();

CREATE OR REPLACE FUNCTION aa_plan_version_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_id text; actor_name text; actor_role text; event_action text;
BEGIN
  IF TG_OP='INSERT' THEN
    actor_id:=coalesce(nullif(NEW."createdById",''),'SYSTEM');
    actor_name:=coalesce(nullif(NEW."authorName",''),'System');
    actor_role:=coalesce(nullif(NEW."createdByRole",''),'SYSTEM');
    event_action:='VERSION_CREATED';
    INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail)
      VALUES(NEW.id,NEW."caseId",actor_id,actor_name,actor_role,event_action,
        jsonb_build_object('version',NEW.version,'changeSummary',NEW."changeSummary",'parentPlanId',NEW."parentPlanId"));
  ELSIF NEW.decision IS DISTINCT FROM OLD.decision THEN
    actor_id:=coalesce(nullif(current_setting('allen.plan_actor_id',true),''),'SYSTEM');
    actor_name:=coalesce(nullif(current_setting('allen.plan_actor_name',true),''),'System');
    actor_role:=coalesce(nullif(current_setting('allen.plan_actor_role',true),''),'SYSTEM');
    event_action:=CASE NEW.decision WHEN 'APPROVED' THEN 'DOCTOR_APPROVED' ELSE 'DOCTOR_REVISION_REQUESTED' END;
    INSERT INTO "TreatmentPlanVersionAudit"("planId","caseId","actorId","actorName","actorRole",action,detail)
      VALUES(NEW.id,NEW."caseId",actor_id,actor_name,actor_role,event_action,
        jsonb_build_object('version',NEW.version,'fromDecision',OLD.decision,'toDecision',NEW.decision,'approvedAt',NEW."approvedAt"));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_version_audit ON "TreatmentPlan";
CREATE TRIGGER aa_plan_version_audit AFTER INSERT OR UPDATE ON "TreatmentPlan"
  FOR EACH ROW EXECUTE FUNCTION aa_plan_version_audit();
COMMIT;
