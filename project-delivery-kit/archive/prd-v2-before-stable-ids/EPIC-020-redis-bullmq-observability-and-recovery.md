---
id: "EPIC-020"
title: "Redis, BullMQ, observability and recovery"
type: "epic"
status: "backlog"
phase: "B onward · Cross-cutting"
depends_on: ["EPIC-002", "EPIC-019"]
prd_requirements: ["PRD §8.2, §15", "Realtime §9–10", "Diagram 1"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Operate Redis/BullMQ workers and measure reliability while preserving database authority through failures."
---

# EPIC-020 — Redis, BullMQ, observability and recovery

## Objective

Operate Redis/BullMQ workers and measure reliability while preserving database authority through failures.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §8.2, §15; Realtime §9–10; Diagram 1.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · B onward · Cross-cutting. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- BullMQ hold-expiry, payment-reconciliation and notification/outbox worker boundaries
- Redis cache/fan-out/queue use with DB-backed rebuild and degraded behavior
- Metrics, structured traces, error reporting and bounded retries/dead letters
- Docker deployment, backup/restore, migration recovery and incident runbooks

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Loss of Redis cannot transfer ownership, confirm a booking or erase financial truth
- Delayed expiry job does not block safe request-time expired-claim cleanup
- A lost queue task is reconstructible from durable database state
- No exact SLO claim is made until staging load is defined/measured
- Reconciliation must track unresolved money to terminal resolution despite retry escalation

## Data and API changes

Add recoverable pending work/lease/attempt metadata and DB scanning cursors; Redis keys/job IDs are implementation details, not inventory source. Source metrics include contention, conflicts, expiries, confirmation latency and WebSocket reconnects.

Health/readiness/metrics endpoint contracts are deployment-specific and access-controlled. No raw secrets in telemetry.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define durable job identity and Redis-loss reconstruction
- [ ] T02 Implement bounded BullMQ worker retries and dead-letter visibility
- [ ] T03 Instrument all PRD booking/payment/reconnect/DB contention metrics
- [ ] T04 Write DB/Redis/gateway/socket/worker outage runbooks
- [ ] T05 Rehearse backup restore and upgrade recovery
- [ ] T06 Measure availability, hold and event latency at pilot load

## Acceptance criteria

- [ ] Redis outage/loss cannot create overlapping claims
- [ ] Pending financial/dispatch work recovers from PostgreSQL after queue loss
- [ ] Dead-letter job is visible with safe recovery owner
- [ ] Delayed workers leave booking correctness intact
- [ ] Restored backup retains coherent claims/reservations/payment evidence
- [ ] Availability p95 <300ms, hold p95 <500ms and event p95 <2s are measured targets, not current results

## Required verification

- Redis flush/outage and worker process crash injection
- Delayed expiry and payment reconciliation rebuild
- Synthetic backup/restore and failure/latency load runs

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-002, EPIC-019.

Infrastructure failure is recoverable with no inventory ownership inferred from Redis.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
