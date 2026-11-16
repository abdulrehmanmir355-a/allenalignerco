CREATE TABLE IF NOT EXISTS "OffboardingSettlement" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "offboardingId" TEXT NOT NULL UNIQUE
    REFERENCES "EmployeeOffboarding"("id"),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
  "salaryDue" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "leaveEncashment" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "otherPayments" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "deductions" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "netPayable" NUMERIC(14,2) GENERATED ALWAYS AS
    ("salaryDue" + "leaveEncashment" +
     "otherPayments" - "deductions") STORED,
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK ("status" IN ('DRAFT','APPROVED','PAID')),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "remarks" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "settlement_nonnegative" CHECK (
    "salaryDue" >= 0 AND
    "leaveEncashment" >= 0 AND
    "otherPayments" >= 0 AND
    "deductions" >= 0
  )
);
