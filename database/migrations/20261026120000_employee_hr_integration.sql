-- Employee/HR integration repair for the existing PostgreSQL installation.
-- Apply only after a verified backup. This is intentionally repeatable and does not
-- replay older migrations, re-key employees, reset sequences, or fabricate people.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(204026, 120000);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Employee','EmployeeIdentityLedger','HRUser','HRSession','WorkAccount','WorkSession','WorkAssignment','WorkSchedule','WorkHRGrant','WorkTask','WorkReport','WorkEvaluation','WorkNotification','WorkAudit','EmployeeOffboarding','OffboardingClearance','OffboardingAsset','OffboardingSettlement','HRDepartment','HRDesignation','HRAttendance','HRLeave','HROnboarding','EmployeeDocument','ManagementAudit'] LOOP
    IF to_regclass(format('%I',t)) IS NULL THEN
      RAISE EXCEPTION 'Employee integration prerequisite is missing: %. Restore/apply its reviewed base schema before continuing.',t;
    END IF;
  END LOOP;
END $$;
LOCK TABLE "Employee", "EmployeeIdentityLedger", "HRUser", "HRDepartment", "HRDesignation" IN SHARE ROW EXCLUSIVE MODE;

-- Validate identity and required master data before any employee backfill.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "Employee" WHERE id IS NULL OR btrim(id)='' OR "permanentId" IS NULL OR btrim("permanentId")='';
  IF n>0 THEN RAISE EXCEPTION '% employees have missing internal/permanent IDs. Resolve these records explicitly; no existing identity will be guessed or replaced.',n; END IF;
  SELECT count(*) INTO n FROM (SELECT id FROM "Employee" GROUP BY id HAVING count(*)>1) s;
  IF n>0 THEN RAISE EXCEPTION '% duplicate Employee.id groups require explicit reconciliation; no rows were merged.',n; END IF;
  SELECT count(*) INTO n FROM (SELECT "permanentId" FROM "Employee" GROUP BY "permanentId" HAVING count(*)>1) s;
  IF n>0 THEN RAISE EXCEPTION '% duplicate permanent ID groups require explicit reconciliation.',n; END IF;
  SELECT count(*) INTO n FROM (SELECT "employeeCode" FROM "Employee" WHERE "employeeCode" IS NOT NULL AND btrim("employeeCode")<>'' GROUP BY "employeeCode" HAVING count(*)>1) s;
  IF n>0 THEN RAISE EXCEPTION '% duplicate populated employee code groups require explicit reconciliation.',n; END IF;
  SELECT count(*) INTO n FROM "Employee" a JOIN "Employee" b ON a."employeeCode"=b."permanentId" AND a.id<>b.id;
  IF n>0 THEN RAISE EXCEPTION '% employee code/permanent ID collisions span different employees. Resolve them explicitly before migration.',n; END IF;
  SELECT count(*) INTO n FROM "Employee" WHERE email IS NULL OR btrim(email)='' OR "joinedOn" IS NULL OR "fullName" IS NULL OR btrim("fullName")='' OR department IS NULL OR btrim(department)='' OR designation IS NULL OR btrim(designation)='';
  IF n>0 THEN RAISE EXCEPTION '% employees lack required name/email/department/designation/joining date. Complete their real data before migration.',n; END IF;
  SELECT count(*) INTO n FROM (SELECT lower(btrim(email)) FROM "Employee" GROUP BY lower(btrim(email)) HAVING count(*)>1) s;
  IF n>0 THEN RAISE EXCEPTION '% duplicate normalized employee email groups require explicit reconciliation.',n; END IF;
  SELECT count(*) INTO n FROM "EmployeeIdentityLedger" l LEFT JOIN "Employee" e ON e.id=l."employeeId" WHERE e.id IS NULL OR e."permanentId" IS DISTINCT FROM l.number;
  IF n>0 THEN RAISE EXCEPTION '% identity ledger rows are orphaned or disagree with their employee permanent ID. Resolve the historical mismatch; the ledger will not be rewritten.',n; END IF;
  SELECT count(*) INTO n FROM "Employee" e JOIN "EmployeeIdentityLedger" l ON l.number=e."permanentId" WHERE l."employeeId"<>e.id;
  IF n>0 THEN RAISE EXCEPTION '% employee permanent IDs are reserved for another employee in the identity ledger.',n; END IF;
