# Clinical Planning Queue

Clinical Leads and authorized Clinical Administrators open `/clinical/assignment-board` from the existing clinical navigation. Reviewers continue to use their assigned-only work queue.

The queue lists each submitted case's latest open review, with planner, workload, priority, due date, review status and overdue state. Filters run against the complete eligible queue before pagination. Cards show complete totals; matching results use stable 50-row pages. Invalid page/filter values use safe defaults, and pages beyond the end clamp to the final page. Overdue status uses the database's current date, consistent with the existing queue.

Assignments reuse `clinicalUpdate`: current case/review locks, current plan/revision checks, qualified-active-reviewer validation, Clinical Lead restrictions on escalations and immutable clinical audit. No duplicate assignment system or schema is introduced. The existing nullable `ClinicalReview.dueDate` column remains unchanged.

Saving shows a pending state and returns to the same filter/page with visible confirmation. Stale, invalid and inaccessible reviews show actionable errors. Missing revisions are rejected rather than converted to zero. Successful saves invalidate both the planning board and reviewer work queue.

If no eligible planners exist, the board explains that authorized clinical staff must configure them. The board does not fabricate employee accounts or case records.

## Verification

`node scripts/verify-planning-queue.cjs` backs up the local Allen database, restores a disposable copy, creates isolated staff/case fixtures and checks queue counts, pagination, filtering beyond 200 rows, authorization, assignment/date persistence, stale submissions and audit deduplication. The disposable database is removed afterward; live application data is unchanged.

Add `--ui` for desktop/tablet/mobile headless Edge checks and a real browser assignment submission. Supply `APPROVAL_PLAYWRIGHT_PATH` if Playwright is outside project dependencies. The optional test server uses localhost port 3128 and the existing test build directory, then terminates its own process tree.
