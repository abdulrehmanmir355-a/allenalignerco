BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "InventoryStockState" (
  "itemId" uuid NOT NULL REFERENCES "InventoryItem"(id) ON DELETE RESTRICT,
  state varchar(12) NOT NULL CHECK (state IN ('AVAILABLE','RESERVED','QUARANTINE','REJECTED','ISSUED','RETURNED')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity BETWEEN 0 AND 1000000000),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("itemId", state)
);

-- Preserve the live legacy balance as Available stock. Historical movements stay untouched.
INSERT INTO "InventoryStockState" ("itemId", state, quantity)
SELECT i.id, s.state, CASE WHEN s.state = 'AVAILABLE' THEN i."onHand" ELSE 0 END
FROM "InventoryItem" i
CROSS JOIN (VALUES ('AVAILABLE'),('RESERVED'),('QUARANTINE'),('REJECTED'),('ISSUED'),('RETURNED')) AS s(state)
ON CONFLICT ("itemId", state) DO NOTHING;

ALTER TABLE "InventoryMovement" ALTER COLUMN kind TYPE varchar(24);
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "fromState" varchar(12);
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "toState" varchar(12);
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_kind_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_kind_check"
  CHECK (kind IN ('RECEIVE','ISSUE','RESERVE','UNRESERVE','QUARANTINE','RELEASE','REJECT','RETURN','RESTOCK','RETURN_QUARANTINE'));
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_fromState_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromState_check"
  CHECK ("fromState" IS NULL OR "fromState" IN ('AVAILABLE','RESERVED','QUARANTINE','REJECTED','ISSUED','RETURNED'));
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_toState_check";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toState_check"
  CHECK ("toState" IS NULL OR "toState" IN ('AVAILABLE','RESERVED','QUARANTINE','REJECTED','ISSUED','RETURNED'));

COMMIT;
