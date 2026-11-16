BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "Supplier" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyName" varchar(200) NOT NULL,
  "contactName" varchar(200) NOT NULL DEFAULT '',
  email varchar(254) NOT NULL DEFAULT '',
  phone varchar(40) NOT NULL DEFAULT '',
  category varchar(100) NOT NULL DEFAULT '',
  "paymentTerms" varchar(120) NOT NULL DEFAULT '',
  address varchar(500) NOT NULL DEFAULT '',
  notes varchar(2000) NOT NULL DEFAULT '',
  status varchar(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  "createdBy" uuid REFERENCES "HRUser"(id),
  "updatedBy" uuid REFERENCES "HRUser"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim("companyName")) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_companyName_normalized_unique"
  ON "Supplier" (lower(trim("companyName")));
CREATE INDEX IF NOT EXISTS "Supplier_status_name_idx" ON "Supplier" (status, "companyName");

CREATE TABLE IF NOT EXISTS "SupplierAudit" (
  id bigserial PRIMARY KEY,
  "supplierId" uuid NOT NULL REFERENCES "Supplier"(id),
  "actorId" uuid NOT NULL REFERENCES "HRUser"(id),
  action varchar(30) NOT NULL CHECK (action IN ('CREATED','UPDATED','ACTIVATED','DEACTIVATED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SupplierAudit_supplier_time_idx" ON "SupplierAudit" ("supplierId", "createdAt" DESC);

COMMIT;
