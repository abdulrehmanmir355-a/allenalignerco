-- Targeted invitation infrastructure only. No employee IDs or credentials are changed.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(204026,190000);

ALTER TABLE "WorkAccount" ADD COLUMN IF NOT EXISTS "registrationTokenHash" text,
  ADD COLUMN IF NOT EXISTS "registrationExpiresAt" timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"WorkAccount"'::regclass AND conname='WorkAccount_registration_pair') THEN
    ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_registration_pair"
      CHECK (("registrationTokenHash" IS NULL)=("registrationExpiresAt" IS NULL)) NOT VALID;
  END IF;
END $$;
ALTER TABLE "WorkAccount" VALIDATE CONSTRAINT "WorkAccount_registration_pair";

CREATE TABLE IF NOT EXISTS "EmployeeInvitation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
  "issuedBy" uuid NOT NULL REFERENCES "HRUser"(id), "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL, method text NOT NULL CHECK(method IN ('MANUAL','PRINTED','DIGITAL')),
  status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','HANDED_OVER','RECEIVED','CANCELLED')),
  "deliveredBy" uuid REFERENCES "HRUser"(id), "deliveredAt" timestamptz,
  "receivedBy" text, "receivedAt" timestamptz, "acknowledgementMethod" text,
  remarks varchar(1000) NOT NULL DEFAULT '', "activatedAt" timestamptz, "closedAt" timestamptz,
  CHECK (("deliveredAt" IS NULL)=("deliveredBy" IS NULL)),
  CHECK (("receivedAt" IS NULL)=("receivedBy" IS NULL))
);
ALTER TABLE "EmployeeInvitation" ADD COLUMN IF NOT EXISTS "intendedEmail" text;
CREATE UNIQUE INDEX IF NOT EXISTS employee_invitation_open ON "EmployeeInvitation"("employeeId") WHERE "closedAt" IS NULL;
CREATE INDEX IF NOT EXISTS employee_invitation_history ON "EmployeeInvitation"("employeeId","issuedAt" DESC,id DESC);
CREATE TABLE IF NOT EXISTS "EmployeeIdentityEvent" (
  id bigserial PRIMARY KEY, "invitationId" uuid NOT NULL REFERENCES "EmployeeInvitation"(id),
  "actorId" text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_identity_event_invitation ON "EmployeeIdentityEvent"("invitationId",id);
CREATE OR REPLACE FUNCTION aa_invitation_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invitation audit history is immutable'; END $$;
DROP TRIGGER IF EXISTS identity_event_immutable ON "EmployeeIdentityEvent";
CREATE TRIGGER identity_event_immutable BEFORE UPDATE OR DELETE ON "EmployeeIdentityEvent"
  FOR EACH ROW EXECUTE FUNCTION aa_invitation_audit_immutable();

-- Do not silently accept or fabricate metadata for untracked historical codes.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "WorkAccount" w WHERE w."registrationTokenHash" IS NOT NULL AND
    NOT EXISTS (SELECT 1 FROM "EmployeeInvitation" i WHERE i."employeeId"=w."employeeId" AND i."closedAt" IS NULL AND i."expiresAt"=w."registrationExpiresAt")) THEN
    RAISE EXCEPTION 'Untracked existing invitations require explicit review before migration.';
  END IF;
END $$;

-- Employment status changes immediately invalidate pending codes and employee sessions.
CREATE OR REPLACE FUNCTION aa_employee_disable_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'ACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM "WorkSession" WHERE "accountId" IN (SELECT id FROM "WorkAccount" WHERE "employeeId"=NEW.id);
    UPDATE "WorkAccount" SET "isActive"=false,"registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE "employeeId"=NEW.id;
    WITH revoked AS (UPDATE "EmployeeInvitation" SET status='CANCELLED',"closedAt"=clock_timestamp()
      WHERE "employeeId"=NEW.id AND "closedAt" IS NULL RETURNING id)
    INSERT INTO "EmployeeIdentityEvent"("invitationId","actorId",action,detail)
      SELECT id,'SYSTEM','employment.access_revoked',jsonb_build_object('status',NEW.status) FROM revoked;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS employee_disable_access ON "Employee";
CREATE TRIGGER employee_disable_access AFTER UPDATE OF status ON "Employee"
  FOR EACH ROW EXECUTE FUNCTION aa_employee_disable_access();
COMMIT;
