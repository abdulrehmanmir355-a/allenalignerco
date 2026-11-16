BEGIN;
SET LOCAL lock_timeout='10s';
ALTER TABLE "WorkAccount" ALTER COLUMN "employeeId" DROP NOT NULL;
ALTER TABLE "WorkAccount" ADD COLUMN IF NOT EXISTS "reviewerEmail" text;
ALTER TABLE "WorkAccount" ADD COLUMN IF NOT EXISTS "reviewerName" text;
ALTER TABLE "WorkAccount" DROP CONSTRAINT IF EXISTS "WorkAccount_role_check";
ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_role_check" CHECK(role IN ('EMPLOYEE','MANAGER','CLINICAL_ONLY'));
ALTER TABLE "WorkAccount" DROP CONSTRAINT IF EXISTS "WorkAccount_clinical_identity_check";
ALTER TABLE "WorkAccount" ADD CONSTRAINT "WorkAccount_clinical_identity_check" CHECK(
 ("employeeId" IS NOT NULL AND role<>'CLINICAL_ONLY' AND "reviewerEmail" IS NULL AND "reviewerName" IS NULL)
 OR ("employeeId" IS NULL AND role='CLINICAL_ONLY' AND "reviewerEmail" IS NOT NULL AND length("reviewerEmail") BETWEEN 3 AND 254
 AND "reviewerEmail"=lower(trim("reviewerEmail")) AND "reviewerName" IS NOT NULL AND length(trim("reviewerName"))>=2
 AND ("clinicalRole" IS NULL OR "clinicalRole"='REVIEWER')));
CREATE UNIQUE INDEX IF NOT EXISTS "WorkAccount_reviewerEmail_unique" ON "WorkAccount"("reviewerEmail") WHERE "reviewerEmail" IS NOT NULL;
CREATE OR REPLACE VIEW "ClinicalIdentity" AS
 SELECT w.id AS "accountId",w."employeeId" AS id,coalesce(e."fullName",w."reviewerName") AS "fullName",
 coalesce(e."permanentId",w."reviewerEmail") AS "permanentId",coalesce(e.email,w."reviewerEmail") AS email,
 CASE WHEN w."employeeId" IS NOT NULL THEN e.status::text WHEN w.role='CLINICAL_ONLY' AND w."isActive" AND NOT EXISTS(SELECT 1 FROM "Employee" duplicate WHERE lower(trim(duplicate.email))=w."reviewerEmail") THEN 'ACTIVE' ELSE 'INACTIVE' END AS status
 FROM "WorkAccount" w LEFT JOIN "Employee" e ON e.id=w."employeeId";
