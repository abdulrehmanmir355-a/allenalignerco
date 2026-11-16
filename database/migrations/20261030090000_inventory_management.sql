BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS "InventoryItem" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sku varchar(80) NOT NULL UNIQUE,
 name varchar(200) NOT NULL,
 unit varchar(40) NOT NULL,
 "reorderLevel" integer NOT NULL DEFAULT 0 CHECK ("reorderLevel" BETWEEN 0 AND 1000000000),
 "onHand" integer NOT NULL DEFAULT 0 CHECK ("onHand" BETWEEN 0 AND 1000000000),
 "createdBy" uuid NOT NULL REFERENCES "HRUser"(id),
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "itemId" uuid NOT NULL REFERENCES "InventoryItem"(id),
 "requestId" uuid NOT NULL UNIQUE,
 kind varchar(10) NOT NULL CHECK (kind IN ('RECEIVE','ISSUE')),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000000000),
 "balanceAfter" integer NOT NULL CHECK ("balanceAfter" BETWEEN 0 AND 1000000000),
 reference varchar(200) NOT NULL DEFAULT '',
 note varchar(2000) NOT NULL,
 "actorId" uuid NOT NULL REFERENCES "HRUser"(id),
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "InventoryMovement_item_time_idx" ON "InventoryMovement"("itemId","createdAt" DESC);
COMMIT;
