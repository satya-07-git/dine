---
id: "EPIC-024"
title: "Socket.IO, BullMQ and database event recovery upgrade"
type: "epic"
status: "backlog"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-013", "EPIC-018", "EPIC-021", "EPIC-022"]
prd_requirements: ["PRD §12, §15.2", "SQL outbox_events", "Realtime §7", "Diagram 4", "PRD §12, §15.1", "Diagrams 1,4", "PRD §8.2, §15", "Realtime §9–10", "Diagram 1"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0 · New delta"
summary: "Upgrade existing event delivery to authorized Socket.IO rooms, BullMQ/Redis support and database-backed reconnect recovery."
---

# EPIC-024 — Socket.IO, BullMQ and database event recovery upgrade

## Objective

Upgrade existing event delivery to authorized Socket.IO rooms, BullMQ/Redis support and database-backed reconnect recovery.

## Delivered foundation

EPIC-013, EPIC-018, EPIC-021, EPIC-022 remain completed under their original identities. This epic covers only finalized v2 changes and their conformance verification. Inspect and reuse existing code; do not rebuild or reset delivered capabilities.

## Scope and source coverage

The prior renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/. The capability sections below consolidate that draft into additive work with new stable IDs. Source reference files use the same stable IDs. Product frontend remains deferred.

## Capability · Durable reservation events and transactional outbox

### In scope

- Sequenced/versioned reservation history and event identity
- Outbox writer inside claim/hold/reservation transaction
- Recoverable dispatcher with claim/lease, retries, dedup and dead-letter visibility
- Database-backed event recovery retention and snapshot fallback contract

### Business rules

- A committed booking must not lose its logical event on worker/server crash
- At-least-once transport needs eventId/version consumer dedup; do not claim exactly once
- published_at alone does not define safe multi-worker claiming or replay retention
- Keep event history/recovery cursor separate from mutable dispatch acknowledgment
- Payload contains minimum necessary data for the authorized audience

### Data and API changes

outbox_events(id,restaurant_id,aggregate_id,event_type,payload,created_at,published_at); reservation_events with version/actor/state history; claim/lease/attempt/sequence/replay retention fields missing from baseline need design.

Envelope: eventId,eventType,entityId,version,timestamp,payload. Replay/history route is a proposed extension to review; GET /bookings/:id snapshot is the mandatory recovery fallback.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Outbox process-death and parallel dispatcher scenarios
- Duplicate/out-of-order consumer event cases
- Retention-gap/replay authorization tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Socket.IO authorized rooms and reconnect recovery

### In scope

- Socket.IO gateway and authorized restaurant:{id}/booking:{id} room subscriptions
- Separate public-safe availability broadcast from private customer booking payload
- Monotonic booking version, duplicate/stale handling and reconnect snapshot/replay
- Redis adapter/fan-out support only where needed for multi-instance delivery

### Business rules

- Room names are not access control; server resolves session/membership/booking ownership
- All subscriptions are authorized; define availability audience explicitly
- Never emit a booking confirmation before the DB commit
- Socket messages are hints; reconnect always restores PostgreSQL-backed canonical state
- An event version gap or replay retention gap triggers refresh, not a false state transition
- Revoked staff/session rights cannot persist indefinitely in private subscriptions

### Data and API changes

Reuse reservation versions/history and durable outbox/replay index. Define restaurant availability version/cursor independently of per-booking version where needed.

Authorized Socket.IO rooms restaurant:{id}, booking:{id}; events table.availability.changed,hold.created,hold.expired,booking.confirmed,booking.cancelled,booking.checked_in,booking.seated,booking.completed; REST /bookings/:id remains truth.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Unauthorized room joins and membership revocation
- Offline client, server restart and missed sequence replay tests
- Multi-instance/fan-out outage tests where deployed

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Redis, BullMQ, observability and recovery

### In scope

- BullMQ hold-expiry, payment-reconciliation and notification/outbox worker boundaries
- Redis cache/fan-out/queue use with DB-backed rebuild and degraded behavior
- Metrics, structured traces, error reporting and bounded retries/dead letters
- Docker deployment, backup/restore, migration recovery and incident runbooks

### Business rules

- Loss of Redis cannot transfer ownership, confirm a booking or erase financial truth
- Delayed expiry job does not block safe request-time expired-claim cleanup
- A lost queue task is reconstructible from durable database state
- No exact SLO claim is made until staging load is defined/measured
- Reconciliation must track unresolved money to terminal resolution despite retry escalation

### Data and API changes

Add recoverable pending work/lease/attempt metadata and DB scanning cursors; Redis keys/job IDs are implementation details, not inventory source. Source metrics include contention, conflicts, expiries, confirmation latency and WebSocket reconnects.

Health/readiness/metrics endpoint contracts are deployment-specific and access-controlled. No raw secrets in telemetry.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Redis flush/outage and worker process crash injection
- Delayed expiry and payment reconciliation rebuild
- Synthetic backup/restore and failure/latency load runs

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Implementation tasks

- [ ] T01 Define event identity, version scope and ordering rules
- [ ] T02 Integrate same-transaction event/outbox publication into domain writers
- [ ] T03 Implement safe parallel dispatch/ack/retry leasing
- [ ] T04 Define database replay/cursor retention and resync-required behavior
- [ ] T05 Test crash after commit and after publish-before-ack
- [ ] T06 Implement socket authentication and room authorization
- [ ] T07 Separate availability and private event payload projections
- [ ] T08 Connect outbox dispatch to gateway through an adapter
- [ ] T09 Define reconnect subscription/snapshot/replay ordering and version gap handling
- [ ] T10 Test revocation, duplicate events and multi-node fan-out failure
- [ ] T11 Define durable job identity and Redis-loss reconstruction
- [ ] T12 Implement bounded BullMQ worker retries and dead-letter visibility
- [ ] T13 Instrument all PRD booking/payment/reconnect/DB contention metrics
- [ ] T14 Write DB/Redis/gateway/socket/worker outage runbooks
- [ ] T15 Rehearse backup restore and upgrade recovery
- [ ] T16 Measure availability, hold and event latency at pilot load

## Acceptance criteria

- [ ] Committed business state always has durable history/outbox evidence
- [ ] Crash before commit produces neither mutation nor event
- [ ] Crash after delivery may repeat an event but not the business operation
- [ ] Two workers cannot corrupt claim/ack processing
- [ ] Reconnect outside retained history requires a fresh authoritative snapshot
- [ ] Customer A cannot join B private booking room
- [ ] Staff A cannot receive B privileged room data
- [ ] Availability broadcasts exclude PII and payment evidence
- [ ] Lost/reordered/duplicate messages cannot override newer authoritative state
- [ ] Disconnect/reconnect restores correct booking from API/database history
- [ ] Normal-load booking event delivery p95 target is under 2 seconds, measured before claim
- [ ] Redis outage/loss cannot create overlapping claims
- [ ] Pending financial/dispatch work recovers from PostgreSQL after queue loss
- [ ] Dead-letter job is visible with safe recovery owner
- [ ] Delayed workers leave booking correctness intact
- [ ] Restored backup retains coherent claims/reservations/payment evidence
- [ ] Availability p95 <300ms, hold p95 <500ms and event p95 <2s are measured targets, not current results

## Completion report

New v2 delta pending. The original 20 completed epics are not reopened by this work. Record actual changed code/migrations, commands and results here when these deltas are implemented. No new backend test result is claimed by a planning/status correction.
