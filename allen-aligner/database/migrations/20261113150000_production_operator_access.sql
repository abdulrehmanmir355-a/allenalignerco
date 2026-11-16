BEGIN;
SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('public."WorkAccount"') IS NULL
     OR to_regclass('public."Employee"') IS NULL
     OR to_regclass('public."ManufacturingStageRecord"') IS NULL THEN
    RAISE EXCEPTION 'Install employee accounts and production stages before operator access.';
  END IF;
END
$guard$;

ALTER TABLE public."WorkAccount" DROP CONSTRAINT IF EXISTS "WorkAccount_role_check";
ALTER TABLE public."WorkAccount" ADD CONSTRAINT "WorkAccount_role_check"
  CHECK (role IN ('EMPLOYEE','MANAGER','CLINICAL_ONLY','PRODUCTION_OPERATOR'));

ALTER TABLE public."ManufacturingStageRecord"
  ALTER COLUMN "recordedBy" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "recordedByEmployeeId" text REFERENCES public."Employee"(id) ON DELETE RESTRICT;
ALTER TABLE public."ManufacturingStageRecord" DROP CONSTRAINT IF EXISTS "ManufacturingStageRecord_recorder_check";
ALTER TABLE public."ManufacturingStageRecord"
  ADD CONSTRAINT "ManufacturingStageRecord_recorder_check"
  CHECK (("recordedBy" IS NOT NULL) <> ("recordedByEmployeeId" IS NOT NULL));

COMMIT;
