BEGIN;
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

CREATE TABLE IF NOT EXISTS "EmployeeOffboarding" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"("id"),
  "exitType" VARCHAR(30) NOT NULL
    CHECK ("exitType" IN ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END')),
  "reason" TEXT,
  "noticeDate" DATE,
  "lastWorkingDay" DATE NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'IN_PROGRESS', 'APPROVED', 'COMPLETED', 'CANCELLED')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeOffboarding_employee_idx"
ON "EmployeeOffboarding" ("employeeId");

COMMIT;
