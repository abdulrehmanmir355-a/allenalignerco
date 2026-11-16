-- Allow shared clinic staff patient changes to be attributed in the patient audit trail.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "PatientHistory" ADD COLUMN "actorClinicUserId" UUID;
ALTER TABLE "PatientHistory" ADD CONSTRAINT "PatientHistory_actorClinicUserId_fkey"
  FOREIGN KEY ("actorClinicUserId") REFERENCES "ClinicUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "PatientHistory_actorClinicUserId_idx" ON "PatientHistory"("actorClinicUserId");
COMMIT;
