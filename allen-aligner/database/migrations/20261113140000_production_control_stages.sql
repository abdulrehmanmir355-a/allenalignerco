BEGIN;
SET LOCAL lock_timeout = '10s';

DO $guard$
BEGIN
  IF to_regclass('public."ManufacturingOrder"') IS NULL
     OR to_regclass('public."ManufacturingOrderAudit"') IS NULL
     OR to_regclass('public."HRUser"') IS NULL THEN
    RAISE EXCEPTION 'Install manufacturing orders and HR users before production control stages.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public."ManufacturingStageRecord" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" uuid NOT NULL REFERENCES public."ManufacturingOrder"(id) ON DELETE RESTRICT,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 10000),
  "stageName" varchar(120) NOT NULL CHECK (length(btrim("stageName")) >= 2),
  "operatorName" varchar(200) NOT NULL CHECK (length(btrim("operatorName")) >= 2),
  "machineName" varchar(160) NOT NULL CHECK (length(btrim("machineName")) >= 2),
  "materialUsed" varchar(240) NOT NULL CHECK (length(btrim("materialUsed")) >= 2),
  "durationMinutes" integer NOT NULL CHECK ("durationMinutes" BETWEEN 1 AND 1440),
  result varchar(16) NOT NULL CHECK (result IN ('PASS','REWORK','FAIL')),
  notes varchar(2000) NOT NULL DEFAULT '',
  "recordedBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("orderId",sequence)
);
CREATE INDEX IF NOT EXISTS "ManufacturingStageRecord_order_sequence_idx"
  ON public."ManufacturingStageRecord"("orderId",sequence DESC);

CREATE OR REPLACE FUNCTION public.aa_manufacturing_stage_record_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN RAISE EXCEPTION 'Manufacturing stage history is append-only'; END
$function$;
DROP TRIGGER IF EXISTS aa_manufacturing_stage_record_immutable ON public."ManufacturingStageRecord";
CREATE TRIGGER aa_manufacturing_stage_record_immutable
  BEFORE UPDATE OR DELETE ON public."ManufacturingStageRecord"
  FOR EACH ROW EXECUTE FUNCTION public.aa_manufacturing_stage_record_immutable();

COMMIT;
