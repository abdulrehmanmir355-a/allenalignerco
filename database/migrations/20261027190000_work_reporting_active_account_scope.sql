-- Do not mark staff who cannot currently sign in as overdue for work reports.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(204026, 271900);

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
    AND ac."isActive"
    AND NOT ac."mustChangePassword"
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

COMMIT;
