# Module 47 — installed baseline

27 October 2026

The existing local Allen website now includes `/customer-service`, with entry points in the main menu, contact page, search, doctor sidebar and doctor case page. Doctor, clinic and Owner route aliases are included.

## Working baseline

- PostgreSQL ticket intake with retry protection, automatic initial priority, accountable Customer Service team and assigned staff owner.
- Existing authenticated doctor/clinic accounts can view their own requests. Only the configured Owner has initial supervisory access; the Owner grants service roles to active HR or employee accounts. Agents see assignments; supervisors see the full service queue.
- Validated doctor-owned case links and case timeline entries for ticket creation, resolution, closure and reopening.
- Public conversation, private staff notes, protected ownership/priority actions, state transitions, customer confirmation/reopening and recorded audit events.
- Optional, versioned response/resolution targets configured by a supervisor. No example research deadlines were activated. This baseline measures 24/7 elapsed time; waiting does not pause it, and priority changes retain existing deadlines.
- SLA breaches produce durable escalation entries, with supervisor acknowledgement and a recorded next action. Quality complaints require a supervisor-recorded handoff/assessment reference before support resolution; this is not a complete QMS integration.

## Operations

The Owner signs in through the existing HR login, opens Customer Service → Service settings, authorizes service staff, and configures approved targets for each priority. Existing unconfigured tickets require the explicit Apply targets action. Staff accept operational accountability through supervisor assignment; a two-party offer/accept handoff is not implemented in this baseline.

`scripts/customer-service-migrate.cjs --apply` applies the additive schema. `scripts/customer-service-worker.cjs` processes overdue service targets and can be connected to the approved deployment scheduler later. No scheduled task was installed. Active staff screens refresh escalation processing every minute; mutations also process deadlines. Always-on processing while the website is idle still requires scheduling the worker. No email/SMS delivery is implied; replies and escalations are available in the portal.

The migration creates only Module 47 tables/indexes and its deadline function. Existing records were not replaced. Modified source files were backed up in this chat's working folder.

## Validation

- TypeScript check passed after correcting narrowing errors.
- Six policy tests passed.
- Twenty PostgreSQL-backed acceptance checks passed, including intake idempotency, requester isolation, private-note filtering, stale-write rejection, ownership, first response, priority/deadline preservation, escalation deduplication, resolution/reopening history and premature quality closure rejection. All temporary test records were rolled back.
- Header/footer and module CSS parsed successfully.
- A browser preview attempt timed out. Visual review and authenticated browser interaction remain unverified; no production deployment was performed.

## Remaining research-plan scope

Business-hour/holiday calendars and pause semantics; automatic email intake/notifications; always-on worker scheduling; two-party ownership handoffs; shared M51/M60–64 adapters; full QMS/approval integration; controlled attachment embedding; granular clinic participant sharing; expanded dashboards; durable outbound integrations; recovery/load/UAT/release evidence. These remain separate follow-on work, not completed capabilities.

## Requested visual changes

The header was returned to white with dark labels and a subtle glass/glow treatment. The footer now has a matching white glass surface, soft purple glow, rounded border, highlight line and accessible link/focus styling. Existing logo, content and menu structure are retained.
