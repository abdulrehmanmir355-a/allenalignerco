-- Additive clinical registration records. Does not rewrite employees, passwords, or owner data.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS "ClinicalAccessInvitation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" text NOT NULL REFERENCES "Employee"(id),
  email text NOT NULL,
  department text NOT NULL,
  "jobTitle" text NOT NULL,
  role text NOT NULL CHECK (role IN ('REVIEWER', 'LEAD')),
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "issuedBy" uuid NOT NULL REFERENCES "HRUser"(id),
  status text NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'USED', 'REVOKED', 'EXPIRED')),
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "usedAt" timestamptz,
  "revokedAt" timestamptz,
  "revokedBy" uuid,
  reason varchar(1000) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS clinical_invitation_one_open
  ON "ClinicalAccessInvitation"("employeeId") WHERE status = 'INVITED';
CREATE INDEX IF NOT EXISTS clinical_invitation_employee
  ON "ClinicalAccessInvitation"("employeeId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ClinicalRegistrationRequest" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" text NOT NULL REFERENCES "Employee"(id),
  "accountId" uuid REFERENCES "WorkAccount"(id),
  email text NOT NULL,
  "fullName" text NOT NULL,
  department text NOT NULL,
  "jobTitle" text NOT NULL,
  "employeeStatus" text NOT NULL,
  "requestedRole" text NOT NULL CHECK ("requestedRole" IN ('REVIEWER', 'LEAD')),
  pathway text NOT NULL CHECK (pathway IN ('HR_INVITATION', 'STANDARD')),
  status text NOT NULL CHECK (status IN (
    'INVITED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED'
  )),
  "passwordHash" text,
  "invitationId" uuid REFERENCES "ClinicalAccessInvitation"(id),
  reason text,
  "requestedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "decidedAt" timestamptz,
  "decidedBy" text,
  "decidedByRole" text,
  "decisionReason" text,
  "activatedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS clinical_registration_one_open
  ON "ClinicalRegistrationRequest"("employeeId")
  WHERE status IN ('INVITED', 'PENDING_VERIFICATION', 'PENDING_APPROVAL');
CREATE INDEX IF NOT EXISTS clinical_registration_status
  ON "ClinicalRegistrationRequest"(status, "requestedAt" DESC);
CREATE INDEX IF NOT EXISTS clinical_registration_email
  ON "ClinicalRegistrationRequest"(lower(email));

CREATE TABLE IF NOT EXISTS "ClinicalPasswordReset" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "accountId" uuid NOT NULL REFERENCES "WorkAccount"(id),
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clinical_password_reset_account
  ON "ClinicalPasswordReset"("accountId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "ClinicalSecurityEvent" (
  id bigserial PRIMARY KEY,
  "actorId" text,
  action text NOT NULL,
  "employeeId" text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS "ClinicalOutboundEmail" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "toAddress" text NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "sentAt" timestamptz,
  error text
);
COMMIT;
