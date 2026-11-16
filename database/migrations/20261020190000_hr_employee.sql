CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT PRIMARY KEY,
  "employeeCode" VARCHAR(40) NOT NULL UNIQUE,
  "fullName" VARCHAR(200) NOT NULL,
  "email" VARCHAR(254),
  "department" VARCHAR(120) NOT NULL,
  "designation" VARCHAR(120) NOT NULL,
  "joinedOn" DATE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK ("status" IN ('ACTIVE', 'OFFBOARDING', 'INACTIVE')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "Employee_status_idx"
ON "Employee" ("status");
