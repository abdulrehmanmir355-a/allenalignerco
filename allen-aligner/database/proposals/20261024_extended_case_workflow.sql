-- REVIEW DRAFT: do not run automatically. No enum changes, backfill or new tables.
-- Apply only after the owner approves this SQL and its activation plan.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "PortalCase"
  ADD COLUMN "qcState" text,
  ADD COLUMN "qcPlanId" text,
  ADD COLUMN "careStage" text;

ALTER TABLE "PortalCase" ADD CONSTRAINT "PortalCase_extended_workflow_check" CHECK (
  ("qcState" IS NULL AND "qcPlanId" IS NULL AND "careStage" IS NULL)
  OR (
    "qcState" IS NOT NULL AND "careStage" IS NOT NULL
    AND "qcState" IN ('PENDING','PASSED','FAILED','NOT_RECORDED')
    AND "careStage" IN ('NOT_STARTED','ACTIVE','REFINEMENT','TREATMENT_COMPLETED','RETENTION','RETENTION_COMPLETED')
    AND (("qcState" IN ('PASSED','FAILED') AND "qcPlanId" IS NOT NULL)
      OR ("qcState" IN ('PENDING','NOT_RECORDED') AND "qcPlanId" IS NULL))
  )
);
ALTER TABLE "PortalCase" ADD CONSTRAINT "PortalCase_qc_plan_fkey"
  FOREIGN KEY ("qcPlanId") REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION aa_extended_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_stage text; latest_plan text; approved_plan boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    previous_stage := OLD."careStage";
    IF previous_stage IS NOT NULL AND (NEW."careStage" IS NULL OR NEW."qcState" IS NULL) THEN
      RAISE EXCEPTION 'Enrolled case workflow cannot be removed';
    END IF;
  END IF;
  IF NEW."careStage" IS NULL THEN RETURN NEW; END IF;

  IF previous_stage IS NULL THEN
    IF NEW."careStage"<>'NOT_STARTED' THEN RAISE EXCEPTION 'Enrollment must start without inferred treatment history'; END IF;
    IF NEW."qcState"='NOT_RECORDED' THEN
      IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Only existing dispatched cases can have historical QC unrecorded'; END IF;
      IF OLD.status NOT IN ('SHIPPED','COMPLETED') OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Historical QC exemption requires an existing dispatched case';
      END IF;
    ELSIF NEW."qcState"<>'PENDING' OR NEW."qcPlanId" IS NOT NULL THEN
      RAISE EXCEPTION 'New workflow requires pending QC';
    END IF;
  ELSIF NEW."qcState"='NOT_RECORDED' AND OLD."qcState"<>'NOT_RECORDED' THEN
    RAISE EXCEPTION 'Historical QC exemption cannot be added later';
  END IF;

  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('IN_PRODUCTION','PLANNING','CHANGES_REQUESTED') THEN
    NEW."qcState" := 'PENDING'; NEW."qcPlanId" := NULL;
  END IF;

  SELECT p.id, (p.decision='APPROVED' AND coalesce(r.status='APPROVED',false)) INTO latest_plan,approved_plan
    FROM "TreatmentPlan" p LEFT JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=NEW.id ORDER BY p.version DESC LIMIT 1;
  IF NEW."qcPlanId" IS NOT NULL AND (NEW."qcPlanId" IS DISTINCT FROM latest_plan OR NOT coalesce(approved_plan,false)) THEN
    RAISE EXCEPTION 'QC evidence must belong to the latest approved plan of this case';
  END IF;
  IF TG_OP='UPDATE' AND NEW."qcState" IS DISTINCT FROM OLD."qcState" AND NEW."qcState" IN ('PASSED','FAILED') AND NEW.status<>'IN_PRODUCTION' THEN
    RAISE EXCEPTION 'QC decisions require manufacture';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status='SHIPPED' THEN
    IF NEW."qcState"<>'PASSED' OR NEW."qcPlanId" IS DISTINCT FROM latest_plan OR NOT coalesce(approved_plan,false) THEN
      RAISE EXCEPTION 'Dispatch requires current-plan QC and clinical and doctor approval';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status='COMPLETED' AND NEW."careStage"<>'TREATMENT_COMPLETED' THEN
    RAISE EXCEPTION 'Enrolled case completion requires treatment completion';
  END IF;

  IF previous_stage IS NOT NULL AND NEW."careStage" IS DISTINCT FROM previous_stage AND NOT (
    (previous_stage='NOT_STARTED' AND NEW."careStage"='ACTIVE') OR
    (previous_stage='ACTIVE' AND NEW."careStage" IN ('REFINEMENT','TREATMENT_COMPLETED')) OR
    (previous_stage='REFINEMENT' AND NEW."careStage"='ACTIVE') OR
    (previous_stage='TREATMENT_COMPLETED' AND NEW."careStage"='RETENTION') OR
    (previous_stage='RETENTION' AND NEW."careStage"='RETENTION_COMPLETED')
  ) THEN RAISE EXCEPTION 'Invalid treatment or retention transition'; END IF;

  IF NEW."careStage"='ACTIVE' AND NEW.status NOT IN ('SHIPPED','COMPLETED') THEN
    RAISE EXCEPTION 'Active treatment requires a dispatched case';
  END IF;
  IF previous_stage IN ('NOT_STARTED','REFINEMENT') AND NEW."careStage"='ACTIVE' THEN
    IF NOT (previous_stage='NOT_STARTED' AND NEW."qcState"='NOT_RECORDED')
      AND (NEW."qcState"<>'PASSED' OR NEW."qcPlanId" IS DISTINCT FROM latest_plan OR NOT coalesce(approved_plan,false)) THEN
      RAISE EXCEPTION 'Treatment requires current-plan QC and approvals';
    END IF;
  END IF;
  IF NEW."careStage"='REFINEMENT' AND NEW.status NOT IN ('CHANGES_REQUESTED','PLANNING','REVIEW','APPROVED','IN_PRODUCTION','SHIPPED') THEN
    RAISE EXCEPTION 'Refinement must follow the existing approval and manufacturing cycle';
  END IF;
  IF NEW."careStage" IN ('TREATMENT_COMPLETED','RETENTION','RETENTION_COMPLETED') AND NEW.status<>'COMPLETED' THEN
    RAISE EXCEPTION 'Retention requires completed clinical treatment';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aa_extended_case_guard BEFORE INSERT OR UPDATE ON "PortalCase"
  FOR EACH ROW EXECUTE FUNCTION aa_extended_case_guard();

COMMENT ON COLUMN "PortalCase"."qcState" IS 'NULL preserves legacy behavior. Enrolled cases require QC for each new approved manufacturing cycle.';
COMMENT ON COLUMN "PortalCase"."qcPlanId" IS 'QC evidence is bound to the latest internally and doctor-approved plan.';
COMMENT ON COLUMN "PortalCase"."careStage" IS 'Assigned-doctor treatment/retention phase; independent of existing CaseStatus enum.';
COMMIT;
