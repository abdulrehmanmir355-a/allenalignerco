BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "WorkAccount" ADD COLUMN "clinicalRequest" jsonb;
ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_clinicalRequest_object" CHECK ("clinicalRequest" IS NULL OR jsonb_typeof("clinicalRequest")='object');
COMMIT;
