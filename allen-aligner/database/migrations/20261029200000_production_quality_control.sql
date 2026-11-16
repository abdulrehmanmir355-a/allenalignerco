BEGIN;
SET LOCAL lock_timeout='5s';

-- Append-only inspections preserve every quality decision and evidence snapshot.
CREATE TABLE IF NOT EXISTS "ProductionQCInspection" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" text NOT NULL REFERENCES "PortalCase"(id) ON DELETE RESTRICT,
  "planId" text NOT NULL REFERENCES "TreatmentPlan"(id) ON DELETE RESTRICT,
  stage varchar(20) NOT NULL CHECK (stage IN ('INCOMING','IN_PROCESS','FINAL')),
  disposition varchar(12) NOT NULL CHECK (disposition IN ('PASS','HOLD','REWORK','REJECT')),
  checklist jsonb NOT NULL,
  notes text NOT NULL CHECK (length(trim(notes)) >= 5),
  inspector varchar(120) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (jsonb_typeof(checklist)='object')
);
CREATE INDEX IF NOT EXISTS "ProductionQCInspection_case_stage_time_idx"
  ON "ProductionQCInspection"("caseId",stage,"createdAt" DESC,id DESC);
CREATE INDEX IF NOT EXISTS "ProductionQCInspection_plan_stage_idx"
  ON "ProductionQCInspection"("caseId","planId",stage,"createdAt" DESC,id DESC);

CREATE OR REPLACE FUNCTION aa_production_qc_inspection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "PortalCase"%ROWTYPE; latest_plan text;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'QC inspections are append-only'; END IF;
  SELECT * INTO c FROM "PortalCase" WHERE id=NEW."caseId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  SELECT id INTO latest_plan FROM "TreatmentPlan" WHERE "caseId"=c.id ORDER BY version DESC LIMIT 1;
  IF latest_plan IS NULL OR NEW."planId" IS DISTINCT FROM latest_plan OR NOT EXISTS (
    SELECT 1 FROM "TreatmentPlan" p
    JOIN "ClinicalReview" r ON r."planId"=p.id AND r.status='APPROVED'
    JOIN "TreatmentPlanVersionAudit" a ON a."planId"=p.id AND a.action='DOCTOR_APPROVED' AND a.detail->>'decision'='APPROVED'
    WHERE p.id=latest_plan AND p.decision='APPROVED'
  ) THEN RAISE EXCEPTION 'QC requires the latest clinically reviewed and doctor-approved plan'; END IF;
  IF (NEW.stage='INCOMING' AND c.status NOT IN ('APPROVED','IN_PRODUCTION'))
    OR (NEW.stage IN ('IN_PROCESS','FINAL') AND c.status<>'IN_PRODUCTION') THEN
    RAISE EXCEPTION 'This QC stage is unavailable in the current production status';
  END IF;
  IF jsonb_object_length(NEW.checklist)<>3 THEN RAISE EXCEPTION 'QC checklist must contain every stage item'; END IF;
  IF (NEW.stage='INCOMING' AND NOT (NEW.checklist ?& ARRAY['materialIdentity','quantity','condition']))
    OR (NEW.stage='IN_PROCESS' AND NOT (NEW.checklist ?& ARRAY['dimensionalAccuracy','applianceIntegrity','fitCheck']))
    OR (NEW.stage='FINAL' AND NOT (NEW.checklist ?& ARRAY['planMatch','labeling','packaging'])) THEN
    RAISE EXCEPTION 'QC checklist does not match the inspection stage';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(NEW.checklist) item WHERE item.value NOT IN ('true','false')) THEN
    RAISE EXCEPTION 'QC checklist values must be boolean';
  END IF;
  IF NEW.disposition='PASS' AND EXISTS (
    SELECT 1 FROM jsonb_each_text(NEW.checklist) item WHERE item.value<>'true'
  ) THEN RAISE EXCEPTION 'A PASS requires every stage checklist item'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_production_qc_inspection_guard ON "ProductionQCInspection";
CREATE TRIGGER aa_production_qc_inspection_guard BEFORE INSERT OR UPDATE OR DELETE ON "ProductionQCInspection"
  FOR EACH ROW EXECUTE FUNCTION aa_production_qc_inspection_guard();

CREATE OR REPLACE FUNCTION aa_production_qc_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_plan text; stage_name text; disposition_name text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('IN_PRODUCTION','SHIPPED') THEN RETURN NEW; END IF;
  SELECT id INTO current_plan FROM "TreatmentPlan" WHERE "caseId"=NEW.id ORDER BY version DESC LIMIT 1;
  IF current_plan IS NULL THEN RAISE EXCEPTION 'Production requires an approved treatment plan'; END IF;
  FOREACH stage_name IN ARRAY CASE WHEN NEW.status='IN_PRODUCTION' THEN ARRAY['INCOMING'] ELSE ARRAY['INCOMING','IN_PROCESS','FINAL'] END LOOP
    SELECT disposition INTO disposition_name FROM "ProductionQCInspection"
      WHERE "caseId"=NEW.id AND "planId"=current_plan AND stage=stage_name
      ORDER BY "createdAt" DESC,id DESC LIMIT 1;
    IF disposition_name IS DISTINCT FROM 'PASS' THEN
      RAISE EXCEPTION 'Production blocked: % QC must have a current-plan PASS before this step',replace(stage_name,'_',' ');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_production_qc_transition_guard ON "PortalCase";
CREATE TRIGGER aa_production_qc_transition_guard BEFORE UPDATE OF status ON "PortalCase"
  FOR EACH ROW EXECUTE FUNCTION aa_production_qc_transition_guard();
COMMIT;
