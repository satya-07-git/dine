---
id: "EPIC-017"
title: "Socket.IO authorized rooms and reconnect recovery"
type: "epic"
status: "backlog"
phase: "F · Operations"
depends_on: ["EPIC-004", "EPIC-016"]
prd_requirements: ["PRD §12, §15.1", "Realtime §7", "Diagrams 1,4"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Broadcast availability and private booking updates with authenticated rooms and database-backed recovery."
---

# EPIC-017 — Socket.IO authorized rooms and reconnect recovery

## Objective

Broadcast availability and private booking updates with authenticated rooms and database-backed recovery.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §12, §15.1; Realtime §7; Diagrams 1,4.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · F · Operations. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Socket.IO gateway and authorized restaurant:{id}/booking:{id} room subscriptions
- Separate public-safe availability broadcast from private customer booking payload
- Monotonic booking version, duplicate/stale handling and reconnect snapshot/replay
- Redis adapter/fan-out support only where needed for multi-instance delivery

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Room names are not access control; server resolves session/membership/booking ownership
- All subscriptions are authorized; define availability audience explicitly
- Never emit a booking confirmation before the DB commit
- Socket messages are hints; reconnect always restores PostgreSQL-backed canonical state
- An event version gap or replay retention gap triggers refresh, not a false state transition
- Revoked staff/session rights cannot persist indefinitely in private subscriptions

## Data and API changes

Reuse reservation versions/history and durable outbox/replay index. Define restaurant availability version/cursor independently of per-booking version where needed.

Authorized Socket.IO rooms restaurant:{id}, booking:{id}; events table.availability.changed,hold.created,hold.expired,booking.confirmed,booking.cancelled,booking.checked_in,booking.seated,booking.completed; REST /bookings/:id remains truth.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Implement socket authentication and room authorization
- [ ] T02 Separate availability and private event payload projections
- [ ] T03 Connect outbox dispatch to gateway through an adapter
- [ ] T04 Define reconnect subscription/snapshot/replay ordering and version gap handling
- [ ] T05 Test revocation, duplicate events and multi-node fan-out failure

## Acceptance criteria

- [ ] Customer A cannot join B private booking room
- [ ] Staff A cannot receive B privileged room data
- [ ] Availability broadcasts exclude PII and payment evidence
- [ ] Lost/reordered/duplicate messages cannot override newer authoritative state
- [ ] Disconnect/reconnect restores correct booking from API/database history
- [ ] Normal-load booking event delivery p95 target is under 2 seconds, measured before claim

## Required verification

- Unauthorized room joins and membership revocation
- Offline client, server restart and missed sequence replay tests
- Multi-instance/fan-out outage tests where deployed

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-004, EPIC-016.

Authorized two-client status convergence works after disconnection and restart.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
