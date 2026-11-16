-- Apply to the clinical application database.
CREATE TABLE IF NOT EXISTS public."DoctorPasswordRecoveryComplaint" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" text NOT NULL,
  "contactEmail" text NOT NULL,
  phone text,
  complaint text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CLOSED')),
  "doctorId" text REFERENCES public."Doctor"(id) ON DELETE SET NULL,
  "reviewedById" text,
  "reviewedByEmail" text,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS "DoctorPasswordRecoveryComplaint_queue_idx"
  ON public."DoctorPasswordRecoveryComplaint"(status, "createdAt" DESC);
