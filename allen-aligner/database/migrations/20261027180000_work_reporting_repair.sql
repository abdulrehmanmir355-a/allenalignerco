-- Restore missing daily-work tracking and employee asset-register structures.
-- Additive only: existing employee, task, report and identity rows are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(204026, 271800);

DO $$
DECLARE missing text[];
BEGIN
  SELECT array_agg(required.name)
    INTO missing
  FROM unnest(ARRAY[
    'Employee', 'WorkAccount', 'WorkAssignment', 'WorkSchedule',
    'WorkPolicy', 'WorkHoliday', 'WorkReport', 'WorkTask',
    'HRAttendance', 'HRLeave', 'HRUser'
  ]) AS required(name)
  WHERE to_regclass(format('public.%I', required.name)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Work tracking repair stopped; required existing tables are missing: %', array_to_string(missing, ', ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Employee' AND column_name='permanentId')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Employee' AND column_name='joinedOn')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='WorkReport' AND column_name='submittedAt') THEN
    RAISE EXCEPTION 'Work tracking repair stopped; required employee/report columns are missing.';
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.aa_asset_number AS bigint NO CYCLE;
CREATE TABLE IF NOT EXISTS public."HRAssetIssue" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" text NOT NULL REFERENCES public."Employee"(id),
  "assetCode" text NOT NULL UNIQUE DEFAULT ('AA-ASSET-' || nextval('public.aa_asset_number')::text),
  "assetName" varchar(150) NOT NULL,
  "serialNumber" varchar(100),
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','RETURNED')),
  "issuedById" uuid REFERENCES public."HRUser"(id),
  "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "returnedById" uuid REFERENCES public."HRUser"(id),
  "returnedAt" timestamptz
);
CREATE TABLE IF NOT EXISTS public."HRAssetActivity" (
  id bigserial PRIMARY KEY,
  "assetId" uuid NOT NULL REFERENCES public."HRAssetIssue"(id),
  "actorId" uuid REFERENCES public."HRUser"(id),
  action text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hr_asset_employee
  ON public."HRAssetIssue"("employeeId", status);

CREATE OR REPLACE FUNCTION public.aa_missing_work(at_time timestamptz DEFAULT now())
RETURNS TABLE(
  "employeeId" text,
  day date,
  "dueAt" timestamptz,
  "managerId" uuid,
  "accountId" uuid,
  "permanentId" text
)
LANGUAGE sql STABLE AS $$
  SELECT e.id,
         d::date,
         ((d::date + p."dueHour" * interval '1 hour') AT TIME ZONE p.timezone),
         a."managerId",
         ac.id,
         e."permanentId"
  FROM public."Employee" e
  CROSS JOIN public."WorkPolicy" p
  LEFT JOIN public."WorkAssignment" a ON a."employeeId"=e.id
  JOIN public."WorkAccount" ac ON ac."employeeId"=e.id
  CROSS JOIN LATERAL generate_series(
    GREATEST(
      p."startDate",
      COALESCE(
        (SELECT min(s."effectiveFrom") FROM public."WorkSchedule" s WHERE s."employeeId"=e.id),
        a."effectiveFrom",
        e."createdAt"::date
      ),
      COALESCE(e."joinedOn", p."startDate")
    )::timestamp,
    (at_time AT TIME ZONE p.timezone)::date::timestamp,
    interval '1 day'
  ) d
  WHERE e.status='ACTIVE'
    AND extract(dow FROM d)::int = ANY(COALESCE(
      (SELECT s."workingDays"
       FROM public."WorkSchedule" s
       WHERE s."employeeId"=e.id AND s."effectiveFrom"<=d::date
       ORDER BY s."effectiveFrom" DESC LIMIT 1),
      a."workingDays",
      ARRAY[1,2,3,4,5]
    ))
    AND ((d::date + p."dueHour" * interval '1 hour') AT TIME ZONE p.timezone) <= at_time
    AND NOT EXISTS (SELECT 1 FROM public."WorkHoliday" h WHERE h.day=d::date)
    AND NOT EXISTS (SELECT 1 FROM public."HRAttendance" h WHERE h."employeeId"=e.id AND h.day=d::date AND h.status='HOLIDAY')
    AND NOT EXISTS (SELECT 1 FROM public."HRLeave" l WHERE l."employeeId"=e.id AND l.status='APPROVED' AND d::date BETWEEN l."startDate" AND l."endDate")
    AND NOT EXISTS (SELECT 1 FROM public."WorkReport" r WHERE r."employeeId"=e.id AND r."reportingDate"=d::date AND r."submittedAt" IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.aa_send_work_reminders(at_time timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  employee_count integer;
  manager_count integer;
BEGIN
  INSERT INTO public."WorkNotification"("recipientId","employeeId",day,kind,message)
  SELECT "accountId"::text,"employeeId",day,'MISSING',
         'Daily work report missing for ' || day::text
  FROM public.aa_missing_work(at_time)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS employee_count = ROW_COUNT;

  INSERT INTO public."WorkNotification"("recipientId","employeeId",day,kind,message)
  SELECT missing."managerId"::text,missing."employeeId",missing.day,'OVERDUE',
         'Overdue report: ' || missing."permanentId" || ' for ' || missing.day::text
  FROM public.aa_missing_work(at_time) AS missing
  CROSS JOIN public."WorkPolicy" AS policy
  WHERE missing."managerId" IS NOT NULL
    AND missing."dueAt" + policy."escalationHours" * interval '1 hour' <= at_time
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS manager_count = ROW_COUNT;

  RETURN employee_count + manager_count;
END
$$;

COMMIT;
