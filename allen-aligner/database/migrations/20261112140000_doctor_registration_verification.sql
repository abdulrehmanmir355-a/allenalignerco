BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public."Doctor"
  ADD COLUMN IF NOT EXISTS "registrationAuthority" varchar(160);

CREATE TABLE IF NOT EXISTS public."DoctorVerificationAudit" (
  id bigserial PRIMARY KEY,
  "actorOwnerId" text NOT NULL,
  "doctorId" text NOT NULL REFERENCES public."Doctor"(id) ON DELETE RESTRICT,
  action varchar(16) NOT NULL CHECK (action IN ('VERIFIED','REJECTED')),
  "evidenceMethod" varchar(100) NOT NULL,
  note varchar(2000) NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim("evidenceMethod")) >= 3),
  CHECK (length(btrim(note)) >= 5)
);

CREATE INDEX IF NOT EXISTS "DoctorVerificationAudit_doctor_time_idx"
  ON public."DoctorVerificationAudit"("doctorId", "occurredAt" DESC, id DESC);

COMMIT;