END $$;

ALTER TABLE "Employee"
  ALTER COLUMN id SET DEFAULT (gen_random_uuid()::text),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN "permanentId" SET NOT NULL,
  ALTER COLUMN "employeeCode" SET DEFAULT '',
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN "joinedOn" SET NOT NULL,
  ADD COLUMN IF NOT EXISTS phone varchar(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdBy" uuid,
  ADD COLUMN IF NOT EXISTS "departmentId" uuid,
  ADD COLUMN IF NOT EXISTS "designationId" uuid;
ALTER TABLE "WorkAccount"
  ADD COLUMN IF NOT EXISTS "registrationTokenHash" text,
  ADD COLUMN IF NOT EXISTS "registrationExpiresAt" timestamptz;
ALTER TABLE "WorkReport"
  ADD COLUMN IF NOT EXISTS "workStartTime" time,
  ADD COLUMN IF NOT EXISTS "taskStatus" text NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN IF NOT EXISTS blockers varchar(2000) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "EmployeeProfileHistory" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL,
  "oldFullName" text NOT NULL, "newFullName" text NOT NULL,
  "oldEmail" text NOT NULL, "newEmail" text NOT NULL,
  "oldStatus" text NOT NULL, "newStatus" text NOT NULL,
  "changedBy" text NOT NULL, "changedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "EmployeePositionHistory" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL,
  "previousDepartment" text NOT NULL, "newDepartment" text NOT NULL,
  "previousDesignation" text NOT NULL, "newDesignation" text NOT NULL,
  "effectiveDate" date NOT NULL, reason text NOT NULL, "approvalReference" text NOT NULL,
  "changedBy" text NOT NULL, "changedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "EmployeeProfileHistory" ADD COLUMN IF NOT EXISTS "changedByHrUserId" uuid;
ALTER TABLE "EmployeePositionHistory" ADD COLUMN IF NOT EXISTS "changedByHrUserId" uuid;
ALTER TABLE "OffboardingClearance" ADD COLUMN IF NOT EXISTS "clearedByHrUserId" uuid;
ALTER TABLE "OffboardingSettlement" ADD COLUMN IF NOT EXISTS "approvedByHrUserId" uuid;
ALTER TABLE "ManagementAudit"
  ADD COLUMN IF NOT EXISTS "employeeId" text,
  ADD COLUMN IF NOT EXISTS "hrActorId" uuid,
  ADD COLUMN IF NOT EXISTS detail jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "EmployeeRegistrationRequest" (
  "requestId" uuid PRIMARY KEY, "employeeId" text NOT NULL,
  "actorId" uuid NOT NULL, "payloadHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "EmployeeInvitation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL,
  "issuedBy" uuid NOT NULL, "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL, method text NOT NULL CHECK(method IN ('MANUAL','PRINTED','DIGITAL')),
  status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','HANDED_OVER','RECEIVED','CANCELLED')),
  "deliveredBy" uuid, "deliveredAt" timestamptz, "receivedBy" text, "receivedAt" timestamptz,
  "acknowledgementMethod" text, remarks varchar(1000) NOT NULL DEFAULT '',
  "activatedAt" timestamptz, "closedAt" timestamptz,
  CHECK(("deliveredAt" IS NULL)=("deliveredBy" IS NULL)),
  CHECK(("receivedAt" IS NULL)=("receivedBy" IS NULL))
);
CREATE TABLE IF NOT EXISTS "EmployeeIdentityEvent" (
  id bigserial PRIMARY KEY, "invitationId" uuid NOT NULL,
  "actorId" text NOT NULL, action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE IF NOT EXISTS aa_asset_number NO CYCLE;
CREATE TABLE IF NOT EXISTS "HRAssetIssue" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL,
  "assetCode" text NOT NULL UNIQUE DEFAULT ('AA-ASSET-'||nextval('aa_asset_number')::text),
  "assetName" varchar(150) NOT NULL, "serialNumber" varchar(100),
  status text NOT NULL DEFAULT 'ISSUED' CHECK(status IN ('ISSUED','RETURNED')),
  "issuedById" uuid, "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "returnedById" uuid, "returnedAt" timestamptz
);
CREATE TABLE IF NOT EXISTS "HRAssetActivity" (
  id bigserial PRIMARY KEY, "assetId" uuid NOT NULL, "actorId" uuid,
  action text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Add real existing lookup names using exact equality only. No names are guessed.
INSERT INTO "HRDepartment" (name) SELECT DISTINCT department FROM "Employee" ON CONFLICT(name) DO NOTHING;
INSERT INTO "HRDesignation" (name) SELECT DISTINCT designation FROM "Employee" ON CONFLICT(name) DO NOTHING;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM "Employee" e LEFT JOIN "HRDepartment" d ON d.id=e."departmentId" WHERE e."departmentId" IS NOT NULL AND (d.id IS NULL OR d.name<>e.department)) THEN
    RAISE EXCEPTION 'Employee.departmentId disagrees with its preserved department name. Resolve the explicit mapping before migration.';
  END IF;
  IF EXISTS(SELECT 1 FROM "Employee" e LEFT JOIN "HRDesignation" d ON d.id=e."designationId" WHERE e."designationId" IS NOT NULL AND (d.id IS NULL OR d.name<>e.designation)) THEN
    RAISE EXCEPTION 'Employee.designationId disagrees with its preserved designation name. Resolve the explicit mapping before migration.';
  END IF;
END $$;
UPDATE "Employee" e SET "departmentId"=d.id FROM "HRDepartment" d WHERE e."departmentId" IS NULL AND d.name=e.department;
UPDATE "Employee" e SET "designationId"=d.id FROM "HRDesignation" d WHERE e."designationId" IS NULL AND d.name=e.designation;
ALTER TABLE "Employee" ALTER COLUMN "departmentId" SET NOT NULL, ALTER COLUMN "designationId" SET NOT NULL;

-- Add typed actor links alongside historical text instead of casting or guessing it.
UPDATE "EmployeeProfileHistory" t SET "changedByHrUserId"=h.id FROM "HRUser" h WHERE t."changedByHrUserId" IS NULL AND t."changedBy"=h.id::text;
UPDATE "EmployeePositionHistory" t SET "changedByHrUserId"=h.id FROM "HRUser" h WHERE t."changedByHrUserId" IS NULL AND t."changedBy"=h.id::text;
UPDATE "OffboardingClearance" t SET "clearedByHrUserId"=h.id FROM "HRUser" h WHERE t."clearedByHrUserId" IS NULL AND t."clearedBy"=h.id::text;
UPDATE "OffboardingSettlement" t SET "approvedByHrUserId"=h.id FROM "HRUser" h WHERE t."approvedByHrUserId" IS NULL AND t."approvedBy"=h.id::text;
UPDATE "ManagementAudit" t SET "hrActorId"=h.id FROM "HRUser" h WHERE t."hrActorId" IS NULL AND t."actorId"=h.id::text AND t.scope='HR';
UPDATE "ManagementAudit" t SET "employeeId"=e.id FROM "Employee" e WHERE t."employeeId" IS NULL AND t.scope='HR' AND t.action IN ('employees.save','employees.create','employees.update','employee.create','employee.update') AND t."recordId"=e.id;

-- Constraint helper also performs an actionable orphan preflight. Only additive
-- constraints are installed; existing equivalent constraints are retained.
CREATE OR REPLACE FUNCTION pg_temp.aa_employee_fk(child regclass, constraint_name text, child_columns text[], parent regclass, parent_columns text[], deferred boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ck smallint[]; pk smallint[]; joins text; populated text; child_list text; parent_list text; n bigint;
BEGIN
  IF array_length(child_columns,1) IS DISTINCT FROM array_length(parent_columns,1) THEN RAISE EXCEPTION 'Invalid foreign-key column specification'; END IF;
  SELECT array_agg(a.attnum ORDER BY s.i),string_agg(format('%I',s.col),', ' ORDER BY s.i),string_agg(format('c.%I IS NOT NULL',s.col),' AND ' ORDER BY s.i)
    INTO ck,child_list,populated FROM unnest(child_columns) WITH ORDINALITY s(col,i) JOIN pg_attribute a ON a.attrelid=child AND a.attname=s.col AND NOT a.attisdropped;
  SELECT array_agg(a.attnum ORDER BY s.i),string_agg(format('%I',s.col),', ' ORDER BY s.i)
    INTO pk,parent_list FROM unnest(parent_columns) WITH ORDINALITY s(col,i) JOIN pg_attribute a ON a.attrelid=parent AND a.attname=s.col AND NOT a.attisdropped;
  IF cardinality(ck)<>cardinality(child_columns) OR cardinality(pk)<>cardinality(parent_columns) THEN RAISE EXCEPTION 'Missing foreign-key columns for % -> %',child,parent; END IF;
  SELECT string_agg(format('p.%I=c.%I',parent_columns[i],child_columns[i]),' AND ' ORDER BY i) INTO joins FROM generate_subscripts(child_columns,1) s(i);
  EXECUTE format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS(SELECT 1 FROM %s p WHERE %s)',child,populated,parent,joins) INTO n;
  IF n>0 THEN RAISE EXCEPTION '% orphan rows in %.% cannot reference %.%. Resolve the original records explicitly; migration did not delete or merge them.',n,child,child_list,parent,parent_list; END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=child AND conname=constraint_name AND NOT(contype='f' AND confrelid=parent AND conkey=ck AND confkey=pk)) THEN
    RAISE EXCEPTION 'Constraint % on % has an unexpected definition; inspect it before migration.',constraint_name,child;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=child AND contype='f' AND confrelid=parent AND conkey=ck AND confkey=pk) THEN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %s (%s) ON DELETE RESTRICT ON UPDATE RESTRICT %s NOT VALID',child,constraint_name,child_list,parent,parent_list,CASE WHEN deferred THEN 'DEFERRABLE INITIALLY DEFERRED' ELSE '' END);
  END IF;
  FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid=child AND contype='f' AND confrelid=parent AND conkey=ck AND confkey=pk AND NOT convalidated LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',child,constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Employee_id_permanentId_unique" ON "Employee" (id,"permanentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_permanentId_unique" ON "Employee" ("permanentId");
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"Employee"'::regclass AND contype='p') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pkey" PRIMARY KEY(id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "HRDepartment_id_name_unique" ON "HRDepartment" (id,name);
CREATE UNIQUE INDEX IF NOT EXISTS "HRDesignation_id_name_unique" ON "HRDesignation" (id,name);
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_email_normalized_unique" ON "Employee" (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email)<>'';
INSERT INTO "EmployeeIdentityLedger" (number,"employeeId") SELECT e."permanentId",e.id FROM "Employee" e WHERE NOT EXISTS(SELECT 1 FROM "EmployeeIdentityLedger" l WHERE l."employeeId"=e.id);
SELECT pg_temp.aa_employee_fk('"EmployeeIdentityLedger"','EmployeeIdentityLedger_employee_identity_fkey',ARRAY['employeeId','number'],'"Employee"',ARRAY['id','permanentId'],true);
SELECT pg_temp.aa_employee_fk('"Employee"','Employee_createdBy_fkey',ARRAY['createdBy'],'"HRUser"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"Employee"','Employee_departmentId_fkey',ARRAY['departmentId'],'"HRDepartment"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"Employee"','Employee_designationId_fkey',ARRAY['designationId'],'"HRDesignation"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"Employee"','Employee_department_name_fkey',ARRAY['departmentId','department'],'"HRDepartment"',ARRAY['id','name']);
SELECT pg_temp.aa_employee_fk('"Employee"','Employee_designation_name_fkey',ARRAY['designationId','designation'],'"HRDesignation"',ARRAY['id','name']);

