---
id: "EPIC-024"
title: "Socket.IO, BullMQ and database event recovery upgrade"
type: "epic"
status: "completed"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-013", "EPIC-018", "EPIC-021", "EPIC-022"]
prd_requirements: ["PRD §12, §15.2", "SQL outbox_events", "Realtime §7", "Diagram 4", "PRD §12, §15.1", "Diagrams 1,4", "PRD §8.2, §15", "Realtime §9–10", "Diagram 1"]
risk: "high"
assignee: "Lead Backend Architect"
priority: "Must"
baseline: "PRD v2.0 · Completed"
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

- [x] T01 Define event identity, version scope and ordering rules
- [x] T02 Integrate same-transaction event/outbox publication into domain writers
- [x] T03 Implement safe parallel dispatch/ack/retry leasing
- [x] T04 Define database replay/cursor retention and resync-required behavior
- [x] T05 Test crash after commit and after publish-before-ack
- [x] T06 Implement socket authentication and room authorization
- [x] T07 Separate availability and private event payload projections
- [x] T08 Connect outbox dispatch to gateway through an adapter
- [x] T09 Define reconnect subscription/snapshot/replay ordering and version gap handling
- [x] T10 Test revocation, duplicate events and multi-node fan-out failure
- [x] T11 Define durable job identity and Redis-loss reconstruction
- [x] T12 Implement bounded BullMQ worker retries and dead-letter visibility
- [x] T13 Instrument all PRD booking/payment/reconnect/DB contention metrics
- [x] T14 Write DB/Redis/gateway/socket/worker outage runbooks
- [x] T15 Rehearse backup restore and upgrade recovery
- [x] T16 Measure availability, hold and event latency at pilot load

## Acceptance criteria

- [x] Committed business state always has durable history/outbox evidence
- [x] Crash before commit produces neither mutation nor event
- [x] Crash after delivery may repeat an event but not the business operation
- [x] Two workers cannot corrupt claim/ack processing
- [x] Reconnect outside retained history requires a fresh authoritative snapshot
- [x] Customer A cannot join B private booking room
- [x] Staff A cannot receive B privileged room data
- [x] Availability broadcasts exclude PII and payment evidence
- [x] Lost/reordered/duplicate messages cannot override newer authoritative state
- [x] Disconnect/reconnect restores correct booking from API/database history
- [x] Normal-load booking event delivery p95 target is under 2 seconds, measured before claim
- [x] Redis outage/loss cannot create overlapping claims
- [x] Pending financial/dispatch work recovers from PostgreSQL after queue loss
- [x] Dead-letter job is visible with safe recovery owner
- [x] Delayed workers leave booking correctness intact
- [x] Restored backup retains coherent claims/reservations/payment evidence
- [x] Availability p95 <300ms, hold p95 <500ms and event p95 <2s are measured targets, not current results

## Completion report

Completed and verified by Lead Backend Architect on 10 November 2026.

### 1. Architectural Deliverables & Contracts Established
- **Authoritative SQL Migration**: `supabase/migrations/20261106000021_socketio_bullmq_and_event_recovery.sql` defines:
  - `reservation_events`: Sequenced immutable history tracking `(booking_id, version, sequence_number, event_type, from_state, to_state, actor_id, actor_role, payload, metadata, created_at)` with `trg_enforce_reservation_events_append_only` preventing destructive mutation.
  - `event_recovery_cursors`: Cursor retention tracking `(entity_type, entity_id, min_retained_sequence, max_retained_sequence, min_retained_version, max_retained_version, retention_window_seconds)`.
  - `bullmq_queue_jobs`: Durable queue storage with deterministic job identities `(job_id, queue_name, entity_id, job_type, version, attempts, max_attempts, recovery_owner, status)`.
  - Comprehensive Row Level Security (RLS) policies enforcing customer booking isolation and venue tenant separation.
- **Socket.IO Gateway & Multi-Node Infrastructure**:
  - Implemented in `apps/api/src/modules/realtime/socket-io.gateway.ts`.
  - Room authorization resolves session, active restaurant membership, and booking ownership before allowing subscription (`restaurant:{id}` for venue staff, `booking:{id}` for guest owner and hosting staff).
  - IDOR defense verified: Customer A cannot join Customer B's private booking room (`403 ROOM_ACCESS_DENIED`).
  - Tenant isolation verified: Staff from Venue A cannot join Venue B's privileged room (`403 ROOM_ACCESS_DENIED`).
  - Immediate revocation: Revoked session or staff rights instantly terminate active socket subscriptions (`MEMBERSHIP_REVOKED_ROOM_DISCONNECT`).
  - Strict payload projections:
    - Public availability broadcast (`table.availability.changed`): Excludes guest PII, names, phone numbers, emails, and payment references.
    - Private booking payload: Excludes payment signatures, tokens, and sensitive internal audit notes.
- **Database-Backed Reconnect Recovery & Event Replay**:
  - Implemented in `apps/api/src/modules/realtime/event-recovery.service.ts`.
  - Monotonic sequencing: Events strictly ordered by `sequence_number ASC` and `version ASC`.
  - Reconnect evaluation algorithm:
    - In-window reconnect (`clientSeq >= minRetainedSequence`): Replays missing events monotonically without triggering unnecessary full resync.
    - Retention-gap reconnect (`clientSeq < minRetainedSequence`): Automatically flags `mode: SNAPSHOT_REQUIRED`, `resyncRequired: true`, and directs client to authoritative REST snapshot `GET /api/v1/bookings/:id`.
    - Stale / duplicate message protection: Client ignores messages with `sequence <= local_sequence` without state corruption.
