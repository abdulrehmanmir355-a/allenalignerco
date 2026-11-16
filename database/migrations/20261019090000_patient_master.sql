-- Additive Module 04 migration. Existing references are intentionally not backfilled.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- AlterTable
ALTER TABLE "PortalCase" ADD COLUMN     "patientId" TEXT;

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientCode" VARCHAR(40) NOT NULL,
    "fullName" VARCHAR(200) NOT NULL,
    "normalizedName" VARCHAR(200) NOT NULL,
    "dateOfBirth" DATE,
    "phone" VARCHAR(40),
    "normalizedPhone" VARCHAR(40),
    "email" VARCHAR(254),
    "normalizedEmail" VARCHAR(254),
    "clinicalNotes" TEXT,
    "medicalHistory" TEXT,
    "dentalHistory" TEXT,
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Patient_clinicId_normalizedName_dateOfBirth_idx" ON "Patient"("clinicId", "normalizedName", "dateOfBirth");

-- CreateIndex
CREATE INDEX "Patient_clinicId_normalizedPhone_idx" ON "Patient"("clinicId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "Patient_clinicId_normalizedEmail_idx" ON "Patient"("clinicId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "Patient_clinicId_archivedAt_createdAt_idx" ON "Patient"("clinicId", "archivedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_patientCode_key" ON "Patient"("clinicId", "patientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_clinicId_id_key" ON "Patient"("clinicId", "id");

-- CreateIndex
CREATE INDEX "PortalCase_clinicId_patientId_idx" ON "PortalCase"("clinicId", "patientId");

-- AddForeignKey
ALTER TABLE "PortalCase" ADD CONSTRAINT "PortalCase_clinicId_patientId_fkey" FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
