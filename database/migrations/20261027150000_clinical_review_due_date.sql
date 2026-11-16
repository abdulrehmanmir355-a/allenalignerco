BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "ClinicalReview"
  ADD COLUMN IF NOT EXISTS "dueDate" date;
CREATE INDEX IF NOT EXISTS "ClinicalReview_open_due_date"
  ON "ClinicalReview"("dueDate")
  WHERE status IN ('PENDING','IN_REVIEW','ESCALATED');
COMMIT;
