BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ClinicProfile"
  ADD COLUMN IF NOT EXISTS "registrationAuthority" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "registrationNumber" VARCHAR(120) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicProfile_registration_identity_unique"
  ON "ClinicProfile" (LOWER(TRIM("registrationAuthority")), LOWER(TRIM("registrationNumber")))
  WHERE TRIM("registrationAuthority") <> '' AND TRIM("registrationNumber") <> '';

COMMIT;
