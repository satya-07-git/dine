---
id: "EPIC-035"
title: "Real BullMQ workers, Redis and durable outbox recovery"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-026", "EPIC-028"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Current queue stores memoryJobs, does not instantiate BullMQ Queue/Worker and silently falls back on database errors."
---

# EPIC-035 — Real BullMQ workers, Redis and durable outbox recovery

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Current queue stores memoryJobs, does not instantiate BullMQ Queue/Worker and silently falls back on database errors. Reconstruction queries use absent tables and can synthesize sample jobs, falsely reporting successful recovery.

## Evidence and affected surfaces

- [apps/api/src/modules/realtime/bullmq-queue.service.ts](../../apps/api/src/modules/realtime/bullmq-queue.service.ts)
- [docker-compose.yml](../../docker-compose.yml)
- [apps/api/src/modules/realtime](../../apps/api/src/modules/realtime)

## Implementation tasks

- [ ] T01 Wire real BullMQ/Redis queue and workers with production dependency/configuration checks and local Redis service.
- [ ] T02 Keep PostgreSQL outbox/state authoritative; define atomic dispatcher claim leases, bounded retries, stable job IDs and dead-letter inspection.
- [ ] T03 Reconstruct expiry/reconciliation/notification jobs from actual active migration schema; remove generated sample recovery jobs and swallowed durable errors.
- [ ] T04 Make worker state transitions idempotent and persist acknowledgements; delayed/replayed jobs recheck current DB state.
- [ ] T05 Handle Redis loss by restoring derived jobs from PostgreSQL without losing bookings or inventing deliveries.
- [ ] T06 Test worker kill before/after side effect, parallel dispatchers, poisoned jobs, Redis flush/restart and backlog drainage.

## Acceptance criteria

- [ ] Actual Redis/BullMQ contains queued work and a real worker consumes it.
- [ ] No DB failure reports successful reconstruction from synthetic jobs.
- [ ] Redis loss and process restart recover all required jobs from persisted state.
- [ ] Duplicate jobs and concurrent workers cannot duplicate financial/booking side effects.
- [ ] Committed outbox events survive publish crashes and expose retry/dead-letter metrics.
- [ ] Health/readiness distinguishes unavailable queue from healthy database and no mock fallback.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-026, EPIC-028. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