CREATE OR REPLACE FUNCTION aa_plan_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE employee_id text; actor_role text;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "PortalCase" WHERE id=NEW."caseId" AND status IN ('SUBMITTED','PLANNING','CHANGES_REQUESTED')) THEN RAISE EXCEPTION 'A case must be in planning before a new version can be prepared'; END IF;
  IF NEW."preparedByAccountId" IS NULL OR NEW."preparedByEmployeeId" IS NULL OR NEW."preparedAt" IS NULL
   OR NEW."preparedByAccountId"::text IS DISTINCT FROM current_setting('allen.preparer_account',true)
   OR NEW."createdById" IS DISTINCT FROM NEW."preparedByAccountId"::text THEN
   RAISE EXCEPTION 'An authenticated internal preparer identity is required for every new plan version'; END IF;
 ELSIF ROW(NEW."preparedByAccountId",NEW."preparedByEmployeeId",NEW."preparedAt") IS DISTINCT FROM ROW(OLD."preparedByAccountId",OLD."preparedByEmployeeId",OLD."preparedAt") THEN
  IF OLD."preparedByAccountId" IS NOT NULL OR OLD."preparedByEmployeeId" IS NOT NULL OR OLD."preparedAt" IS NOT NULL OR OLD.decision<>'PENDING'
   OR current_setting('allen.clinical_action',true) IS DISTINCT FROM 'record_preparer'
   OR length(trim(coalesce(current_setting('allen.preparer_reason',true),'')))<10
   OR NOT EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=OLD.id AND r.status IN ('PENDING','IN_REVIEW','ESCALATED')) THEN
   RAISE EXCEPTION 'Preparation identity is permanent; a new version is required'; END IF;
  SELECT w."clinicalRole" INTO actor_role FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
   WHERE w.id::text=current_setting('allen.clinical_actor',true) AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE';
  IF actor_role IS NULL OR actor_role NOT IN ('LEAD','ADMIN') THEN RAISE EXCEPTION 'Clinical Lead or authorized administrator attestation is required'; END IF;
 ELSE RETURN NEW;
 END IF;
 SELECT w."employeeId" INTO employee_id FROM "WorkAccount" w JOIN "Employee" e ON e.id=w."employeeId"
  WHERE w.id=NEW."preparedByAccountId" AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE';
 IF employee_id IS NULL OR employee_id IS DISTINCT FROM NEW."preparedByEmployeeId" OR NEW."preparedAt" IS NULL THEN RAISE EXCEPTION 'The preparer must be a verified active internal employee'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION aa_clinical_separation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "TreatmentPlan"%ROWTYPE; actor_id text; actor_employee text; actor_role text; reviewer_employee text; reviewer_role text; action text; key text; finding jsonb;
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."planId" IS DISTINCT FROM OLD."planId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN RAISE EXCEPTION 'Review identity and version are permanent'; END IF;
 IF OLD.status IN ('APPROVED','REVISION_REQUESTED','RETURNED') THEN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Completed clinical reviews are immutable; create a new plan version'; END IF; RETURN NEW;
 END IF;
 SELECT * INTO p FROM "TreatmentPlan" WHERE id=NEW."planId";
 actor_id:=current_setting('allen.clinical_actor',true);action:=current_setting('allen.clinical_action',true);
 SELECT w."employeeId",w."clinicalRole" INTO actor_employee,actor_role FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
  WHERE w.id::text=actor_id AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE';
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Active authenticated clinical authority is required'; END IF;
 IF action IN ('assign','record_preparer') THEN
  IF actor_role NOT IN ('LEAD','ADMIN') THEN RAISE EXCEPTION 'Only Clinical Leads and authorized administrators assign reviewers'; END IF;
 ELSE
  IF actor_role NOT IN ('REVIEWER','LEAD') OR actor_id IS DISTINCT FROM NEW."assignedTo"::text THEN RAISE EXCEPTION 'Only the assigned qualified reviewer may record findings'; END IF;
  IF p."preparedByAccountId" IS NULL OR p."preparedByEmployeeId" IS NULL THEN RAISE EXCEPTION 'Verified preparation identity is required'; END IF;
  IF actor_id=p."preparedByAccountId"::text OR actor_employee=p."preparedByEmployeeId" THEN RAISE EXCEPTION 'The preparer cannot review the same plan version'; END IF;
  IF OLD.status='ESCALATED' AND actor_role<>'LEAD' THEN RAISE EXCEPTION 'An independent qualified Clinical Lead must take over an escalation'; END IF;
  IF action='start' THEN
   IF OLD.status NOT IN ('PENDING','ESCALATED') OR NEW.status<>'IN_REVIEW' OR NEW."startedAt" IS NULL THEN RAISE EXCEPTION 'Start the assigned review before recording findings'; END IF;
  ELSIF action IN ('save','approve','revise','return','escalate','observe') THEN
   IF OLD.status<>'IN_REVIEW' THEN RAISE EXCEPTION 'The independent review must be in progress'; END IF;
  ELSE RAISE EXCEPTION 'An explicit authorized review action is required'; END IF;
 END IF;
 IF NEW."assignedTo" IS NOT NULL THEN
  SELECT w."employeeId",w."clinicalRole" INTO reviewer_employee,reviewer_role FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
   WHERE w.id=NEW."assignedTo" AND w."isActive" AND NOT w."mustChangePassword" AND e.status='ACTIVE';
  IF reviewer_role IS NULL OR reviewer_role NOT IN ('REVIEWER','LEAD') OR p."preparedByAccountId" IS NULL OR p."preparedByEmployeeId" IS NULL
   OR NEW."assignedTo"=p."preparedByAccountId" OR reviewer_employee=p."preparedByEmployeeId" THEN RAISE EXCEPTION 'Assign a different active qualified clinical reviewer'; END IF;
  IF NEW.status='ESCALATED' AND action='assign' AND reviewer_role<>'LEAD' THEN RAISE EXCEPTION 'Escalated cases require an independent Clinical Lead'; END IF;
 END IF;
 IF NEW."assignedTo" IS DISTINCT FROM OLD."assignedTo" THEN
  IF action NOT IN ('assign','start','record_preparer') THEN RAISE EXCEPTION 'Reviewer assignment cannot change silently'; END IF;
  IF NEW.checklist<>'{}'::jsonb OR NEW.notes<>'' THEN RAISE EXCEPTION 'A new reviewer must record their own findings'; END IF;
  IF action<>'start' AND (NEW."startedAt" IS NOT NULL OR NEW.status NOT IN ('PENDING','ESCALATED')) THEN RAISE EXCEPTION 'Reassignment resets review progress'; END IF;
 END IF;
 IF NEW.status IN ('REVISION_REQUESTED','RETURNED') AND (NEW."decidedBy"::text IS DISTINCT FROM actor_id OR NEW."completedAt" IS NULL) THEN RAISE EXCEPTION 'The actual independent reviewer must record the decision'; END IF;
 IF NEW.status='APPROVED' THEN
  IF OLD.status<>'IN_REVIEW' OR action IS DISTINCT FROM 'approve' OR current_setting('allen.clinical_confirmed',true) IS DISTINCT FROM 'true'
   OR NEW."decidedBy"::text IS DISTINCT FROM actor_id OR NEW."completedAt" IS NULL THEN RAISE EXCEPTION 'An explicit independent review decision is required'; END IF;
  FOREACH key IN ARRAY ARRAY['completeness','records','consistency','movement','attachments','ipr','staging','concerns','information'] LOOP
   finding:=NEW.checklist->key;
   IF finding IS NULL OR coalesce(finding->>'result','') NOT IN ('CONFIRMED','NOT_APPLICABLE') THEN RAISE EXCEPTION 'Complete and resolve all clinical findings before approval'; END IF;
   IF finding->>'result'='NOT_APPLICABLE' AND (key NOT IN ('attachments','ipr') OR length(trim(coalesce(finding->>'note','')))=0) THEN RAISE EXCEPTION 'Explain only permitted not-applicable findings'; END IF;
  END LOOP;
  NEW."independenceVerified":=true;NEW."reviewedByEmployeeId":=actor_employee;
 ELSIF NEW."independenceVerified" IS DISTINCT FROM OLD."independenceVerified" OR NEW."reviewedByEmployeeId" IS DISTINCT FROM OLD."reviewedByEmployeeId" THEN RAISE EXCEPTION 'Independent approval evidence is server controlled';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION aa_independent_plan_decision_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.decision IS DISTINCT FROM OLD.decision AND NOT EXISTS(SELECT 1 FROM "ClinicalReview" r WHERE r."planId"=NEW.id AND r.status='APPROVED' AND r."independenceVerified" AND (r."reviewedByEmployeeId" IS NULL OR r."reviewedByEmployeeId"<>NEW."preparedByEmployeeId") AND r."decidedBy"<>NEW."preparedByAccountId") THEN
  RAISE EXCEPTION 'Independent clinical approval is required for this exact version before a doctor decision'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION aa_independent_case_release_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('REVIEW','APPROVED','IN_PRODUCTION') AND NOT EXISTS(
  SELECT 1 FROM "TreatmentPlan" p JOIN "ClinicalReview" r ON r."planId"=p.id WHERE p."caseId"=NEW.id
   AND p.version=(SELECT max(version) FROM "TreatmentPlan" WHERE "caseId"=NEW.id)
   AND r.status='APPROVED' AND r."independenceVerified" AND (r."reviewedByEmployeeId" IS NULL OR r."reviewedByEmployeeId"<>p."preparedByEmployeeId") AND r."decidedBy"<>p."preparedByAccountId") THEN
  RAISE EXCEPTION 'Independent clinical review of the current plan is required before release'; END IF;
 RETURN NEW;
END $$;
COMMIT;
