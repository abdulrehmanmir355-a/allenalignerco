BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public."DoctorVerificationAudit"
  ADD COLUMN IF NOT EXISTS "actorHRId" uuid REFERENCES public."HRUser"(id) ON DELETE RESTRICT,
  ALTER COLUMN "actorOwnerId" DROP NOT NULL;

DO $actor_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."DoctorVerificationAudit"'::regclass AND conname='DoctorVerificationAudit_one_actor_check') THEN
    ALTER TABLE public."DoctorVerificationAudit"
      ADD CONSTRAINT "DoctorVerificationAudit_one_actor_check"
      CHECK (("actorOwnerId" IS NOT NULL)::int + ("actorHRId" IS NOT NULL)::int = 1);
  END IF;
END
$actor_check$;

CREATE INDEX IF NOT EXISTS "DoctorVerificationAudit_reviewer_time_idx"
  ON public."DoctorVerificationAudit"("actorHRId", "occurredAt" DESC, id DESC)
  WHERE "actorHRId" IS NOT NULL;

COMMIT;
