-- Track who submitted specialist-generated case files while keeping existing
-- uploads attributed to their original doctor by default.
ALTER TABLE "LargeUploadSession"
  ADD COLUMN IF NOT EXISTS "uploadedByRole" TEXT NOT NULL DEFAULT 'DOCTOR',
  ADD COLUMN IF NOT EXISTS "uploadedByLabel" TEXT NOT NULL DEFAULT 'Doctor';

ALTER TABLE "LargeClinicalFile"
  ADD COLUMN IF NOT EXISTS "uploadedByRole" TEXT NOT NULL DEFAULT 'DOCTOR',
  ADD COLUMN IF NOT EXISTS "uploadedByLabel" TEXT NOT NULL DEFAULT 'Doctor';

ALTER TABLE "LargeClinicalFile"
  ALTER COLUMN "uploadedByDoctorId" DROP NOT NULL;