DO $$
DECLARE t text; r record;
BEGIN
  FOREACH t IN ARRAY ARRAY['EmployeeDocument','EmployeeOffboarding','EmployeeProfileHistory','EmployeePositionHistory','HRAttendance','HRLeave','HROnboarding','WorkAccount','WorkAssignment','WorkSchedule','WorkHRGrant','WorkTask','WorkReport','WorkEvaluation','WorkNotification','EmployeeRegistrationRequest','EmployeeInvitation','HRAssetIssue'] LOOP
    PERFORM pg_temp.aa_employee_fk(format('%I',t)::regclass,t||'_employeeId_fkey',ARRAY['employeeId'],'"Employee"',ARRAY['id']);
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('EmployeeProfileHistory','changedByHrUserId'),('EmployeePositionHistory','changedByHrUserId'),
    ('OffboardingClearance','clearedByHrUserId'),('OffboardingSettlement','approvedByHrUserId'),
    ('ManagementAudit','hrActorId'),('EmployeeRegistrationRequest','actorId'),
    ('EmployeeInvitation','issuedBy'),('EmployeeInvitation','deliveredBy'),
    ('HRAssetIssue','issuedById'),('HRAssetIssue','returnedById'),('HRAssetActivity','actorId'),
    ('HRAttendance','recordedBy'),('HRLeave','reviewedBy'),('HROnboarding','completedBy'),('WorkHRGrant','userId')
  ) a(tab,col) LOOP
    PERFORM pg_temp.aa_employee_fk(format('%I',r.tab)::regclass,r.tab||'_'||r.col||'_fkey',ARRAY[r.col],'"HRUser"',ARRAY['id']);
  END LOOP;
