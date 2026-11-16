-- Apply to the Owner database.
CREATE TABLE IF NOT EXISTS public."OwnerPasswordReset" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerId" uuid NOT NULL REFERENCES public."OwnerAccount"(id) ON DELETE CASCADE,
  "tokenHash" char(64) NOT NULL UNIQUE,
  "issuedById" text NOT NULL,
  "issuedByEmail" text NOT NULL,
  "issuedAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "OwnerPasswordReset_pending_idx"
  ON public."OwnerPasswordReset"("ownerId", "expiresAt") WHERE "usedAt" IS NULL;
