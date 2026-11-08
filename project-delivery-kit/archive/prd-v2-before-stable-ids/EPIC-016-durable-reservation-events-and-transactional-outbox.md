---
id: "EPIC-016"
title: "Durable reservation events and transactional outbox"
type: "epic"
status: "backlog"
phase: "F · Operations"
depends_on: ["EPIC-012"]
prd_requirements: ["PRD §12, §15.2", "SQL outbox_events", "Realtime §7", "Diagram 4"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Persist reservation events and dispatchable outbox rows in the same transaction as state changes."
---

# EPIC-016 — Durable reservation events and transactional outbox

## Objective

Persist reservation events and dispatchable outbox rows in the same transaction as state changes.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §12, §15.2; SQL outbox_events; Realtime §7; Diagram 4.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · F · Operations. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Sequenced/versioned reservation history and event identity
- Outbox writer inside claim/hold/reservation transaction
- Recoverable dispatcher with claim/lease, retries, dedup and dead-letter visibility
- Database-backed event recovery retention and snapshot fallback contract

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- A committed booking must not lose its logical event on worker/server crash
- At-least-once transport needs eventId/version consumer dedup; do not claim exactly once
- published_at alone does not define safe multi-worker claiming or replay retention
- Keep event history/recovery cursor separate from mutable dispatch acknowledgment
- Payload contains minimum necessary data for the authorized audience

## Data and API changes

outbox_events(id,restaurant_id,aggregate_id,event_type,payload,created_at,published_at); reservation_events with version/actor/state history; claim/lease/attempt/sequence/replay retention fields missing from baseline need design.

Envelope: eventId,eventType,entityId,version,timestamp,payload. Replay/history route is a proposed extension to review; GET /bookings/:id snapshot is the mandatory recovery fallback.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define event identity, version scope and ordering rules
- [ ] T02 Integrate same-transaction event/outbox publication into domain writers
- [ ] T03 Implement safe parallel dispatch/ack/retry leasing
- [ ] T04 Define database replay/cursor retention and resync-required behavior
- [ ] T05 Test crash after commit and after publish-before-ack

## Acceptance criteria

- [ ] Committed business state always has durable history/outbox evidence
- [ ] Crash before commit produces neither mutation nor event
- [ ] Crash after delivery may repeat an event but not the business operation
- [ ] Two workers cannot corrupt claim/ack processing
- [ ] Reconnect outside retained history requires a fresh authoritative snapshot

## Required verification

- Outbox process-death and parallel dispatcher scenarios
- Duplicate/out-of-order consumer event cases
- Retention-gap/replay authorization tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-012.

Durable event recovery is proven independently of Socket.IO delivery.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
