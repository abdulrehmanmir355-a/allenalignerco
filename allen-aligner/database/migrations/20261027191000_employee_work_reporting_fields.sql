-- Add missing fields required by the existing daily-work form and report view.
-- Additive and repeatable; no employee, task, or work-report rows are rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(204026, 271910);

DO $$
BEGIN
  IF to_regclass('public."WorkReport"') IS NULL THEN
    RAISE EXCEPTION 'Work reporting migration stopped: public.WorkReport does not exist.';
  END IF;
END $$;

ALTER TABLE public."WorkReport"
  ADD COLUMN IF NOT EXISTS "workStartTime" time,
  ADD COLUMN IF NOT EXISTS "taskStatus" text NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN IF NOT EXISTS blockers varchar(2000) NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."WorkReport"'::regclass AND conname='WorkReport_taskStatus_check') THEN
    ALTER TABLE public."WorkReport"
      ADD CONSTRAINT "WorkReport_taskStatus_check"
      CHECK ("taskStatus" IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public."WorkReport" VALIDATE CONSTRAINT "WorkReport_taskStatus_check";
CREATE INDEX IF NOT EXISTS work_report_employee_date
  ON public."WorkReport"("employeeId", "reportingDate" DESC, revision DESC);

COMMIT;