END $$;
SELECT pg_temp.aa_employee_fk('"ManagementAudit"','ManagementAudit_employeeId_fkey',ARRAY['employeeId'],'"Employee"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"EmployeeIdentityEvent"','EmployeeIdentityEvent_invitationId_fkey',ARRAY['invitationId'],'"EmployeeInvitation"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"HRAssetActivity"','HRAssetActivity_assetId_fkey',ARRAY['assetId'],'"HRAssetIssue"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"OffboardingClearance"','OffboardingClearance_offboardingId_fkey',ARRAY['offboardingId'],'"EmployeeOffboarding"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"OffboardingAsset"','OffboardingAsset_offboardingId_fkey',ARRAY['offboardingId'],'"EmployeeOffboarding"',ARRAY['id']);
SELECT pg_temp.aa_employee_fk('"OffboardingSettlement"','OffboardingSettlement_offboardingId_fkey',ARRAY['offboardingId'],'"EmployeeOffboarding"',ARRAY['id']);

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"Employee"'::regclass AND conname='Employee_required_master_fields') THEN
    ALTER TABLE "Employee" ADD CONSTRAINT "Employee_required_master_fields" CHECK(btrim(id)<>'' AND btrim("employeeCode")<>'' AND btrim("permanentId")<>'' AND btrim("fullName")<>'' AND btrim(email)<>'' AND btrim(department)<>'' AND btrim(designation)<>'') NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"WorkAccount"'::regclass AND conname='WorkAccount_registration_pair') THEN
    ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_registration_pair" CHECK(("registrationTokenHash" IS NULL)=("registrationExpiresAt" IS NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"WorkReport"'::regclass AND conname='WorkReport_taskStatus_check') THEN
    ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_taskStatus_check" CHECK("taskStatus" IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED')) NOT VALID;
  END IF;
