-- Apply to the clinical application database.
CREATE TABLE IF NOT EXISTS public."DoctorPasswordResetRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "doctorId" text NOT NULL REFERENCES public."Doctor"(id) ON DELETE CASCADE,
  "doctorName" text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  "reviewedById" text,
  "reviewedByEmail" text,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS "DoctorPasswordResetRequest_queue_idx"
  ON public."DoctorPasswordResetRequest"(status, "createdAt" DESC);
CREATE TABLE IF NOT EXISTS public."DoctorPasswordReset" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "doctorId" text NOT NULL REFERENCES public."Doctor"(id) ON DELETE CASCADE,
  "tokenHash" char(64) NOT NULL UNIQUE,
  "requestId" uuid NOT NULL REFERENCES public."DoctorPasswordResetRequest"(id),
  "issuedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "DoctorPasswordReset_pending_idx"
  ON public."DoctorPasswordReset"("doctorId", "expiresAt") WHERE "usedAt" IS NULL;
