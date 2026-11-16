# HR Registration and Header Menu

Implemented 21 October 2026.

Header: HR > HR Registration (/hr/register), HR Login (/hr/login). Uses the existing delayed desktop hover, click/tap toggle, ArrowDown focus, Escape close, outside-click dismissal and reduced-motion handling.

Public registration accepts full name, email and matching passwords (minimum 12 characters; bcrypt maximum 72 UTF-8 bytes). Email is normalized; the database enforces case-insensitive uniqueness. Passwords are hashed with bcrypt. Accounts start as inactive HR_OFFICER users. Request payloads cannot supply roles or activation status. Registration returns a generic accepted response for an existing email, without replacing its password or account details. Registration never starts a session.

Login requires the correct password and an active account. Inactive accounts receive an approval/inactive message only after a valid password. The HR workspace rechecks active status on every session lookup.

## Local authorized account activation
After confirming the applicant is authorized, a trusted local operator can use:

    node scripts/hr-admin.cjs activate approved-person@example.com

To deactivate and revoke the account's sessions:

    node scripts/hr-admin.cjs deactivate approved-person@example.com

Replace the example with the verified account email. No real account was activated automatically. These are local operator commands; there is no public approval endpoint, self-approval or automatic email notification.

## Database
The five existing HR foundation migrations plus 20261021120000_hr_registration.sql establish the seven HR tables, fullName, an inactive default and case-insensitive email uniqueness. They are applied transactionally after a private database backup. Do not replay historical clinical migrations or reset existing data.

The offboarding page remains the existing employee directory; this increment does not implement the full offboarding workflow.
