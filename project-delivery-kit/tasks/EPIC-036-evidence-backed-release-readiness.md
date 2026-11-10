---
id: "EPIC-036"
title: "Evidence-backed release gates, performance and pilot readiness"
type: "epic"
status: "backlog"
phase: "R3 · Release evidence"
depends_on: ["EPIC-025", "EPIC-026", "EPIC-027", "EPIC-028", "EPIC-029", "EPIC-030", "EPIC-031", "EPIC-032", "EPIC-033", "EPIC-034", "EPIC-035"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Hardcoded VERIFIED statuses, sequential concurrency simulations and preset restore flags can overstate readiness."
---

# EPIC-036 — Evidence-backed release gates, performance and pilot readiness

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Hardcoded VERIFIED statuses, sequential concurrency simulations and preset restore flags can overstate readiness. Migration dry-run validates files only. Real throughput, restored data, external providers and merchant policies have no attached execution evidence.

## Evidence and affected surfaces

- [apps/api/src/modules/release-verification/release-verification.service.ts](../../apps/api/src/modules/release-verification/release-verification.service.ts)
- [scripts/migrate.js](../../scripts/migrate.js)
- [supabase/tests/db_test.sql](../../supabase/tests/db_test.sql)
- [docs/policies/commercial-policy-register.md](../../docs/policies/commercial-policy-register.md)

## Implementation tasks

- [ ] T01 Replace static VERIFIED with evidence records: environment, revision, migration version, command, timestamp, outcome and artifact; missing evidence is NOT_RUN.
- [ ] T02 Separate unit/static, real PostgreSQL, provider sandbox, transport integration, load, recovery and production approval gates; prevent simulation endpoints granting production readiness.
- [ ] T03 Measure availability p95 under 300 ms, hold p95 under 500 ms and event latency under two seconds under a defined repeatable workload; report failures as measured.
- [ ] T04 Perform real backup restore into isolated DB and verify bookings, claims, ledger, outbox, RLS and replay; record recovery objectives and actual durations.
- [ ] T05 Approve cancellation/no-show/deposit/refund/privacy-retention policies; settle merchant-of-record/fund-flow ownership and Razorpay eligibility before live keys.
- [ ] T06 Run staging free/deposit journey through developer harness, then hand off React Native/customer and staff product frontend as deferred scope with contract/UAT checklist.
- [ ] T07 Plan limited restaurant pilot with staff recording telephone/walk-in bookings, alert thresholds, rollback and reconciliation runbooks; require approved live activation separately.

## Acceptance criteria

- [ ] No unexecuted gate reports VERIFIED or Passed; evidence is inspectable.
- [ ] Real DB, provider, transport, concurrency and backup gates all succeed in staging.
- [ ] Latency targets are measured with workload and error rates, not copied as results.
- [ ] Restored DB passes consistency and financial reconciliation checks.
- [ ] Financial policies, funds flow and live merchant approval are recorded before real collection.
- [ ] Frontend handoff and pilot gates explicitly reflect their pending/completed evidence; frontend implementation remains separate.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-025, EPIC-026, EPIC-027, EPIC-028, EPIC-029, EPIC-030, EPIC-031, EPIC-032, EPIC-033, EPIC-034, EPIC-035. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
