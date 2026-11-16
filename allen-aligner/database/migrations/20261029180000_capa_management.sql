BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "CAPA" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sourceType" varchar(30) NOT NULL CHECK ("sourceType" IN ('CLINICAL','LABORATORY','SUPPLIER','INTERNAL_AUDIT','CUSTOMER','PROCESS','OTHER')),
  severity varchar(12) NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  title varchar(200) NOT NULL CHECK (length(trim(title)) >= 5),
  description text NOT NULL,
  containment text NOT NULL DEFAULT '',
  "rootCause" text NOT NULL DEFAULT '',
  correction text NOT NULL DEFAULT '',
  "correctiveAction" text NOT NULL DEFAULT '',
  "preventiveAction" text NOT NULL DEFAULT '',
  "effectivenessCheck" text NOT NULL DEFAULT '',
  "assignedTo" varchar(200) NOT NULL,
  "dueDate" date NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','ACTION_IN_PROGRESS','VERIFYING','CLOSED','CANCELLED')),
  "createdBy" uuid NOT NULL REFERENCES "HRUser"(id),
  "updatedBy" uuid NOT NULL REFERENCES "HRUser"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "closedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "CAPA_status_due_idx" ON "CAPA"(status,"dueDate");
CREATE INDEX IF NOT EXISTS "CAPA_created_idx" ON "CAPA"("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "CAPAAudit" (
  id bigserial PRIMARY KEY,
  "capaId" uuid NOT NULL REFERENCES "CAPA"(id),
  "actorId" uuid NOT NULL REFERENCES "HRUser"(id),
  action varchar(24) NOT NULL CHECK (action IN ('CREATED','UPDATED','STATUS_CHANGED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CAPAAudit_capa_time_idx" ON "CAPAAudit"("capaId","createdAt" DESC);
COMMIT;
