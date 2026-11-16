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
