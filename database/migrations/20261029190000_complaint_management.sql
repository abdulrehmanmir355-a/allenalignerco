BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS "QualityComplaint" (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "receivedDate" date NOT NULL,
 source varchar(20) NOT NULL CHECK (source IN ('DOCTOR','CLINIC','LABORATORY','PATIENT','REGULATORY','INTERNAL','OTHER')),
 "complainantName" varchar(200) NOT NULL,
 "complainantEmail" varchar(254) NOT NULL DEFAULT '',
 "complainantPhone" varchar(40) NOT NULL DEFAULT '',
 "productReference" varchar(120) NOT NULL DEFAULT '',
 "lotReference" varchar(120) NOT NULL DEFAULT '',
 "caseId" text REFERENCES "PortalCase"(id),
 description text NOT NULL,
 "riskLevel" varchar(12) NOT NULL CHECK ("riskLevel" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 "riskAssessment" text NOT NULL DEFAULT '',
 "investigationOwner" varchar(200) NOT NULL DEFAULT '',
 "investigationFindings" text NOT NULL DEFAULT '',
 "rootCause" text NOT NULL DEFAULT '',
 "capaRequired" boolean NOT NULL DEFAULT false,
 "capaId" uuid REFERENCES "CAPA"(id),
 "capaRationale" text NOT NULL DEFAULT '',
 "regulatoryOutcome" varchar(20) NOT NULL DEFAULT 'NOT_ASSESSED' CHECK ("regulatoryOutcome" IN ('NOT_ASSESSED','NOT_REPORTABLE','REPORTABLE','CONSULT_REQUIRED')),
 "regulatoryAssessment" text NOT NULL DEFAULT '',
 "closureSummary" text NOT NULL DEFAULT '',
 status varchar(24) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','RISK_ASSESSED','INVESTIGATING','CAPA_ASSESSMENT','REGULATORY_ASSESSMENT','CLOSURE_REVIEW','CLOSED','CANCELLED')),
 "createdBy" uuid NOT NULL REFERENCES "HRUser"(id),
 "updatedBy" uuid NOT NULL REFERENCES "HRUser"(id),
 "createdAt" timestamptz NOT NULL DEFAULT now(),
 "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "closedAt" timestamptz,
 CHECK ("caseId" IS NULL OR "caseId" ~* '^[0-9a-f-]{36}$')
);
CREATE INDEX IF NOT EXISTS "QualityComplaint_status_received_idx" ON "QualityComplaint"(status,"receivedDate" DESC);
CREATE INDEX IF NOT EXISTS "QualityComplaint_case_idx" ON "QualityComplaint"("caseId") WHERE "caseId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "QualityComplaint_product_lot_idx" ON "QualityComplaint"("productReference","lotReference");
CREATE TABLE IF NOT EXISTS "QualityComplaintAudit" (
 id bigserial PRIMARY KEY,
 "complaintId" uuid NOT NULL REFERENCES "QualityComplaint"(id),
 "actorId" uuid NOT NULL REFERENCES "HRUser"(id),
 action varchar(24) NOT NULL CHECK (action IN ('CREATED','UPDATED','STAGE_CHANGED')),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "QualityComplaintAudit_complaint_time_idx" ON "QualityComplaintAudit"("complaintId","createdAt" DESC);
COMMIT;
