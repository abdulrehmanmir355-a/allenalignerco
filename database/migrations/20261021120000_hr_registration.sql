-- Add registration identity without changing existing account activation.
ALTER TABLE "HRUser" ADD COLUMN IF NOT EXISTS "fullName" VARCHAR(150);
ALTER TABLE "HRUser" ALTER COLUMN "isActive" SET DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS "HRUser_email_lower_key" ON "HRUser" (LOWER("email"));
