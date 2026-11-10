---
id: "EPIC-028"
title: "One persistent inventory engine and real PostgreSQL concurrency"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-026", "EPIC-027"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "critical"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Original SQL-backed allocations coexist with an in-memory v2 state."
---

# EPIC-028 — One persistent inventory engine and real PostgreSQL concurrency

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Original SQL-backed allocations coexist with an in-memory v2 state. The original hold uses 15 minutes; finalized policy requires 120 seconds without payment-driven extension. Recovery code names tables absent from the active schema, and file-only migration checks never exercise exclusion constraints or RLS.

## Evidence and affected surfaces

- [apps/api/src/modules/reservations/reservations.service.ts](../../apps/api/src/modules/reservations/reservations.service.ts)
- [apps/api/src/modules/v2-compatibility/v2-compatibility.service.ts](../../apps/api/src/modules/v2-compatibility/v2-compatibility.service.ts)
- [supabase/migrations](../../supabase/migrations)
- [supabase/tests/db_test.sql](../../supabase/tests/db_test.sql)

## Implementation tasks

- [ ] T01 Choose one additive migration/backfill plan for physical tables, bookings, holds, claims, payments and blocks; preserve original data and migration history.
- [ ] T02 Make manual selection, automatic recommendation, staff walk-ins and blocks call the same PostgreSQL transaction; remove authoritative in-memory state/default_user.
- [ ] T03 Enforce half-open protected ranges and GiST overlap exclusion for HELD/RESERVED/BLOCKED; validate FK, ownership and table/restaurant consistency.
- [ ] T04 Calculate expiry from authoritative DB time after locks: default 120 seconds, validated configured bounds, no implicit extension during pending/unknown payment.
- [ ] T05 Serialize expiry, confirmation, cancellation and reallocation on the same resource; keep unknown financial state separate from released inventory.
- [ ] T06 Apply every migration in a fresh real PostgreSQL environment with explicit Supabase auth/RLS support and exercise restore/backfill compatibility.
- [ ] T07 Run 100 separate concurrent DB sessions plus manual/automatic/block/walk-in races, crash/retry and boundary/timezone scenarios.

## Acceptance criteria

- [ ] Exactly one winner for 100 overlapping independent DB attempts; losers receive documented conflict.
- [ ] Adjacent non-overlapping ranges succeed; buffer overlaps and blocks conflict.
- [ ] At 120 seconds an expired hold cannot be confirmed and payment does not extend its lease.
- [ ] A late payment never steals a replacement customer claim.
- [ ] Restart preserves ownership, idempotency responses and expiry state.
- [ ] Migrations, FK, RLS and exclusion controls pass executable insert/update tests; sequential simulations are insufficient.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-026, EPIC-027. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