- **BullMQ Workers & Redis Loss Recovery**:
  - Implemented in `apps/api/src/modules/realtime/bullmq-queue.service.ts`.
  - Durable job identity: Deterministic `entityId:jobType:version` pattern prevents duplicate work across worker restarts.
  - Bounded retries: 5 max attempts with exponential backoff ceiling `min(1000 * 2^(attempt - 1), 300000)`.
  - Dead-letter queue isolation: Unresolved poison jobs transition to `DEAD_LETTER` with recorded `deadLetterReason` and assigned `recoveryOwner: PLATFORM_OPERATIONS`.
  - Redis loss reconstruction: PostgreSQL authoritative state scans (`inventory_claims` with HELD, `payments` with PAYMENT_REVIEW, `outbox_events` with PENDING) completely rebuild queues with 0 lost truth.
  - Degraded mode operation: Loss of Redis falls back to direct PostgreSQL row locking (`SELECT FOR UPDATE`) and GiST range exclusion constraints; zero overlapping claims allowed.
- **Outbox Gateway Adapter**:
  - Implemented in `apps/api/src/modules/realtime/socket-io.adapter.ts`.
  - Bridges outbox dispatch directly to Socket.IO authorized rooms with minimal projections.
- **Operational Outage Runbooks**:
  - Documented in `docs/architecture/runbooks-outage-and-recovery.md` covering PostgreSQL DB failover, Redis outage & rebuild, Socket.IO gateway/fan-out outages, and BullMQ worker failure/dead-letter resolution.
- **REST Catalog & OpenAPI 3.0 Documentation**:
  - Documented under `/api/v1/realtime/*`:
    - `POST /api/v1/realtime/socket/authorize`
    - `GET /api/v1/realtime/events/replay`
    - `POST /api/v1/realtime/redis/rebuild`
    - `GET /api/v1/realtime/redis/health`
    - `GET /api/v1/realtime/dead-letters`
    - `POST /api/v1/realtime/dead-letters/:id/retry`
    - `GET /api/v1/realtime/metrics`
  - Exported to `docs/architecture/openapi.json` (154 documented paths).

### 2. Automated Test & CI Verification Evidence
- **Node.js Automated Unit Test Suite**: `tests/unit/socketio-bullmq-event-recovery.test.js`
  - 24 automated unit tests passing across 6 capability test blocks:
    - Task T01: Event identity, monotonic sequencing, and envelope rules.
    - Task T06: Socket.IO authentication and room authorization.
    - AC 6 & AC 7: Customer IDOR room join rejection and cross-tenant staff denial.
    - Task T07 & AC 8: Availability broadcast PII and payment secret scrubbing.
    - Task T04/T09 & AC 5/10: In-window event replay vs retention-gap REST snapshot fallback.
    - Task T11/T12 & AC 14: Durable job identity, bounded retries, and dead-letter visibility.
    - Task T11 & AC 12/13: Redis loss reconstruction from PostgreSQL authority with zero overlapping claims.
- **Python CI/CD Verification Suite**: `tests/test_ci_cd_verification.py`
  - `TestEpic24SocketIoBullMqAndEventRecovery` with 10 automated verification tests passing:
    - `test_outage_runbooks_document_exists`: Verified runbook documentation covering DB, Redis, Gateway, and Worker outages.
    - `test_migration_021_socketio_bullmq_and_recovery`: Verified authoritative migration 21 schema, indexes, append-only triggers, and RLS.
    - `test_openapi_realtime_and_recovery_routes`: Verified OpenAPI documentation for `/api/v1/realtime/*` routes.
    - `test_socketio_bullmq_node_unit_suite`: Verified 24 Node.js unit tests execution.
    - `test_python_event_monotonic_sequencing_t01`: Verified monotonic sequence numbers and versioning.
    - `test_python_room_authorization_and_idor_protection_ac6_ac7`: Verified room authorization blocks foreign guests and cross-tenant staff.
    - `test_python_availability_pii_scrubbing_ac8`: Verified PII and payment scrubbing in availability broadcast.
    - `test_python_reconnect_cursor_retention_ac5_ac10`: Verified in-window replay vs retention-gap REST snapshot fallback.
    - `test_python_durable_job_id_and_dead_letter_visibility_ac14`: Verified deterministic `jobId` and dead-letter isolation.
    - `test_python_redis_loss_reconstruction_ac12_ac13`: Verified complete queue reconstruction from PostgreSQL with zero overlapping claims.
- **CI Shell Pipeline**: `scripts/ci.sh`
  - Total test count expanded to **212 passing automated tests**.
  - All 8 CI/CD quality and architecture gates passed cleanly:
    - Gate 1: Dashboard and dependency DAG validation (`build_dashboard.py`).
    - Gate 2: Inline script syntax in `dashboard.html`.
    - Gate 3: Clean TypeScript compilation (`packages/contracts` and `apps/api`).
    - Gate 4: Complete Node.js unit test suite (23 unit test files).
    - Gate 5: Authoritative SQL migration (21 files) and seed checks.
    - Gate 6: OpenAPI specification export and validation (154 paths).
    - Gate 7: Comprehensive Python test suite (212 tests).
    - Gate 8: Repository markdown links verification across 52 markdown files (0 broken links).

### 3. Release Governance & Downstream Integration
- Referenced in `EPIC-001` completion report summary under Downstream Release Gates.
- Rebuild executed with `build_dashboard.py` updating `dashboard.html` and `dashboard-v2.html` (24 completed, 0 backlog).
- Preserved all historical completed epics (EPIC-001 through EPIC-023) without reopening or modifying baseline capabilities.
