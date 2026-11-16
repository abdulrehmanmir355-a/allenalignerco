BEGIN;

DO $migration_guard$
BEGIN
  IF to_regclass('public."ManufacturingOrder"') IS NULL
     OR to_regclass('public."ManufacturingStageRecord"') IS NULL
     OR to_regclass('public."ManufacturingOrderAudit"') IS NULL
     OR to_regclass('public."HRUser"') IS NULL THEN
    RAISE EXCEPTION 'Apply the manufacturing order, stage history, and HR migrations before quality release.';
  END IF;
END
$migration_guard$;

DO $status_constraints$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public."ManufacturingOrder"'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%MATERIAL_CHECK%'
      AND pg_get_constraintdef(oid) ILIKE '%SUPERSEDED%'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%queuePosition%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%materialCheckedAt%'
  LOOP
    EXECUTE format('ALTER TABLE public."ManufacturingOrder" DROP CONSTRAINT %I',constraint_row.conname);
  END LOOP;

  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='public."ManufacturingOrder"'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%queuePosition%'
      AND pg_get_constraintdef(oid) ILIKE '%SUPERSEDED%'
  LOOP
    EXECUTE format('ALTER TABLE public."ManufacturingOrder" DROP CONSTRAINT %I',constraint_row.conname);
  END LOOP;
END
$status_constraints$;

ALTER TABLE public."ManufacturingOrder"
  ADD CONSTRAINT "ManufacturingOrder_status_check"
  CHECK (status IN ('MATERIAL_CHECK','COMMERCIAL_CHECK','CAPACITY_CHECK','QUEUED','QUALITY_HOLD','RELEASED','SUPERSEDED'));

ALTER TABLE public."ManufacturingOrder"
  ADD CONSTRAINT "ManufacturingOrder_queue_status_check"
  CHECK ("queuePosition" IS NULL OR (status IN ('QUEUED','QUALITY_HOLD','RELEASED','SUPERSEDED') AND "capacityCheckedAt" IS NOT NULL));

CREATE TABLE IF NOT EXISTS public."ManufacturingQualityReview" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" uuid NOT NULL REFERENCES public."ManufacturingOrder"(id) ON DELETE RESTRICT,
  decision varchar(8) NOT NULL CHECK (decision IN ('PASS','REWORK','FAIL')),
  evidence varchar(2000) NOT NULL CHECK (length(btrim(evidence)) >= 5),
  "inspectedBy" uuid NOT NULL REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ManufacturingQualityReview_order_latest_idx"
  ON public."ManufacturingQualityReview"("orderId","createdAt" DESC,id DESC);

CREATE OR REPLACE FUNCTION public.aa_manufacturing_quality_review_immutable()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Manufacturing quality reviews are append-only; corrections require a new review.';
END
$function$;

DROP TRIGGER IF EXISTS aa_manufacturing_quality_review_immutable ON public."ManufacturingQualityReview";
CREATE TRIGGER aa_manufacturing_quality_review_immutable
  BEFORE UPDATE OR DELETE ON public."ManufacturingQualityReview"
  FOR EACH ROW EXECUTE FUNCTION public.aa_manufacturing_quality_review_immutable();

COMMIT;
