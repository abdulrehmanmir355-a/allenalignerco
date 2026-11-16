BEGIN;
SET LOCAL lock_timeout='10s';

-- Lab-to-Doctor direct communication threads.
-- Each LabAccess (one per case) can open threads to doctors by searching
-- for the doctor via name, ID, registration number, or internal code.
-- Threads are visible to clinical LEAD/ADMIN staff for oversight.

CREATE TABLE IF NOT EXISTS "LabDoctorThread" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId"    text NOT NULL REFERENCES "PortalCase"(id) ON DELETE RESTRICT,
  "doctorId"  text NOT NULL REFERENCES "Doctor"(id)     ON DELETE RESTRICT,
  subject     text NOT NULL CHECK(length(trim(subject)) BETWEEN 2 AND 200),
  status      text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  "createdAt" timestamp(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  "updatedAt" timestamp(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  UNIQUE("caseId","doctorId")   -- one active thread per case-doctor pair
);
CREATE INDEX IF NOT EXISTS "LabDoctorThread_doctor" ON "LabDoctorThread"("doctorId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "LabDoctorThread_case"   ON "LabDoctorThread"("caseId","createdAt" DESC);

-- Messages in each lab-doctor thread.
CREATE TABLE IF NOT EXISTS "LabDoctorMessage" (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId"   uuid NOT NULL REFERENCES "LabDoctorThread"(id) ON DELETE RESTRICT,
  "senderRole" text NOT NULL CHECK("senderRole" IN ('LAB','DOCTOR')),
  "senderId"   text NOT NULL,       -- doctorId for DOCTOR, caseId for LAB (identifies the LabAccess)
  "senderName" text NOT NULL CHECK(length(trim("senderName")) BETWEEN 1 AND 200),
  text         text NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 5000),
  "requestId"  uuid NOT NULL,       -- idempotency key
  "readByLab"  boolean NOT NULL DEFAULT FALSE,
  "readByDoctor" boolean NOT NULL DEFAULT FALSE,
  "createdAt"  timestamp(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC')
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabDoctorMessage_request_once"
  ON "LabDoctorMessage"("threadId","senderRole","senderId","requestId");
CREATE INDEX IF NOT EXISTS "LabDoctorMessage_thread_time"
  ON "LabDoctorMessage"("threadId","createdAt" DESC);

-- Immutability trigger: messages cannot be modified or deleted.
CREATE OR REPLACE FUNCTION aa_lab_doctor_message_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Lab-doctor messages are immutable';
  END IF;
  -- Serialize within thread to prevent createdAt collisions.
  PERFORM 1 FROM "LabDoctorThread" WHERE id = NEW."threadId" FOR UPDATE;
  NEW."createdAt" := greatest(
    (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3),
    (SELECT max("createdAt") + interval '1 millisecond'
       FROM "LabDoctorMessage" WHERE "threadId" = NEW."threadId")
  );
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_lab_doctor_message_guard ON "LabDoctorMessage";
CREATE TRIGGER aa_lab_doctor_message_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "LabDoctorMessage"
  FOR EACH ROW EXECUTE FUNCTION aa_lab_doctor_message_guard();

COMMIT;
