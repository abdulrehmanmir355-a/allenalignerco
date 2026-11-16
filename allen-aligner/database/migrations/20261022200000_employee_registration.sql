BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "WorkAccount" ADD COLUMN "registrationTokenHash" text, ADD COLUMN "registrationExpiresAt" timestamptz;
ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_registration_pair" CHECK (("registrationTokenHash" IS NULL)=("registrationExpiresAt" IS NULL));
COMMIT;
