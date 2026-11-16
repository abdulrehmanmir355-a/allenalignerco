BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF to_regclass('public."InventoryLocation"') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing inventory location migration first.';
  END IF;
END
$guard$;

ALTER TABLE public."InventoryLocation"
  ADD COLUMN IF NOT EXISTS "parentId" uuid,
  ADD COLUMN IF NOT EXISTS "locationLevel" varchar(12) NOT NULL DEFAULT 'BIN';

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."InventoryLocation"'::regclass AND conname='InventoryLocation_parent_fkey') THEN
    ALTER TABLE public."InventoryLocation"
      ADD CONSTRAINT "InventoryLocation_parent_fkey"
      FOREIGN KEY ("parentId") REFERENCES public."InventoryLocation"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."InventoryLocation"'::regclass AND conname='InventoryLocation_level_check') THEN
    ALTER TABLE public."InventoryLocation"
      ADD CONSTRAINT "InventoryLocation_level_check"
      CHECK ("locationLevel" IN ('WAREHOUSE','ZONE','RACK','BIN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."InventoryLocation"'::regclass AND conname='InventoryLocation_not_own_parent_check') THEN
    ALTER TABLE public."InventoryLocation"
      ADD CONSTRAINT "InventoryLocation_not_own_parent_check"
      CHECK ("parentId" IS DISTINCT FROM id);
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS "InventoryLocation_parent_level_idx"
  ON public."InventoryLocation"("parentId","locationLevel") WHERE active=true;

CREATE OR REPLACE FUNCTION public.aa_inventory_location_hierarchy_guard()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE parent_level text;
BEGIN
  IF NEW."parentId" IS NULL THEN
    IF NEW."locationLevel" IN ('ZONE','RACK') THEN
      RAISE EXCEPTION 'A zone must belong to a warehouse and a rack must belong to a zone.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "locationLevel" INTO parent_level
  FROM public."InventoryLocation"
  WHERE id=NEW."parentId" AND active=true
  FOR KEY SHARE;
  IF parent_level IS NULL THEN RAISE EXCEPTION 'Choose an active parent location.'; END IF;

  IF NOT ((NEW."locationLevel"='ZONE' AND parent_level='WAREHOUSE')
       OR (NEW."locationLevel"='RACK' AND parent_level='ZONE')
       OR (NEW."locationLevel"='BIN' AND parent_level='RACK')) THEN
    RAISE EXCEPTION 'Locations must follow Warehouse → Zone → Rack → Bin.';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS aa_inventory_location_hierarchy_guard ON public."InventoryLocation";
CREATE TRIGGER aa_inventory_location_hierarchy_guard
  BEFORE INSERT OR UPDATE OF "parentId","locationLevel","active"
  ON public."InventoryLocation"
  FOR EACH ROW EXECUTE FUNCTION public.aa_inventory_location_hierarchy_guard();

COMMIT;
