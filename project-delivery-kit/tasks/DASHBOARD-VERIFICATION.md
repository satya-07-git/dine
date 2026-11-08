# Completion-preservation root fix

Both dashboard.html and dashboard-v2.html now use the same active EPIC-*.md records and produce identical output bytes. No archive is used as a separate live status source.

## Corrected source state

- EPIC-001–020: original IDs, original titles, original assignees/checklists/completion reports, all completed.
- EPIC-021–024: additive finalized-v2 upgrades, all backlog.
- Total: 24 epics, 20 completed, 4 backlog, 0 blocked.
- Original completion reports remain active, not merely hidden in archived pages.
- Four source diagrams and finalized architecture/API/database references remain available.

## Verified

- Regression test verifies every original identity/title/completion report is preserved in the active source.
- Regression test rebuilds twice and verifies both public filenames remain identical, all 20 completed IDs survive, and every embedded status matches its Markdown source.
- Existing builder and inline JavaScript checks pass.
- Command: python3 -m unittest tests.test_dashboard_completion_preservation tests.test_ci_cd_verification.TestDashboardAndTasks -v
- Result: 4 tests passed.
- Actual browser verification on dashboard-v2.html: summary shows Completed 20; Completed filter shows 20 of 24 epics with 20 cards; board shows Completed 20 and Backlog 4.

These are dashboard/status checks. They do not add backend implementation, execute migrations or claim new v2 runtime verification. The root cause was reused epic identities and divergent output datasets; both have been removed.
