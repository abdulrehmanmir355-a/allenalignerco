BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS phone varchar(40) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "createdBy" uuid REFERENCES "HRUser"(id);
-- Keep every historical code and permanent ID. New codes use the existing sequence.
CREATE OR REPLACE FUNCTION aa_employee_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; candidate text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."permanentId" IS DISTINCT FROM OLD."permanentId" OR NEW."employeeCode" IS DISTINCT FROM OLD."employeeCode" THEN RAISE EXCEPTION 'Employee identity is permanent'; END IF;
  RETURN NEW;
 END IF;
 IF NEW."permanentId" IS NOT NULL THEN RAISE EXCEPTION 'Employee identity must be generated'; END IF;
 LOOP
  n:=nextval('aa_employee_number');
  candidate:='AA-EMP-'||CASE WHEN n<1000000 THEN lpad(n::text,6,'0') ELSE n::text END;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM "Employee" WHERE "employeeCode"=candidate OR "permanentId"=candidate) AND NOT EXISTS(SELECT 1 FROM "EmployeeIdentityLedger" WHERE number=candidate);
 END LOOP;
 NEW."permanentId":=candidate;
 -- All newly registered employees have one consistent code; callers cannot choose it.
 NEW."employeeCode":=candidate;
 INSERT INTO "EmployeeIdentityLedger"(number,"employeeId") VALUES(candidate,NEW.id);
 RETURN NEW;
END $$;
CREATE TABLE "EmployeeInvitation" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 "issuedBy" uuid NOT NULL REFERENCES "HRUser"(id), "issuedAt" timestamptz NOT NULL DEFAULT now(), "expiresAt" timestamptz NOT NULL,
 method text NOT NULL CHECK(method IN ('MANUAL','PRINTED','DIGITAL')),
 status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','HANDED_OVER','RECEIVED','CANCELLED')),
 "deliveredBy" uuid REFERENCES "HRUser"(id), "deliveredAt" timestamptz,
 "receivedBy" text, "receivedAt" timestamptz, "acknowledgementMethod" text,
 remarks varchar(1000) NOT NULL DEFAULT '', "activatedAt" timestamptz,
 "closedAt" timestamptz,
 CHECK(("deliveredAt" IS NULL)=("deliveredBy" IS NULL)),
 CHECK(("receivedAt" IS NULL)=("receivedBy" IS NULL))
);
CREATE UNIQUE INDEX employee_invitation_open ON "EmployeeInvitation"("employeeId") WHERE "closedAt" IS NULL;
CREATE INDEX employee_invitation_history ON "EmployeeInvitation"("employeeId","issuedAt" DESC);
CREATE TABLE "EmployeeIdentityEvent" (
 id bigserial PRIMARY KEY, "invitationId" uuid NOT NULL REFERENCES "EmployeeInvitation"(id),
 "actorId" text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_identity_event_invitation ON "EmployeeIdentityEvent"("invitationId",id);
CREATE TRIGGER identity_event_immutable BEFORE UPDATE OR DELETE ON "EmployeeIdentityEvent" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
CREATE OR REPLACE FUNCTION aa_employee_disable_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status<>'ACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
  DELETE FROM "WorkSession" WHERE "accountId" IN (SELECT id FROM "WorkAccount" WHERE "employeeId"=NEW.id);
  UPDATE "WorkAccount" SET "isActive"=false,"registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE "employeeId"=NEW.id;
  WITH revoked AS (UPDATE "EmployeeInvitation" SET status='CANCELLED',"closedAt"=now() WHERE "employeeId"=NEW.id AND "closedAt" IS NULL RETURNING id)
  INSERT INTO "EmployeeIdentityEvent"("invitationId","actorId",action,detail) SELECT id,'SYSTEM','employment.access_revoked',jsonb_build_object('status',NEW.status) FROM revoked;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_disable_access AFTER UPDATE OF status ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_disable_access();
ALTER TABLE "WorkReport" ADD COLUMN "workStartTime" time, ADD COLUMN "taskStatus" text NOT NULL DEFAULT 'IN_PROGRESS' CHECK("taskStatus" IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED')), ADD COLUMN blockers varchar(2000) NOT NULL DEFAULT '';
-- Repair the already-present asset screens against the actual text Employee key.
CREATE SEQUENCE IF NOT EXISTS aa_asset_number NO CYCLE;
CREATE TABLE IF NOT EXISTS "HRAssetIssue" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 "assetCode" text UNIQUE NOT NULL DEFAULT ('AA-ASSET-'||nextval('aa_asset_number')::text), "assetName" varchar(150) NOT NULL,
 "serialNumber" varchar(100), status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','RETURNED')),
 "issuedById" uuid REFERENCES "HRUser"(id), "issuedAt" timestamptz NOT NULL DEFAULT now(), "returnedById" uuid REFERENCES "HRUser"(id), "returnedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS hr_asset_employee ON "HRAssetIssue"("employeeId",status);
CREATE TABLE IF NOT EXISTS "HRAssetActivity"(id bigserial PRIMARY KEY,"assetId" uuid NOT NULL REFERENCES "HRAssetIssue"(id),"actorId" uuid REFERENCES "HRUser"(id),action text NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now());
COMMIT;
