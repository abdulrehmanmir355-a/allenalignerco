CREATE TABLE IF NOT EXISTS "OffboardingClearance" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "offboardingId" TEXT NOT NULL REFERENCES "EmployeeOffboarding"("id"),
  "department" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING','CLEARED','BLOCKED')),
  "remarks" TEXT,
  "clearedBy" TEXT,
  "clearedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("offboardingId", "department")
);

CREATE TABLE IF NOT EXISTS "OffboardingAsset" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "offboardingId" TEXT NOT NULL REFERENCES "EmployeeOffboarding"("id"),
  "assetName" VARCHAR(150) NOT NULL,
  "assetCode" VARCHAR(80),
  "returned" BOOLEAN NOT NULL DEFAULT FALSE,
  "returnedAt" TIMESTAMPTZ,
  "remarks" TEXT
);

CREATE INDEX IF NOT EXISTS "OffboardingAsset_offboarding_idx"
ON "OffboardingAsset" ("offboardingId");