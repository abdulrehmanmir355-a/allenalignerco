BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "PatientHistory" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "clinicId" TEXT NOT NULL,
 "patientId" TEXT NOT NULL,
 "actorDoctorId" TEXT,
 "action" VARCHAR(20) NOT NULL,
 "revision" INTEGER NOT NULL,
 "before" JSONB,
 "after" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PatientHistory_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT "PatientHistory_actorDoctorId_fkey" FOREIGN KEY ("actorDoctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PatientHistory_patientId_revision_key" ON "PatientHistory"("patientId", "revision");
CREATE INDEX "PatientHistory_clinicId_patientId_createdAt_idx" ON "PatientHistory"("clinicId", "patientId", "createdAt");
COMMIT;
