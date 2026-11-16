BEGIN;
SET LOCAL lock_timeout='10s';
-- A standalone reviewer does not depend on an Employee row or cross-population email uniqueness.
CREATE OR REPLACE VIEW "ClinicalIdentity" AS
 SELECT w.id AS "accountId",w."employeeId" AS id,
        coalesce(e."fullName",w."reviewerName") AS "fullName",
        coalesce(e."permanentId",w."reviewerEmail") AS "permanentId",
        coalesce(e.email,w."reviewerEmail") AS email,
        CASE WHEN w."employeeId" IS NOT NULL THEN e.status::text
             WHEN w.role='CLINICAL_ONLY' AND w."isActive" THEN 'ACTIVE'
             ELSE 'INACTIVE' END AS status
 FROM "WorkAccount" w LEFT JOIN "Employee" e ON e.id=w."employeeId";
COMMIT;