END $$;

-- Preserve the monotonically advancing sequence; only extend output padding.
DO $$
BEGIN
  IF (SELECT last_value FROM aa_employee_number)>999999999999 THEN
    RAISE EXCEPTION 'Employee number sequence exceeds the 12-digit allocation range. Review capacity before migration; sequence was not reset.';
  END IF;
END $$;
ALTER SEQUENCE aa_employee_number MAXVALUE 999999999999 NO CYCLE;
CREATE OR REPLACE FUNCTION aa_employee_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint; candidate text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW."permanentId" IS DISTINCT FROM OLD."permanentId" OR (NEW."employeeCode" IS DISTINCT FROM OLD."employeeCode" AND OLD."employeeCode" IS NOT NULL AND btrim(OLD."employeeCode")<>'') THEN
      RAISE EXCEPTION 'Employee identity is permanent' USING ERRCODE='23514';
    END IF;
    IF OLD."employeeCode" IS NOT NULL AND btrim(OLD."employeeCode")<>'' THEN RETURN NEW; END IF;
    IF NEW."employeeCode" IS NOT NULL AND btrim(NEW."employeeCode")<>'' THEN
      RAISE EXCEPTION 'Missing employee codes must be generated by the database' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.id IS NULL OR btrim(NEW.id)='' THEN RAISE EXCEPTION 'Employee internal ID is required' USING ERRCODE='23514'; END IF;
    IF NEW."permanentId" IS NOT NULL OR (NEW."employeeCode" IS NOT NULL AND btrim(NEW."employeeCode")<>'') THEN
      RAISE EXCEPTION 'Employee code and permanent ID must be generated by the database' USING ERRCODE='23514';
    END IF;
  END IF;
  LOOP
    n:=nextval('aa_employee_number');
    candidate:='AA-EMP-'||lpad(n::text,12,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM "Employee" WHERE "employeeCode"=candidate OR "permanentId"=candidate)
      AND NOT EXISTS(SELECT 1 FROM "EmployeeIdentityLedger" WHERE number=candidate);
  END LOOP;
  NEW."employeeCode":=candidate;
  IF TG_OP='INSERT' THEN
    NEW."permanentId":=candidate;
    INSERT INTO "EmployeeIdentityLedger" (number,"employeeId") VALUES(candidate,NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_employee_identity ON "Employee";
CREATE TRIGGER aa_employee_identity BEFORE INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_identity();
-- Generate only absent codes; every populated legacy identity remains unchanged.
UPDATE "Employee" SET "employeeCode"="employeeCode" WHERE "employeeCode" IS NULL OR btrim("employeeCode")='';
ALTER TABLE "Employee" ALTER COLUMN "employeeCode" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_employeeCode_key" ON "Employee" ("employeeCode");
ALTER TABLE "Employee" VALIDATE CONSTRAINT "Employee_required_master_fields";
ALTER TABLE "WorkAccount" VALIDATE CONSTRAINT "WorkAccount_registration_pair";
ALTER TABLE "WorkReport" VALIDATE CONSTRAINT "WorkReport_taskStatus_check";

CREATE OR REPLACE FUNCTION aa_employee_lookup_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chosen uuid; label text;
BEGIN
  IF TG_OP='INSERT' OR NEW.department IS DISTINCT FROM OLD.department OR NEW."departmentId" IS DISTINCT FROM OLD."departmentId" THEN
    IF TG_OP='INSERT' OR NEW.department IS DISTINCT FROM OLD.department THEN
      SELECT id INTO chosen FROM "HRDepartment" WHERE name=NEW.department;
      IF chosen IS NULL THEN RAISE EXCEPTION 'Choose an existing exact department name' USING ERRCODE='23503'; END IF;
      IF TG_OP='INSERT' AND NEW."departmentId" IS NOT NULL AND NEW."departmentId"<>chosen THEN RAISE EXCEPTION 'Department ID does not match its name' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND NEW."departmentId" IS DISTINCT FROM OLD."departmentId" AND NEW."departmentId" IS DISTINCT FROM chosen THEN RAISE EXCEPTION 'Department ID does not match its name' USING ERRCODE='23514'; END IF;
      NEW."departmentId":=chosen;
    ELSE
      SELECT name INTO label FROM "HRDepartment" WHERE id=NEW."departmentId";
      IF label IS NULL THEN RAISE EXCEPTION 'Choose an existing department ID' USING ERRCODE='23503'; END IF;
      NEW.department:=label;
    END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.designation IS DISTINCT FROM OLD.designation OR NEW."designationId" IS DISTINCT FROM OLD."designationId" THEN
    IF TG_OP='INSERT' OR NEW.designation IS DISTINCT FROM OLD.designation THEN
      SELECT id INTO chosen FROM "HRDesignation" WHERE name=NEW.designation;
      IF chosen IS NULL THEN RAISE EXCEPTION 'Choose an existing exact designation name' USING ERRCODE='23503'; END IF;
      IF TG_OP='INSERT' AND NEW."designationId" IS NOT NULL AND NEW."designationId"<>chosen THEN RAISE EXCEPTION 'Designation ID does not match its name' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND NEW."designationId" IS DISTINCT FROM OLD."designationId" AND NEW."designationId" IS DISTINCT FROM chosen THEN RAISE EXCEPTION 'Designation ID does not match its name' USING ERRCODE='23514'; END IF;
      NEW."designationId":=chosen;
    ELSE
      SELECT name INTO label FROM "HRDesignation" WHERE id=NEW."designationId";
      IF label IS NULL THEN RAISE EXCEPTION 'Choose an existing designation ID' USING ERRCODE='23503'; END IF;
      NEW.designation:=label;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_employee_lookup_links ON "Employee";
CREATE TRIGGER aa_employee_lookup_links BEFORE INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_lookup_links();
CREATE OR REPLACE FUNCTION aa_employee_timestamps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Employee creation date is immutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'updatedAt') THEN NEW."updatedAt":=now(); ELSE NEW."updatedAt":=OLD."updatedAt"; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_employee_timestamps ON "Employee";
CREATE TRIGGER aa_employee_timestamps BEFORE UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_timestamps();

