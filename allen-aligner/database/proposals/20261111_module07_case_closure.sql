-- REVIEW DRAFT: do not apply until the owner approves the case-closure rollout.
-- Adds an explicit closure marker after the assigned doctor completes retention.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "PortalCase" ADD COLUMN "caseClosedAt" timestamptz;
ALTER TABLE "PortalCase" ADD CONSTRAINT "PortalCase_case_closure_check" CHECK (
  "caseClosedAt" IS NULL OR (status='COMPLETED' AND "careStage"='RETENTION_COMPLETED')
);

CREATE FUNCTION aa_case_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."caseClosedAt" IS DISTINCT FROM OLD."caseClosedAt" THEN
    IF OLD."caseClosedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Closed case records cannot be reopened';
    END IF;
    IF NEW."caseClosedAt" IS NULL
      OR current_setting('allen.case_close', true) IS DISTINCT FROM 'yes'
      OR NEW.status<>'COMPLETED'
      OR NEW."careStage"<>'RETENTION_COMPLETED' THEN
      RAISE EXCEPTION 'Case closure requires completed treatment and retention';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER aa_case_closure_guard BEFORE UPDATE ON "PortalCase"
  FOR EACH ROW EXECUTE FUNCTION aa_case_closure_guard();

COMMENT ON COLUMN "PortalCase"."caseClosedAt" IS 'Explicit assigned-doctor closure time, recorded after retention follow-up.';
COMMIT;
