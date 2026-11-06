---
id: "EPIC-018"
title: "Background jobs, observability and recovery"
type: "epic"
status: "backlog"
phase: "B onward · Cross-cutting"
depends_on: ["EPIC-002", "EPIC-017"]
prd_requirements: ["Blueprint §2.3", "Blueprint §14", "Blueprint §16.2", "Blueprint §18.3", "Blueprint §19.2"]
risk: "high"
assignee: "Unassigned"
summary: "Operate bounded workers, cron, metrics and recovery procedures without weakening booking correctness."
---

# EPIC-018 — Background jobs, observability and recovery

## Objective

Operate bounded workers, cron, metrics and recovery procedures without weakening booking correctness.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 2.3, 14, 16.2, 18.3, 19.2. Delivery stage: B onward · Cross-cutting. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Outbox dispatch/retry/dead-letter operational framework
- pg_cron scheduling for safe-expiry sweep, review reconciliation, offer expiry and retention
- Structured logs, request traces, Sentry and queue/payment/lock metrics
- Health/readiness, worker heartbeat/failure visibility, backup and restore rehearsal
- Pilot performance targets measured in staging rather than claimed as results

## Out of scope

Microservice migration, guessed hosting scale and availability/latency claims without measurements.

## Business rules

- Cron is a freshness aid; hold requests still resolve safe expiry transactionally
- Concurrent/restarted jobs must be idempotent and bounded
- Notification failures cannot roll back committed reservations
- Network calls are outside inventory locks
- Blueprint targets: p95 availability reads 300–500 ms and uncontended hold 500–800 ms; not achieved results

## Data and API changes

Worker scheduling/configuration and indexes on pending inbox/outbox/review/offer work; bounded attempt counts, next attempt time, dead-letter reason. Exact claim/lease mechanism is engineering design.

Operational endpoints, metrics and alert destinations require deployment-specific contracts. Customer-visible state comes through canonical booking/payment/offer APIs.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Workers use internal least-privilege identity; metrics/log endpoints require operational access. Cron and backup secrets never enter public contracts.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Implement job claim/retry/timeout/backoff conventions
- [ ] T02 Wire feature sweeps only after their owning epic is implemented
- [ ] T03 Instrument hold conflicts, lock waits, review age, outbox age and error rates
- [ ] T04 Write gateway/cron/realtime/worker outage playbooks
- [ ] T05 Rehearse backup restore and migration recovery
- [ ] T06 Measure pilot latency and concurrency under stated environment

## Acceptance criteria

- [ ] Delayed cron does not allow overlapping protected allocation
- [ ] A poison job reaches attempt cap/dead-letter with visible reason
- [ ] Worker restart does not duplicate logical refund/offer action
- [ ] Gateway/realtime outage has a documented recovery path
- [ ] Restore rehearsal recovers coherent allocations/payment evidence
- [ ] SLOs are recorded with environment and measurements

## Required verification

- Pause cron and kill workers during synthetic flows
- Inject DB/provider timeouts and inspect bounded retry behavior
- Restore synthetic backup and reconcile invariant counts
- Load-test with lock/latency/error metrics and report actual results

## Dependencies and execution gate

Prerequisites: EPIC-002, EPIC-017.

Feature jobs are safe to rerun and operational failures are observable and recoverable.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unlimited retries can overload providers or hide permanent failures
- Unrestored backups are not evidence of recoverability

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