-- Preserve existing accounts; never activate one or create assignments/schedules.
CREATE OR REPLACE FUNCTION aa_employee_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO "WorkAccount" ("employeeId") VALUES(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS aa_employee_account ON "Employee";
CREATE TRIGGER aa_employee_account AFTER INSERT ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_account();

CREATE OR REPLACE FUNCTION aa_work_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical record is immutable'; END $$;
DROP TRIGGER IF EXISTS aa_identity_ledger_immutable ON "EmployeeIdentityLedger";
CREATE TRIGGER aa_identity_ledger_immutable BEFORE UPDATE OR DELETE ON "EmployeeIdentityLedger" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
DROP TRIGGER IF EXISTS identity_event_immutable ON "EmployeeIdentityEvent";
CREATE TRIGGER identity_event_immutable BEFORE UPDATE OR DELETE ON "EmployeeIdentityEvent" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
DROP TRIGGER IF EXISTS employee_registration_request_immutable ON "EmployeeRegistrationRequest";
CREATE TRIGGER employee_registration_request_immutable BEFORE UPDATE OR DELETE ON "EmployeeRegistrationRequest" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();

CREATE OR REPLACE FUNCTION aa_employee_disable_access() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'ACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM "WorkSession" WHERE "accountId" IN (SELECT id FROM "WorkAccount" WHERE "employeeId"=NEW.id);
    UPDATE "WorkAccount" SET "isActive"=false,"registrationTokenHash"=NULL,"registrationExpiresAt"=NULL WHERE "employeeId"=NEW.id;
    WITH revoked AS (UPDATE "EmployeeInvitation" SET status='CANCELLED',"closedAt"=now() WHERE "employeeId"=NEW.id AND "closedAt" IS NULL RETURNING id)
    INSERT INTO "EmployeeIdentityEvent" ("invitationId","actorId",action,detail)
      SELECT id,'SYSTEM','employment.access_revoked',jsonb_build_object('status',NEW.status) FROM revoked;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS employee_disable_access ON "Employee";
CREATE TRIGGER employee_disable_access AFTER UPDATE OF status ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_disable_access();

CREATE UNIQUE INDEX IF NOT EXISTS employee_invitation_open ON "EmployeeInvitation" ("employeeId") WHERE "closedAt" IS NULL;
CREATE INDEX IF NOT EXISTS employee_invitation_history ON "EmployeeInvitation" ("employeeId","issuedAt" DESC);
CREATE INDEX IF NOT EXISTS employee_identity_event_invitation ON "EmployeeIdentityEvent" ("invitationId",id);
CREATE INDEX IF NOT EXISTS employee_profile_history_idx ON "EmployeeProfileHistory" ("employeeId","changedAt" DESC);
CREATE INDEX IF NOT EXISTS employee_position_history_idx ON "EmployeePositionHistory" ("employeeId","changedAt" DESC);
CREATE INDEX IF NOT EXISTS employee_registration_employee_idx ON "EmployeeRegistrationRequest" ("employeeId","createdAt");
CREATE INDEX IF NOT EXISTS management_audit_employee_time ON "ManagementAudit" ("employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS hr_asset_employee ON "HRAssetIssue" ("employeeId",status);
CREATE INDEX IF NOT EXISTS "Employee_departmentId_idx" ON "Employee" ("departmentId");
CREATE INDEX IF NOT EXISTS "Employee_designationId_idx" ON "Employee" ("designationId");
COMMIT;
