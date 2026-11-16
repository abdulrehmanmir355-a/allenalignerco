BEGIN;
SET LOCAL lock_timeout='10s';
-- Extend the existing version engine without replacing downstream review/approval triggers.
CREATE OR REPLACE FUNCTION aa_plan_revision_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_version integer;
BEGIN
 IF NEW.decision <> 'PENDING' OR NEW."reviewedAt" IS NOT NULL
    OR NEW."approvedAt" IS NOT NULL OR NEW."approvedByDoctorId" IS NOT NULL THEN
  RAISE EXCEPTION 'New plan versions require fresh clinical and doctor approval';
 END IF;
 IF length(trim(coalesce(NEW."changeSummary",'')))<5 THEN
  RAISE EXCEPTION 'A written revision reason of at least five characters is required';
 END IF;
 IF NEW.version=1 AND NEW."parentPlanId" IS NOT NULL THEN
  RAISE EXCEPTION 'The first plan version cannot have a parent';
 ELSIF NEW.version>1 THEN
  SELECT version INTO source_version FROM "TreatmentPlan"
   WHERE id=NEW."parentPlanId" AND "caseId"=NEW."caseId";
  IF source_version IS NULL OR source_version>=NEW.version THEN
   RAISE EXCEPTION 'A revision must reference a previous plan version from this case';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_plan_revision_integrity ON "TreatmentPlan";
CREATE TRIGGER aa_plan_revision_integrity BEFORE INSERT ON "TreatmentPlan"
 FOR EACH ROW EXECUTE FUNCTION aa_plan_revision_integrity();
-- A lineage link alone must not suppress newly uploaded case files on an ordinary revision.
CREATE OR REPLACE FUNCTION aa_plan_snapshot_files() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."parentPlanId" IS NOT NULL AND NEW."parentPlanId"=current_setting('allen.restore_plan_source',true) THEN
  INSERT INTO "TreatmentPlanFile"("planId","caseFileId","largeFileId")
   SELECT NEW.id,"caseFileId","largeFileId" FROM "TreatmentPlanFile" WHERE "planId"=NEW."parentPlanId";
 ELSE
  INSERT INTO "TreatmentPlanFile"("planId","caseFileId") SELECT NEW.id,id FROM "CaseFile" WHERE "caseId"=NEW."caseId";
  INSERT INTO "TreatmentPlanFile"("planId","largeFileId") SELECT NEW.id,id FROM "LargeClinicalFile" WHERE "caseId"=NEW."caseId";
 END IF;
 RETURN NEW;
END $$;
-- Row deletion protections do not cover TRUNCATE, including TRUNCATE ... CASCADE.
DROP TRIGGER IF EXISTS aa_plan_history_no_truncate ON "TreatmentPlan";
CREATE TRIGGER aa_plan_history_no_truncate BEFORE TRUNCATE ON "TreatmentPlan"
 FOR EACH STATEMENT EXECUTE FUNCTION aa_plan_version_audit_immutable();
COMMIT;
