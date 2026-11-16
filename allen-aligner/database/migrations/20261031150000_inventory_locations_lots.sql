BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF to_regclass('public."InventoryItem"') IS NULL
     OR to_regclass('public."InventoryMovement"') IS NULL
     OR to_regclass('public."InventoryStockState"') IS NULL THEN
    RAISE EXCEPTION 'Apply the existing inventory and stock-state migrations before this migration.';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public."InventoryCategory" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  "parentId" uuid REFERENCES public."InventoryCategory"(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public."InventoryLocation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'STORAGE'
    CHECK (kind IN ('STORAGE', 'CLINIC', 'CABINET', 'QUARANTINE', 'OTHER')),
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS public."InventorySupplier" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(60) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  email varchar(254),
  phone varchar(60),
  notes varchar(2000) NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(code)) > 0),
  CHECK (length(btrim(name)) > 0)
);

ALTER TABLE public."InventoryItem"
  ADD COLUMN IF NOT EXISTS "categoryId" uuid REFERENCES public."InventoryCategory"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "trackLot" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trackExpiry" boolean NOT NULL DEFAULT false;
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."InventoryItem"'::regclass
      AND conname = 'InventoryItem_expiry_requires_lot_check'
  ) THEN
    ALTER TABLE public."InventoryItem"
      ADD CONSTRAINT "InventoryItem_expiry_requires_lot_check"
      CHECK (NOT "trackExpiry" OR "trackLot");
  END IF;
END
$constraint$;

CREATE TABLE IF NOT EXISTS public."InventoryLot" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  "lotNumber" varchar(120) NOT NULL,
  "lotNumberNormalized" varchar(120) GENERATED ALWAYS AS (upper(btrim("lotNumber"))) STORED,
  "expiresOn" date,
  "supplierId" uuid REFERENCES public."InventorySupplier"(id) ON DELETE RESTRICT,
  "supplierReference" varchar(200) NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, "itemId"),
  UNIQUE ("itemId", "lotNumberNormalized"),
  CHECK (length(btrim("lotNumber")) > 0)
);
CREATE INDEX IF NOT EXISTS "InventoryLot_expiry_idx"
  ON public."InventoryLot"("expiresOn") WHERE "expiresOn" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."InventoryLocationBalance" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" uuid NOT NULL REFERENCES public."InventoryItem"(id) ON DELETE RESTRICT,
  "locationId" uuid NOT NULL REFERENCES public."InventoryLocation"(id) ON DELETE RESTRICT,
  "lotId" uuid,
  state varchar(12) NOT NULL
    CHECK (state IN ('AVAILABLE','RESERVED','QUARANTINE','REJECTED','ISSUED','RETURNED')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity BETWEEN 0 AND 1000000000),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT ("itemId", "locationId", "lotId", state),
  FOREIGN KEY ("lotId", "itemId")
    REFERENCES public."InventoryLot"(id, "itemId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "InventoryLocationBalance_location_item_idx"
  ON public."InventoryLocationBalance"("locationId", "itemId", state);

ALTER TABLE public."InventoryMovement"
  ADD COLUMN IF NOT EXISTS "locationId" uuid REFERENCES public."InventoryLocation"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS "lotId" uuid,
  ADD COLUMN IF NOT EXISTS "transferId" uuid;
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public."InventoryMovement"'::regclass
      AND conname = 'InventoryMovement_lot_item_fk'
  ) THEN
    ALTER TABLE public."InventoryMovement"
      ADD CONSTRAINT "InventoryMovement_lot_item_fk"
      FOREIGN KEY ("lotId", "itemId")
      REFERENCES public."InventoryLot"(id, "itemId") ON DELETE RESTRICT;
  END IF;
END
$constraint$;
CREATE INDEX IF NOT EXISTS "InventoryMovement_location_time_idx"
  ON public."InventoryMovement"("locationId", "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS "InventoryMovement_transfer_idx"
  ON public."InventoryMovement"("transferId") WHERE "transferId" IS NOT NULL;

-- Keep existing balances intact and represent them at one default location.
INSERT INTO public."InventoryLocation" (code, name, kind)
VALUES ('MAIN', 'Main Store', 'STORAGE')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public."InventoryLocationBalance" ("itemId", "locationId", state, quantity)
SELECT s."itemId", l.id, s.state, s.quantity
FROM public."InventoryStockState" s
CROSS JOIN public."InventoryLocation" l
WHERE l.code = 'MAIN'
ON CONFLICT ("itemId", "locationId", "lotId", state) DO NOTHING;

COMMENT ON TABLE public."InventoryLocationBalance" IS
  'Current stock by item, location, lot, and operational state. Update in the same transaction as a ledger movement.';
COMMENT ON COLUMN public."InventoryMovement"."locationId" IS
  'Nullable for historical movements created before location tracking was introduced.';

COMMIT;

