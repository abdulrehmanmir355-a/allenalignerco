BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SEQUENCE IF NOT EXISTS aa_employee_number AS bigint NO CYCLE;
CREATE TABLE IF NOT EXISTS "EmployeeIdentityLedger" (
 "number" text PRIMARY KEY, "employeeId" text NOT NULL UNIQUE, "issuedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "permanentId" text;
CREATE OR REPLACE FUNCTION aa_employee_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
 IF TG_OP='UPDATE' AND OLD."permanentId" IS NOT NULL AND (NEW."permanentId" IS DISTINCT FROM OLD."permanentId" OR NEW.id<>OLD.id) THEN
  RAISE EXCEPTION 'Employee identity is permanent';
 END IF;
 IF NEW."permanentId" IS NULL THEN
  n := nextval('aa_employee_number');
  NEW."permanentId" := 'AA-EMP-' || CASE WHEN n<1000000 THEN lpad(n::text,6,'0') ELSE n::text END;
  INSERT INTO "EmployeeIdentityLedger" ("number","employeeId") VALUES(NEW."permanentId",NEW.id);
 ELSIF TG_OP='INSERT' THEN RAISE EXCEPTION 'Employee identity must be generated';
 END IF;
 IF TG_OP='INSERT' AND NEW."employeeCode"='' THEN NEW."employeeCode":=NEW."permanentId"; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_employee_identity ON "Employee";
CREATE TRIGGER aa_employee_identity BEFORE INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_identity();
UPDATE "Employee" SET "permanentId"=NULL WHERE "permanentId" IS NULL;
ALTER TABLE "Employee" ALTER COLUMN "permanentId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_permanentId_unique" ON "Employee"("permanentId");
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"Employee"'::regclass AND conname='Employee_permanentId_unique') THEN
  ALTER TABLE "Employee" ADD CONSTRAINT "Employee_permanentId_unique" UNIQUE USING INDEX "Employee_permanentId_unique";
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS "WorkAccount" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL UNIQUE REFERENCES "Employee"(id),
 "passwordHash" text, role text NOT NULL DEFAULT 'EMPLOYEE' CHECK(role IN ('EMPLOYEE','MANAGER')),
 "isActive" boolean NOT NULL DEFAULT false, "mustChangePassword" boolean NOT NULL DEFAULT true,
 CHECK(NOT "isActive" OR "passwordHash" IS NOT NULL)
);
CREATE OR REPLACE FUNCTION aa_employee_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO "WorkAccount"("employeeId") VALUES(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS aa_employee_account ON "Employee";
CREATE TRIGGER aa_employee_account AFTER INSERT ON "Employee" FOR EACH ROW EXECUTE FUNCTION aa_employee_account();
INSERT INTO "WorkAccount"("employeeId") SELECT id FROM "Employee" ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "WorkSession" (
 "tokenHash" text PRIMARY KEY, "accountId" uuid NOT NULL REFERENCES "WorkAccount"(id), "expiresAt" timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS "WorkAssignment" (
 "employeeId" text PRIMARY KEY REFERENCES "Employee"(id), "managerId" uuid REFERENCES "WorkAccount"(id),
 "workingDays" int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5] CHECK("workingDays" <@ ARRAY[0,1,2,3,4,5,6]),
 "effectiveFrom" date NOT NULL DEFAULT CURRENT_DATE
);
INSERT INTO "WorkAssignment"("employeeId") SELECT id FROM "Employee" ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "WorkSchedule" (
 "employeeId" text NOT NULL REFERENCES "Employee"(id), "effectiveFrom" date NOT NULL,
 "workingDays" int[] NOT NULL CHECK("workingDays" <@ ARRAY[0,1,2,3,4,5,6]),
 PRIMARY KEY("employeeId","effectiveFrom")
);
INSERT INTO "WorkSchedule"("employeeId","effectiveFrom","workingDays") SELECT "employeeId","effectiveFrom","workingDays" FROM "WorkAssignment" ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "WorkHRGrant" (
 "userId" uuid NOT NULL REFERENCES "HRUser"(id), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 "canEvaluate" boolean NOT NULL DEFAULT false, PRIMARY KEY("userId","employeeId")
);
CREATE TABLE IF NOT EXISTS "WorkPolicy" (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), timezone text NOT NULL DEFAULT 'Asia/Karachi',
 "dueHour" int NOT NULL DEFAULT 18 CHECK("dueHour" BETWEEN 0 AND 23),
 "escalationHours" int NOT NULL DEFAULT 24 CHECK("escalationHours" BETWEEN 1 AND 720),
 "startDate" date NOT NULL DEFAULT CURRENT_DATE,
 "retentionPolicy" text NOT NULL DEFAULT 'Retain history; deletion requires a separately authorized retention procedure.'
);
INSERT INTO "WorkPolicy"(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "WorkHoliday" (day date PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS "WorkTask" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 title varchar(200) NOT NULL, description varchar(4000) NOT NULL DEFAULT '', "dueDate" date,
 "assignedBy" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE(id,"employeeId")
);
CREATE TABLE IF NOT EXISTS "WorkReport" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 "reportingDate" date NOT NULL, department text NOT NULL, "taskId" uuid,
 "workDescription" varchar(4000) NOT NULL, "workCompleted" varchar(4000) NOT NULL DEFAULT '',
 "pendingWork" varchar(4000) NOT NULL DEFAULT '', "timeSpent" int NOT NULL CHECK("timeSpent" BETWEEN 1 AND 1440),
 remarks varchar(2000) NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'DRAFT'
 CHECK(status IN ('DRAFT','SUBMITTED','REVIEWED','APPROVED','REVISION_REQUESTED')),
 revision int NOT NULL DEFAULT 1 CHECK(revision>0), "previousId" uuid UNIQUE REFERENCES "WorkReport"(id),
 "submittedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("employeeId","reportingDate",revision), FOREIGN KEY("taskId","employeeId") REFERENCES "WorkTask"(id,"employeeId")
);
CREATE TABLE IF NOT EXISTS "WorkAudit" (
 id bigserial PRIMARY KEY, "recordId" uuid, "actorId" text NOT NULL, action text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION aa_work_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Historical record is immutable'; END $$;
DROP TRIGGER IF EXISTS aa_identity_ledger_immutable ON "EmployeeIdentityLedger";
CREATE TRIGGER aa_identity_ledger_immutable BEFORE UPDATE OR DELETE ON "EmployeeIdentityLedger" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
DROP TRIGGER IF EXISTS aa_work_audit_immutable ON "WorkAudit";
CREATE TRIGGER aa_work_audit_immutable BEFORE UPDATE OR DELETE ON "WorkAudit" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
CREATE OR REPLACE FUNCTION aa_work_report_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Work history cannot be deleted'; END IF;
 IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Approved report is immutable'; END IF;
 IF NEW."employeeId"<>OLD."employeeId" OR NEW."reportingDate"<>OLD."reportingDate" OR NEW.revision<>OLD.revision OR NEW."previousId" IS DISTINCT FROM OLD."previousId" THEN RAISE EXCEPTION 'Report identity is immutable'; END IF;
 IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Use an audited revision'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='DRAFT' AND NEW.status='SUBMITTED') OR (OLD.status='SUBMITTED' AND NEW.status IN ('REVIEWED','REVISION_REQUESTED')) OR (OLD.status='REVIEWED' AND NEW.status IN ('APPROVED','REVISION_REQUESTED'))) THEN RAISE EXCEPTION 'Invalid report transition'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aa_work_report_guard ON "WorkReport";
CREATE TRIGGER aa_work_report_guard BEFORE UPDATE OR DELETE ON "WorkReport" FOR EACH ROW EXECUTE FUNCTION aa_work_report_guard();
CREATE TABLE IF NOT EXISTS "WorkNotification" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "recipientId" text NOT NULL, "employeeId" text NOT NULL REFERENCES "Employee"(id),
 day date NOT NULL, kind text NOT NULL, message text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE("recipientId","employeeId",day,kind)
);
CREATE TABLE IF NOT EXISTS "WorkKPI" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), designation text NOT NULL, name varchar(200) NOT NULL,
 description varchar(2000) NOT NULL, weight numeric NOT NULL CHECK(weight>0 AND weight<=100),
 "isActive" boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS "WorkEvaluation" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "employeeId" text NOT NULL REFERENCES "Employee"(id),
 "periodStart" date NOT NULL, "periodEnd" date NOT NULL CHECK("periodEnd">="periodStart"),
 scores jsonb NOT NULL, commentary varchar(4000) NOT NULL, "evaluatedBy" text NOT NULL,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS aa_work_evaluation_immutable ON "WorkEvaluation";
