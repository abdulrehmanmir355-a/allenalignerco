ALTER TABLE "HRUser" DROP CONSTRAINT IF EXISTS "HRUser_role_check";
ALTER TABLE "HRUser" ADD CONSTRAINT "HRUser_role_check"
  CHECK ("role" IN ('HR_ADMIN','HR_OFFICER','HR_VIEWER','AUDIT_TEAM'));

CREATE TABLE IF NOT EXISTS "AuditTeamInvitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "hrUserId" UUID NOT NULL REFERENCES "HRUser"("id") ON DELETE CASCADE,
  "codeHash" TEXT NOT NULL UNIQUE,
  "issuedBy" UUID NOT NULL REFERENCES "HRUser"("id"),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuditTeamInvitation_open_user_idx"
  ON "AuditTeamInvitation"("hrUserId") WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;
CREATE TABLE IF NOT EXISTS "AuditTeamSession" (
  "tokenHash" TEXT PRIMARY KEY,
  "hrUserId" UUID NOT NULL REFERENCES "HRUser"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AuditTeamSession_expires_idx" ON "AuditTeamSession"("expiresAt");
CREATE TABLE IF NOT EXISTS "AuditTeamAccessEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "actorId" UUID NOT NULL REFERENCES "HRUser"("id"),
  "accountId" UUID NOT NULL REFERENCES "HRUser"("id"),
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AuditTeamAccessEvent_created_idx" ON "AuditTeamAccessEvent"("createdAt" DESC);
