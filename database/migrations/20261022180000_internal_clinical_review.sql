BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "WorkAccount" ADD COLUMN "clinicalRole" text CHECK ("clinicalRole" IN ('REVIEWER','LEAD','ADMIN'));
CREATE TABLE "ClinicalReview" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "planId" text NOT NULL UNIQUE REFERENCES "TreatmentPlan"(id),
 "assignedTo" uuid REFERENCES "WorkAccount"(id), priority text NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH','URGENT')),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','IN_REVIEW','ESCALATED','APPROVED','REVISION_REQUESTED','RETURNED')),
 checklist jsonb NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 0,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "startedAt" timestamptz, "completedAt" timestamptz,
 "decidedBy" uuid REFERENCES "WorkAccount"(id)
);
CREATE INDEX "ClinicalReview_assignment_status" ON "ClinicalReview"("assignedTo",status);
CREATE TABLE "ClinicalReviewAudit" (
 id bigserial PRIMARY KEY, "reviewId" uuid REFERENCES "ClinicalReview"(id), "actorId" text NOT NULL,
 "actorName" text NOT NULL, action text NOT NULL, detail jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ClinicalReviewAudit_review" ON "ClinicalReviewAudit"("reviewId",id);
CREATE FUNCTION aa_clinical_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Clinical history is immutable'; END $$;
CREATE TRIGGER aa_clinical_audit_immutable BEFORE UPDATE OR DELETE ON "ClinicalReviewAudit" FOR EACH ROW EXECUTE FUNCTION aa_clinical_immutable();
CREATE TRIGGER aa_clinical_audit_no_truncate BEFORE TRUNCATE ON "ClinicalReviewAudit" FOR EACH STATEMENT EXECUTE FUNCTION aa_clinical_immutable();
CREATE FUNCTION aa_clinical_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO "ClinicalReviewAudit"("reviewId","actorId","actorName",action,detail)
 VALUES(NEW.id,coalesce(nullif(current_setting('allen.clinical_actor',true),''),'SYSTEM'),
 coalesce(nullif(current_setting('allen.clinical_name',true),''),'System'),
 coalesce(nullif(current_setting('allen.clinical_action',true),''),TG_OP),
 jsonb_build_object('before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,'after',to_jsonb(NEW)));
 RETURN NEW; END $$;
CREATE TRIGGER aa_clinical_audit AFTER INSERT OR UPDATE ON "ClinicalReview" FOR EACH ROW EXECUTE FUNCTION aa_clinical_audit();
CREATE FUNCTION aa_clinical_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO "ClinicalReview"("planId") VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER aa_clinical_enqueue AFTER INSERT ON "TreatmentPlan" FOR EACH ROW EXECUTE FUNCTION aa_clinical_enqueue();
INSERT INTO "ClinicalReview"("planId") SELECT id FROM "TreatmentPlan";
CREATE FUNCTION aa_clinical_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."caseId" IS DISTINCT FROM OLD."caseId" OR NEW.version IS DISTINCT FROM OLD.version OR NEW.summary IS DISTINCT FROM OLD.summary THEN
 RAISE EXCEPTION 'Create a new treatment plan version; existing versions are immutable'; END IF;
 IF NEW.decision IS DISTINCT FROM OLD.decision AND NEW.decision IN ('APPROVED','CHANGES_REQUESTED') AND NOT EXISTS(SELECT 1 FROM "ClinicalReview" WHERE "planId"=NEW.id AND status='APPROVED') THEN
 RAISE EXCEPTION 'Current plan requires clinical approval before doctor decision'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER aa_clinical_plan_guard BEFORE UPDATE ON "TreatmentPlan" FOR EACH ROW EXECUTE FUNCTION aa_clinical_plan_guard();
CREATE FUNCTION aa_clinical_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('REVIEW','APPROVED','IN_PRODUCTION') THEN
 IF NOT EXISTS(SELECT 1 FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=NEW.id AND r.status='APPROVED' AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=NEW.id) AND (NEW.status='REVIEW' OR p.decision='APPROVED')) THEN
 RAISE EXCEPTION 'Clinical and doctor approvals are required for this transition'; END IF; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER aa_clinical_release_guard BEFORE UPDATE ON "PortalCase" FOR EACH ROW EXECUTE FUNCTION aa_clinical_release_guard();
COMMIT;