CREATE TRIGGER aa_work_evaluation_immutable BEFORE UPDATE OR DELETE ON "WorkEvaluation" FOR EACH ROW EXECUTE FUNCTION aa_work_immutable();
CREATE INDEX IF NOT EXISTS work_report_employee_date ON "WorkReport"("employeeId","reportingDate");
CREATE INDEX IF NOT EXISTS work_notification_recipient ON "WorkNotification"("recipientId","createdAt");

CREATE OR REPLACE FUNCTION aa_missing_work(at_time timestamptz DEFAULT now())
RETURNS TABLE("employeeId" text,day date,"dueAt" timestamptz,"managerId" uuid,"accountId" uuid,"permanentId" text) LANGUAGE sql STABLE AS $$
 SELECT e.id,d::date,((d::date+p."dueHour"*interval '1 hour') AT TIME ZONE p.timezone),a."managerId",ac.id,e."permanentId"
 FROM "Employee" e CROSS JOIN "WorkPolicy" p
 LEFT JOIN "WorkAssignment" a ON a."employeeId"=e.id
 JOIN "WorkAccount" ac ON ac."employeeId"=e.id
 CROSS JOIN LATERAL generate_series(GREATEST(p."startDate",COALESCE((SELECT min(s."effectiveFrom") FROM "WorkSchedule" s WHERE s."employeeId"=e.id),a."effectiveFrom",e."createdAt"::date),COALESCE(e."joinedOn",p."startDate"))::timestamp,(at_time AT TIME ZONE p.timezone)::date::timestamp,interval '1 day') d
 WHERE e.status='ACTIVE' AND extract(dow FROM d)::int=ANY(COALESCE((SELECT s."workingDays" FROM "WorkSchedule" s WHERE s."employeeId"=e.id AND s."effectiveFrom"<=d::date ORDER BY s."effectiveFrom" DESC LIMIT 1),a."workingDays",ARRAY[1,2,3,4,5]))
 AND ((d::date+p."dueHour"*interval '1 hour') AT TIME ZONE p.timezone)<=at_time
 AND NOT EXISTS(SELECT 1 FROM "WorkHoliday" h WHERE h.day=d::date)
 AND NOT EXISTS(SELECT 1 FROM "HRAttendance" h WHERE h."employeeId"=e.id AND h.day=d::date AND h.status='HOLIDAY')
 AND NOT EXISTS(SELECT 1 FROM "HRLeave" l WHERE l."employeeId"=e.id AND l.status='APPROVED' AND d::date BETWEEN l."startDate" AND l."endDate")
 AND NOT EXISTS(SELECT 1 FROM "WorkReport" r WHERE r."employeeId"=e.id AND r."reportingDate"=d::date AND r."submittedAt" IS NOT NULL)
$$;
CREATE OR REPLACE FUNCTION aa_send_work_reminders(at_time timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer; m integer;
BEGIN
 INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
 SELECT "accountId"::text,"employeeId",day,'MISSING','Daily work report missing for '||day::text FROM aa_missing_work(at_time) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO "WorkNotification"("recipientId","employeeId",day,kind,message)
 SELECT m."managerId"::text,m."employeeId",m.day,'OVERDUE','Overdue report: '||m."permanentId"||' for '||m.day::text FROM aa_missing_work(at_time) m CROSS JOIN "WorkPolicy" p WHERE m."managerId" IS NOT NULL AND m."dueAt"+p."escalationHours"*interval '1 hour'<=at_time ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS m=ROW_COUNT;RETURN n+m;
END $$;
COMMIT;
