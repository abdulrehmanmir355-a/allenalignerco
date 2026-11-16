CREATE TABLE IF NOT EXISTS "OwnerAccount" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" text NOT NULL UNIQUE,
  "fullName" text NOT NULL,
  email text NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS "OwnerInvitation" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "fullName" text NOT NULL,
  email text NOT NULL,
  "tokenHash" char(64) NOT NULL UNIQUE,
  "issuedById" text NOT NULL,
  "issuedByEmail" text NOT NULL,
  "issuedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "expiresAt" timestamptz NOT NULL,
  "activatedAt" timestamptz,
  "revokedAt" timestamptz,
  "ownerId" uuid REFERENCES "OwnerAccount"(id)
);
CREATE INDEX IF NOT EXISTS "OwnerInvitation_pending_email_idx"
  ON "OwnerInvitation"(lower(email), "expiresAt")
  WHERE "activatedAt" IS NULL AND "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "OwnerSession" (
  "tokenHash" char(64) PRIMARY KEY,
  "ownerId" uuid NOT NULL REFERENCES "OwnerAccount"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "expiresAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "OwnerSession_expiry_idx" ON "OwnerSession"("expiresAt");

CREATE TABLE IF NOT EXISTS "OwnerAudit" (
  id bigserial PRIMARY KEY,
  "actorId" text NOT NULL,
  "actorEmail" text NOT NULL,
  action text NOT NULL,
  "invitationId" uuid REFERENCES "OwnerInvitation"(id),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS "OwnerAudit_created_idx" ON "OwnerAudit"("createdAt" DESC);
