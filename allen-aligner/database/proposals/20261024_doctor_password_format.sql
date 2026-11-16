-- REVIEW REQUIRED. Do not apply automatically.
-- Prevents direct SQL/grid imports from reintroducing plaintext Doctor passwords.
-- Changes no password values, roles, verification, clinics, sessions or tables.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

ALTER TABLE "Doctor" ADD CONSTRAINT "Doctor_passwordHash_bcrypt_check"
CHECK ("passwordHash" IS NOT NULL AND "passwordHash" ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$') NOT VALID;

-- Any remaining malformed credential aborts the transaction for operator review.
-- Never convert unknown hash formats or generate replacement passwords here.
ALTER TABLE "Doctor" VALIDATE CONSTRAINT "Doctor_passwordHash_bcrypt_check";
COMMIT;
