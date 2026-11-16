BEGIN;
SET LOCAL lock_timeout='10s';

CREATE TABLE "ClinicalCaseAssignment" (
  "caseId" text PRIMARY KEY REFERENCES "PortalCase"(id) ON DELETE RESTRICT,
  "assignedTo" uuid NOT NULL REFERENCES "WorkAccount"(id) ON DELETE RESTRICT,
  "assignedBy" uuid NOT NULL REFERENCES "WorkAccount"(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  "assignedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ClinicalCaseAssignment_assignee" ON "ClinicalCaseAssignment"("assignedTo","assignedAt" DESC);

CREATE TABLE "ClinicalCaseAssignmentAudit" (
  id bigserial PRIMARY KEY,
  "caseId" text NOT NULL REFERENCES "PortalCase"(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('ASSIGNED','REASSIGNED')),
  "actorId" text NOT NULL,
  "actorName" text NOT NULL,
  "fromAccountId" uuid,
  "toAccountId" uuid NOT NULL,
  revision integer NOT NULL,
  reason text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ClinicalCaseAssignmentAudit_case" ON "ClinicalCaseAssignmentAudit"("caseId",id);

CREATE FUNCTION aa_clinical_case_assignment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_status text; actor_role text; assigned_role text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case assignments are retained in the audit history'; END IF;
  IF TG_OP='UPDATE' AND (NEW."caseId" IS DISTINCT FROM OLD."caseId" OR NEW.revision<>OLD.revision+1) THEN
    RAISE EXCEPTION 'Case assignment identity is permanent and revisions must be consecutive';
  END IF;
  IF NEW."assignedBy"::text IS DISTINCT FROM current_setting('allen.clinical_actor',true) THEN
    RAISE EXCEPTION 'An authenticated Clinical Lead or administrator must assign the case';
  END IF;
  SELECT w."clinicalRole" INTO actor_role
  FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
  WHERE w.id=NEW."assignedBy" AND w."isActive" AND NOT w."mustChangePassword"
    AND e.status='ACTIVE' AND w."clinicalRole" IN ('LEAD','ADMIN');
  IF actor_role IS NULL THEN RAISE EXCEPTION 'An active Clinical Lead or administrator is required'; END IF;
  SELECT w."clinicalRole" INTO assigned_role
  FROM "WorkAccount" w JOIN "ClinicalIdentity" e ON e."accountId"=w.id
  WHERE w.id=NEW."assignedTo" AND w."isActive" AND NOT w."mustChangePassword"
    AND e.status='ACTIVE' AND w."clinicalRole" IN ('REVIEWER','LEAD');
  IF assigned_role IS NULL THEN RAISE EXCEPTION 'Assign an active qualified Reviewer or Clinical Lead'; END IF;
  SELECT c.status INTO case_status FROM "PortalCase" c WHERE c.id=NEW."caseId" FOR UPDATE;
  IF case_status IS NULL OR case_status='DRAFT' OR NOT EXISTS(
    SELECT 1 FROM "CaseMessage" m WHERE m."caseId"=NEW."caseId" AND m."senderRole"='DOCTOR'
  ) THEN RAISE EXCEPTION 'Only a submitted case with a doctor message can be assigned'; END IF;
  IF length(trim(NEW.reason))<10 OR length(trim(NEW.reason))>1000 THEN RAISE EXCEPTION 'Record a clear assignment reason'; END IF;
  NEW."assignedAt":=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER aa_clinical_case_assignment_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "ClinicalCaseAssignment"
  FOR EACH ROW EXECUTE FUNCTION aa_clinical_case_assignment_guard();

CREATE FUNCTION aa_clinical_case_assignment_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_name text;
BEGIN
  SELECT e."fullName" INTO actor_name FROM "ClinicalIdentity" e WHERE e."accountId"=NEW."assignedBy";
  INSERT INTO "ClinicalCaseAssignmentAudit"(
    "caseId",action,"actorId","actorName","fromAccountId","toAccountId",revision,reason
  ) VALUES(
    NEW."caseId",CASE WHEN TG_OP='INSERT' THEN 'ASSIGNED' ELSE 'REASSIGNED' END,
    NEW."assignedBy"::text,coalesce(actor_name,'Clinical Lead'),
    CASE WHEN TG_OP='UPDATE' THEN OLD."assignedTo" ELSE NULL END,
    NEW."assignedTo",NEW.revision,NEW.reason
  );
  RETURN NEW;
END $$;
CREATE TRIGGER aa_clinical_case_assignment_audit
  AFTER INSERT OR UPDATE ON "ClinicalCaseAssignment"
  FOR EACH ROW EXECUTE FUNCTION aa_clinical_case_assignment_audit();

CREATE FUNCTION aa_clinical_case_assignment_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Case assignment audit history is immutable';
END $$;
CREATE TRIGGER aa_clinical_case_assignment_audit_immutable
  BEFORE UPDATE OR DELETE ON "ClinicalCaseAssignmentAudit"
  FOR EACH ROW EXECUTE FUNCTION aa_clinical_case_assignment_audit_immutable();
CREATE TRIGGER aa_clinical_case_assignment_audit_no_truncate
  BEFORE TRUNCATE ON "ClinicalCaseAssignmentAudit"
  FOR EACH STATEMENT EXECUTE FUNCTION aa_clinical_case_assignment_audit_immutable();

COMMIT;
