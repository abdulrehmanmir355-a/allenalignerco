# Employee registration invitations

HR administrators open **HR → Registration Invitations** (`/hr/invitations`). The existing Employee Identity page also links there. HR officers, viewers, employee, doctor and clinic sessions cannot issue, view invitation status, revoke or resend codes.

1. Create the intended employee through existing HR employee management. PostgreSQL assigns the unique `AA-EMP-` plus 12-digit Employee ID. Historical IDs remain valid and unchanged.
2. Select the existing active employee without credentials, verify the intended recipient, choose a delivery method, and record a reason.
3. Generate the invitation and share the displayed code privately. It is shown once. No email is sent automatically; digital delivery is performed by the authorized administrator.
4. The employee visits `/employee/register` and supplies that Employee ID, the invitation code and their new password.

Codes use 32 cryptographically random bytes. Only their SHA-256 hashes are stored, in the existing linked WorkAccount. Invitation history contains no code or hash. Each code is bound to an employee and, when recorded, the intended email. Expiry is exactly 24 hours according to the database clock; the former `EMPLOYEE_INVITATION_HOURS` setting cannot extend it.

**Resend / replace** generates a new code, invalidates the old code and starts a new 24-hour period. **Revoke** immediately invalidates the pending code. Expired, revoked, replaced or used codes cannot activate an account. Stale actions on an older invitation cannot revoke a replacement.

Activation validates the code on the server before enabling the account, locks the account and invitation, rechecks expiry after password hashing, and consumes the invitation transactionally. Concurrent redemption succeeds once. A failed audit write rolls back activation and consumption. The employee retains the ID already allocated by the existing generator; activation never creates a second employee or changes roles. Passwords use bcrypt, and pending codes and sessions are cleared on activation. Activated accounts use normal account management for password resets. Employment deactivation invalidates pending codes and sessions.

The Admin page lists pending, used, revoked and expired states, supports paginated history, and shows issuance, replacement, revocation and activation audit events. Invitation audit records are immutable. Codes, token hashes and passwords are excluded from the audit records and listing responses. Registration respects the existing server-side attempt limits and write requests require the expected request origin.

## Migration and verification

The additive, repeatable migration is `database/migrations/20261026190000_employee_invitation_codes.sql`. It adds the missing invitation infrastructure without replaying older broad migrations, rewriting employee identities or changing existing credentials. It stops for mismatched historical invitation metadata rather than inventing records. No request performs schema creation.

From the project directory:

```powershell
node scripts/verify-employee-invitations.cjs
```

This creates and validates a private PostgreSQL backup, restores an isolated local verification database, applies the migration twice, runs the invitation workflow checks against the restored copy, and checks the actual employee records, account credentials and sequence are unchanged. The isolated database is removed after a successful run. The actual database schema is unchanged by this verification command.

To verify first and then apply the targeted migration:

```powershell
node scripts/verify-employee-invitations.cjs --apply
```

Both commands use the installed PostgreSQL tools; no packages or database software are installed. `PG_BIN` can select an existing PostgreSQL binary directory. The runner accepts only the local `allen_aligner` database as its source. Backups and verification reports are stored under `.private/`. A failed verification leaves the actual schema unchanged and retains the isolated database for diagnosis. `--keep-test-db` also retains a successful test database when passed directly to the verification script.

`scripts/invitation-codes-integration.cjs` can be run separately only with `INVITATION_TEST_DATABASE_URL` set to an isolated local `allen_aligner_invitation_test_YYYYMMDD_XXXXXXXX` database with the migration applied. It refuses the actual database. Synthetic test accounts and invitations are created only in that isolated database.

The tests cover role and session restrictions, origin checks, server-generated codes, hash-only storage, exact expiry, employee/email binding, incorrect and replaced codes, revocation, resend, concurrent redemption, password handling, status pagination, audit rollback, expiry during activation, immutable audit history and preservation of existing IDs.

Employee login, Doctor, Clinic, Owner and clinical permission flows retain their existing authentication systems. The global header and its trailing three-line navigation icon are unchanged.


## External clinical reviewers

Clinical reviewer invitations use the separate HR **Reviewer Access** page (`/hr/reviewer-access`). HR Admins or Officers issue a 24-hour code to the reviewer email, which may also appear on an Employee record. The reviewer creates a separate account without an Employee ID. After activation, a qualified HR Admin or Officer must approve the reviewer request before clinical case access is enabled. HR Viewers may view reviewer invitation status but cannot issue codes or approve access. The employee and reviewer invitation pages link to one another.
