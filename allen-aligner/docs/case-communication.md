# Doctor–Allen case communication

## Dedicated communication cell

- Doctor inbox: `/doctor-dashboard/communication`
- Allen internal inbox: `/clinical/communications`
- Doctor case conversation: `/doctor-dashboard/cases/[id]/communication`
- Internal case conversation: `/clinical/cases/[id]/communication`

Every conversation belongs to one existing `PortalCase`. Both sides use the same `CaseMessage` history. The existing case pages link to the dedicated conversation; the former doctor-only composer and internal read-only message list have been replaced by these entry points. No separate chat/case/patient database was introduced.

## Workflow

The treating doctor and authorized Allen clinical team can exchange case updates, questions and status notes. They can reply to a particular message and reference a released plan version or an existing case document. The case context remains visible beside the thread. Status notes communicate about status; actual lifecycle transitions and treatment approvals remain in the existing authorized workflows.

### Leader-managed case contact

When a doctor sends the first authenticated message for a submitted case, the case appears in the Leader Case Assignments queue at `/clinical/leader`. An authorized Clinical Lead or administrator selects an active Reviewer or Clinical Lead, records a reason, and can later reassign the case. Assignment and reassignment are retained in an append-only audit. The doctor and newly assigned person are notified.

Only the assigned person, the active Clinical Lead/administrators, and an independently assigned plan reviewer can access the internal conversation. The assigned person can reply directly to doctor messages shared with the case team; internal-only doctor messages and private clinical notes cannot be quoted into the shared thread. The doctor can see the assigned contact and only messages shared with the case team. Case ownership for the doctor portal is unchanged.

History is append-only. It includes existing messages without inventing authenticated identities for older rows. Fifty messages load at a time; earlier history uses a stable case-bound cursor. Visible pages refresh incrementally every 15 seconds and include a manual refresh. The search field searches loaded messages. The inbox search finds authorized cases by reference, case ID or doctor. There are no read/delivery-receipt claims.

## Access and confidentiality

Doctor access requires a verified authenticated doctor assigned to the case and the matching clinic. Draft cases are not shared conversations. Internal access reuses active clinical accounts and existing case policies: leads/admins can access submitted cases; reviewers can access their assigned case work. Ordinary employee, clinic and external bearer-token access do not grant this communication permission.

New messages have `audience='DOCTOR_INTERNAL'`. The legacy lab bearer endpoint retains old `CASE` messages, but excludes the new doctor–internal messages. Historical audience values are preserved. Private internal clinical observations remain in the clinical-review workspace; they are not copied into the conversation.

Senders come from authentication, not request fields. Reply, document and plan references must belong to the same case. Plan context must be internally approved/released. Both write endpoints enforce their existing origin/CSRF checks and strict request validation. Text is rendered as text, not HTML.

## Reliability and audit

The additive migration `20261028160000_case_communication.sql` extends `CaseMessage` with authenticated sender, audience, plan, reply, request and document references, plus a status snapshot. It adds idempotency/history indexes and database guards, without removing historical rows.

Each send uses the existing single-client database transaction and case lock. Retrying the same request returns the same message; reusing its key with different content conflicts. Timeline and in-app notification writes share that transaction. Messages do not increment the case revision, approve plans or release manufacturing. Database message timestamps are assigned under the case lock, preventing a late-committing transaction from falling behind the incremental refresh cursor.

Doctor messages notify eligible active clinical leads/admins and the assigned current reviewer. Internal replies notify the assigned doctor through the existing doctor notification table. Notification text omits message bodies and patient information. No email or WhatsApp messages are sent by this implementation.

## Verification and migration

`node scripts/verify-case-communication.cjs` makes a recovery archive, restores a disposable local database, tests the additive migration twice, then tests authorization, case isolation, replies/references, retries/concurrency, notifications, immutable history, pagination, late transaction ordering and retention of existing patient records. Fixtures are confined to the disposable database. `--ui` adds real doctor/internal browser exchanges and responsive checks. `--apply` applies the local migration only after all requested checks pass. Test databases and the test server are removed afterward.

For an external Playwright installation, set `APPROVAL_PLAYWRIGHT_PATH`. `COMMUNICATION_SCREENSHOT_DIR` optionally records the browser result. The optional test server uses localhost port 3129 and the existing test build directory.

Active internal clinical staff and appropriate case assignments must be configured through existing administration. Existing private document-download and large-file storage policies continue to apply.

Run the local application with `npm run dev` (or `npm run dev:local`); both bind to `127.0.0.1`. This communication and assignment workflow is intended for localhost development and is not configured for hosted deployment.

## Design references

[Cympha case-team chat](https://www.cympha.com/docs/talk-to-the-case-team-in-chat) informed keeping participants and messages attached to the specific case. [Dynamics 365 Active Conversation](https://learn.microsoft.com/en-us/dynamics365/customer-service/use/oc-customer-summary) informed showing case context beside conversation and timeline history. These are workflow references; this feature does not connect to those products.
