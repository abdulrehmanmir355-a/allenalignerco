BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "ManagementAudit" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "actorId" TEXT NOT NULL,
 "scope" TEXT NOT NULL, "action" TEXT NOT NULL, "recordId" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ManagementAudit_scope_time" ON "ManagementAudit"("scope","createdAt");
CREATE TABLE IF NOT EXISTS "EmployeeDocument" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" TEXT NOT NULL REFERENCES "Employee"("id"),
 "documentType" VARCHAR(30) NOT NULL CHECK ("documentType" IN ('CV','CNIC','CONTRACT','CERTIFICATE','OTHER')),
 "originalName" TEXT NOT NULL,"storageKey" TEXT NOT NULL UNIQUE,"mimeType" TEXT NOT NULL,
 "sizeBytes" BIGINT NOT NULL CHECK ("sizeBytes">0 AND "sizeBytes"<=10485760),"uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "HRDepartment" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"name" VARCHAR(120) NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS "HRDesignation" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"name" VARCHAR(120) NOT NULL UNIQUE);
INSERT INTO "HRDepartment" ("name") SELECT DISTINCT "department" FROM "Employee" ON CONFLICT DO NOTHING;
INSERT INTO "HRDesignation" ("name") SELECT DISTINCT "designation" FROM "Employee" ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "HRAttendance" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"employeeId" TEXT NOT NULL REFERENCES "Employee"("id"),
 "day" DATE NOT NULL,"status" TEXT NOT NULL CHECK ("status" IN ('PRESENT','ABSENT','REMOTE','HOLIDAY')),
 "recordedBy" UUID NOT NULL REFERENCES "HRUser"("id"), UNIQUE("employeeId","day")
);
CREATE TABLE IF NOT EXISTS "HRLeave" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"employeeId" TEXT NOT NULL REFERENCES "Employee"("id"),
 "startDate" DATE NOT NULL,"endDate" DATE NOT NULL CHECK ("endDate">="startDate"),"reason" VARCHAR(1000) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
 "reviewedBy" UUID REFERENCES "HRUser"("id"),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "HROnboarding" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"employeeId" TEXT NOT NULL REFERENCES "Employee"("id"),
 "task" VARCHAR(200) NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','COMPLETED')),
 "completedBy" UUID REFERENCES "HRUser"("id"),UNIQUE("employeeId","task")
);
CREATE TABLE IF NOT EXISTS "ClinicUser" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"clinicId" TEXT REFERENCES "Clinic"("id"),
 "fullName" VARCHAR(150) NOT NULL,"email" VARCHAR(254) NOT NULL,"passwordHash" TEXT NOT NULL,
 "requestedClinicName" VARCHAR(200),"role" TEXT NOT NULL DEFAULT 'CLINIC_VIEWER' CHECK ("role" IN ('CLINIC_ADMIN','CLINIC_STAFF','CLINIC_VIEWER')),
 "canAccessPatients" BOOLEAN NOT NULL DEFAULT FALSE,"isActive" BOOLEAN NOT NULL DEFAULT FALSE,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK (NOT "isActive" OR "clinicId" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicUser_email_lower" ON "ClinicUser"(LOWER("email"));
CREATE TABLE IF NOT EXISTS "ClinicSession" (
 "tokenHash" TEXT PRIMARY KEY,"userId" UUID NOT NULL REFERENCES "ClinicUser"("id") ON DELETE CASCADE,
 "expiresAt" TIMESTAMPTZ NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "ClinicProfile" (
 "clinicId" TEXT PRIMARY KEY REFERENCES "Clinic"("id"),"address" VARCHAR(500) NOT NULL DEFAULT '',
 "phone" VARCHAR(40) NOT NULL DEFAULT '',"email" VARCHAR(254) NOT NULL DEFAULT '',"timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi'
);
CREATE TABLE IF NOT EXISTS "ClinicStaff" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),
 "fullName" VARCHAR(150) NOT NULL,"email" VARCHAR(254) NOT NULL,"designation" VARCHAR(120) NOT NULL,
 "isActive" BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE("clinicId","email")
);
CREATE TABLE IF NOT EXISTS "ClinicAppointment" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),
 "patientId" TEXT NOT NULL REFERENCES "Patient"("id"),"doctorId" TEXT NOT NULL REFERENCES "Doctor"("id"),
 "startsAt" TIMESTAMPTZ NOT NULL,"status" TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK ("status" IN ('SCHEDULED','COMPLETED','CANCELLED')),
 "notes" VARCHAR(1000) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicAppointment_slot" ON "ClinicAppointment"("doctorId","startsAt") WHERE "status"='SCHEDULED';
CREATE TABLE IF NOT EXISTS "ClinicDocument" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),
 "name" VARCHAR(180) NOT NULL,"mime" TEXT NOT NULL,"data" BYTEA NOT NULL CHECK (octet_length("data") BETWEEN 1 AND 10485760),
 "uploadedBy" UUID NOT NULL REFERENCES "ClinicUser"("id"),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Existing non-empty employee emails were checked for duplicates before preparing this index.
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_email_normalized_unique" ON "Employee" (LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email)<>'';
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_id_clinic_unique" ON "Patient"(id,"clinicId");
CREATE UNIQUE INDEX IF NOT EXISTS "Doctor_id_clinic_unique" ON "Doctor"(id,"clinicId");
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClinicAppointment_patient_scope') THEN
  ALTER TABLE "ClinicAppointment" ADD CONSTRAINT "ClinicAppointment_patient_scope" FOREIGN KEY("patientId","clinicId") REFERENCES "Patient"(id,"clinicId");
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClinicAppointment_doctor_scope') THEN
  ALTER TABLE "ClinicAppointment" ADD CONSTRAINT "ClinicAppointment_doctor_scope" FOREIGN KEY("doctorId","clinicId") REFERENCES "Doctor"(id,"clinicId");
 END IF;
END $$;
COMMIT;
