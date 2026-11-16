BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION aa_clinical_reassignment_reason_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('allen.clinical_action', true) = 'assign'
     AND OLD."assignedTo" IS NOT NULL
     AND NEW."assignedTo" IS DISTINCT FROM OLD."assignedTo"
     AND length(trim(coalesce(current_setting('allen.clinical_assignment_reason', true), ''))) < 10 THEN
    RAISE EXCEPTION 'A written reason of at least 10 characters is required to reassign a reviewer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_clinical_reassignment_reason_guard ON "ClinicalReview";
CREATE TRIGGER aa_clinical_reassignment_reason_guard
BEFORE UPDATE ON "ClinicalReview"
FOR EACH ROW EXECUTE FUNCTION aa_clinical_reassignment_reason_guard();

COMMIT;
