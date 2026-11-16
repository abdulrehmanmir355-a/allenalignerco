BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS "ClinicInvitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT,
  "createdBy" UUID NOT NULL REFERENCES "ClinicUser"("id") ON DELETE RESTRICT,
  "fullName" VARCHAR(150) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER','DOCTOR')),
  "canAccessPatients" BOOLEAN NOT NULL DEFAULT FALSE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "acceptedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ClinicInvitation_clinicId_createdAt_idx"
  ON "ClinicInvitation"("clinicId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicInvitation_open_email_key"
  ON "ClinicInvitation"(LOWER("email"))
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

COMMIT;
