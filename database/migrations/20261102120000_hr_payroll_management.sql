-- Payroll storage for salary profiles, monthly draft calculations, and audit history.
-- This migration is additive and does not create payments or approve payroll.
CREATE TABLE IF NOT EXISTS "HRPayrollSalary" (
  "employeeId" text PRIMARY KEY REFERENCES "Employee"(id) ON DELETE RESTRICT,
  "basic" numeric(14,2) NOT NULL CHECK ("basic" > 0),
  "allowance" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("allowance" >= 0),
  "deduction" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("deduction" >= 0),
  "effectiveFrom" date NOT NULL,
  "updatedBy" text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("deduction" <= "basic" + "allowance")
);

CREATE TABLE IF NOT EXISTS "HRPayrollSalaryHistory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" text NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT,
  "oldBasic" numeric(14,2),
  "newBasic" numeric(14,2) NOT NULL CHECK ("newBasic" > 0),
  "oldAllowance" numeric(14,2),
  "newAllowance" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("newAllowance" >= 0),
  "oldDeduction" numeric(14,2),
  "newDeduction" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("newDeduction" >= 0),
  "effectiveFrom" date NOT NULL,
  "reason" text NOT NULL CHECK (length(trim("reason")) BETWEEN 5 AND 500),
  "changedBy" text NOT NULL,
  "changedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("newDeduction" <= "newBasic" + "newAllowance")
);

CREATE INDEX IF NOT EXISTS "HRPayrollSalaryHistory_employee_changedAt_idx"
  ON "HRPayrollSalaryHistory" ("employeeId", "changedAt" DESC);

CREATE TABLE IF NOT EXISTS "HRPayrollDraft" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" text NOT NULL REFERENCES "Employee"(id) ON DELETE RESTRICT,
  "period" date NOT NULL CHECK (extract(day FROM "period") = 1),
  "basic" numeric(14,2) NOT NULL CHECK ("basic" > 0),
  "allowance" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("allowance" >= 0),
  "deduction" numeric(14,2) NOT NULL DEFAULT 0 CHECK ("deduction" >= 0),
  "gross" numeric(14,2) GENERATED ALWAYS AS ("basic" + "allowance") STORED,
  "net" numeric(14,2) GENERATED ALWAYS AS ("basic" + "allowance" - "deduction") STORED,
  "status" text NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','APPROVED','PAID')),
  "createdBy" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "approvedBy" text,
  "approvedAt" timestamptz,
  "paidBy" text,
  "paidAt" timestamptz,
  "paymentMethod" text,
  "paymentReference" text,
  CHECK (("status" = 'DRAFT' AND "approvedAt" IS NULL AND "paidAt" IS NULL)
      OR ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "paidAt" IS NULL)
      OR ("status" = 'PAID' AND "approvedAt" IS NOT NULL AND "paidAt" IS NOT NULL
          AND length(trim(coalesce("paymentReference",''))) >= 3
          AND "paymentMethod" IS NOT NULL
          AND "paymentMethod" IN ('BANK_TRANSFER','CASH','CHEQUE','OTHER'))),
  UNIQUE ("employeeId", "period"),
  CHECK ("deduction" <= "basic" + "allowance")
);

CREATE INDEX IF NOT EXISTS "HRPayrollDraft_period_employee_idx"
  ON "HRPayrollDraft" ("period", "employeeId");

CREATE TABLE IF NOT EXISTS "HRPayrollDraftAudit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "draftId" uuid NOT NULL REFERENCES "HRPayrollDraft"(id) ON DELETE RESTRICT,
  "action" text NOT NULL CHECK ("action" IN ('DRAFT_GENERATED','DRAFT_APPROVED','PAYMENT_RECORDED')),
  "actorId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "HRPayrollDraftAudit_draft_createdAt_idx"
  ON "HRPayrollDraftAudit" ("draftId", "createdAt" DESC);
