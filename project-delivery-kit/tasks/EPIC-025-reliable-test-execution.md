---
id: "EPIC-025"
title: "Reliable test execution and fail-closed CI"
type: "epic"
status: "completed"
phase: "R1 · Verification foundation"
depends_on: ["EPIC-019"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "20 Python wrappers failed because they expected nested pass counts but default Node 24.18.0 execution reported one pass per file."
---

# EPIC-025 — Reliable test execution and fail-closed CI

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

20 Python wrappers failed because they expected nested pass counts but default Node 24.18.0 execution reported one pass per file. Explicit non-isolated execution ran 424 cases successfully. The npm OR fallback could hide a failed Node suite behind a passing Python suite.

## Evidence and affected surfaces

- [tests/test_ci_cd_verification.py](../../tests/test_ci_cd_verification.py)
- [package.json](../../package.json)
- [scripts/ci.sh](../../scripts/ci.sh)
- Historical Python audit log: `/tmp/dine-audit-python-tests.log`; failure matrix preserved in REFERENCE-remediation.md.

## Implementation tasks

- [x] T01 Use one Node runner for npm, CI and Python with explicit TAP and supported isolation mode.
- [x] T02 Reject file-only summaries, failed, skipped, cancelled or empty suites; preserve expected per-suite count assertions with anchored TAP matching.
- [x] T03 Replace OR fallback with build AND Node AND Python; retain nonzero subprocess exit codes.
- [x] T04 Regression-test intentional assertion failure, skipped tests and empty files so the harness cannot manufacture success.
- [x] T05 Allow additive epic records while asserting all original 24 completed identities and both dashboard outputs survive.
- [x] T06 Record full rerun commands and results in TEST-EVIDENCE.md; separate unit/static evidence from external integration readiness.

## Acceptance criteria

- [x] All previously failing 20 wrappers pass with their original expected nested counts.
- [x] Full Node suite executes at least 424 cases, with zero failures or skipped cases.
- [x] Full Python discovery succeeds including harness and status-preservation regressions.
- [x] An intentional failing fixture, skipped fixture and empty fixture each return nonzero.
- [x] Both dashboard URLs contain identical bytes and preserve EPIC-001–024 completion records.
- [x] All eight local CI gates pass without representing migration file checks as live DB tests.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-019. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.

## Completion report — 2026-11-10

All six tasks and acceptance criteria verified. `npm run ci` passed all eight local gates; Node executed 424 tests with zero failures/skips; Python ran 218 tests with zero failures, including all 20 formerly failing wrappers and negative harness regressions. TypeScript build and ValidationPipe construction passed. Exact counts were retained, not relaxed. See [test evidence](TEST-EVIDENCE.md) and stored logs for scope and remaining real integration gates.
