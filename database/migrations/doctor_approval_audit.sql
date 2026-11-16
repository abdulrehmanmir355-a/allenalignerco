-- Allen Aligner / Module 02
-- Review and back up database before applying.
-- NOT executed by the PowerShell installer.

CREATE TABLE IF NOT EXISTS "DoctorApprovalAudit" (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    action TEXT NOT NULL
        CHECK (action IN ('DOCTOR_APPROVED')),
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    "DoctorApprovalAudit_doctorId_idx"
ON "DoctorApprovalAudit" ("doctorId");
