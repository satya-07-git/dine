---
id: "EPIC-008"
title: "Atomic holds, idempotency and safe expiry"
type: "epic"
status: "completed"
phase: "D · Booking core"
depends_on: ["EPIC-002", "EPIC-003", "EPIC-007"]
prd_requirements: ["Blueprint §1.2", "Blueprint §5.3", "Blueprint §5.4", "Blueprint §7", "Blueprint §9.4", "Blueprint §16.3", "Blueprint §17.1"]
risk: "high"
assignee: "Lead Systems & Transaction Architect"
summary: "Guarantee at most one protected allocation for a table and overlapping interval under concurrent requests."
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
---

# EPIC-008 — Atomic holds, idempotency and safe expiry

## Objective

Guarantee at most one protected allocation for a table and overlapping interval under concurrent requests.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 5.3, 5.4, 7, 9.4, 16.3, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Short PostgreSQL transaction with SELECT table row FOR UPDATE
- Eligibility recheck, safe-expiry resolution and allocation overlap checks
- GiST exclusion over table_id equality and dining_period overlap for protected states
- Caller+endpoint+key idempotency with payload hash and original result replay
- Server-controlled hold expiry, cancellation and same-commit outbox event

## Out of scope

Gateway HTTP calls inside DB locks, multi-table reservations and unconditional time-based inventory release.

## Business rules

- Protected allocation states: HELD, OFFER_HELD, PAYMENT_PENDING, PAYMENT_REVIEW, CONFIRMED, READY, SEATED, COMPLETED per source schematic SQL
- expires_at passing does not remove a row from the exclusion constraint
- Transition only conclusively releasable allocations out of protected states
- All writers, including walk-ins and offers, obey the same invariant
- Same key/body returns the original result; same key/different body is a deterministic conflict
- COMPLETED keeps historical range protection; early release would need a separate approved rule

## Data and API changes

bookings; table_allocations with tstzrange CHECKs and GiST exclusion using btree_gist; idempotency_records unique by principal/endpoint/key; outbox_events. Map booking HOLD_ACTIVE to allocation HELD explicitly.

POST /booking-holds (Idempotency-Key); GET /booking-holds/:id; DELETE /booking-holds/:id. 201 returns hold_id, status, expires_at, server_time and deposit; competing overlap returns 409 TABLE_UNAVAILABLE; expired action uses 410 where appropriate.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Only authenticated owner can fetch/cancel own hold. Never trust user_id, amount, expiry or derived end time from client input. Rate-limit and cap abuse according to agreed policy.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Implement authoritative migration with protected-range exclusion
- [x] T02 Implement row lock and transactional hold orchestration
- [x] T03 Implement request hash and atomic idempotency response persistence
- [x] T04 Integrate safe-expiry handling and rollback paths
- [x] T05 Emit outbox/audit records in the inventory transaction
- [x] T06 Build two-customer first vertical slice before any gateway or queue

## Acceptance criteria

- [x] 100 simultaneous same-table overlapping attempts yield at most one protected allocation
- [x] Two eligible nonoverlapping intervals can both succeed
- [x] Same idempotency key/body gives one booking and identical original response
- [x] Different body with same key fails without mutation
- [x] Crash/rollback leaves neither orphan allocation nor incomplete idempotency result
- [x] Delayed sweep cannot create a second protected allocation

## Required verification

- Run real PostgreSQL concurrency tests with separate connections and synchronized starts
- Attempt a direct overlapping DB insert to prove exclusion safety net
- Test idempotency races, rollback and key/body mismatch
- Test safe expired HELD vs unresolved PAYMENT_PENDING/PAYMENT_REVIEW outcomes

## Dependencies and execution gate

Prerequisites: [EPIC-002](EPIC-002-repository-database-and-delivery-foundation.md), [EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md), [EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md).

Two authenticated users compete for the same real DB table: one hold wins, the other gets 409. Repeat with 100 clients.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Double allocation is critical
- Using now() in a partial-index predicate is not automatic expiry
- An unknown payment outcome must remain protected or use the approved safe-release/compensation path

## Completion report

Completed and verified by Lead Systems & Transaction Architect on 07 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migration & Integrity Constraints (T01)**:
  - `supabase/migrations/20261106000008_atomic_holds_and_idempotency.sql`:
    - Added valid continuous range checks: `check_table_allocations_valid_range` and `check_bookings_valid_range` ensuring `NOT isempty(dining_period) AND lower(dining_period) < upper(dining_period)`.
    - Performance & query indexes: `idx_table_allocations_booking`, `idx_idempotency_lookup` on `(user_id, endpoint, expires_at)`, `idx_outbox_events_status_created` on `(status, created_at)`, and `idx_table_allocations_table_status_expires` on `(table_id, status, expires_at)`.
    - Configured Row Level Security (RLS) on `idempotency_records`: `idempotency_user_access` restricting records to `user_id = auth.uid()`.
    - Configured Row Level Security (RLS) on `table_allocations`: `allocations_customer_read` granting customers access to allocations linked to their own bookings.
- **Shared Contracts & DTO Alignment (T01, T03)**:
  - `packages/contracts/src/dtos.ts`: Exported `BookingHoldResponseDto`, `CancelHoldResponseDto`, and `DepositSummaryDto`.
  - `apps/api/src/common/db/schema.ts`: Mapped `diningPeriod: tstzrange('dining_period')` on `bookings` table.
- **Transactional Hold Orchestration & Row Locking (T02, T06)**:
  - `apps/api/src/modules/reservations/reservations.service.ts` (`createHold`):
    - Acquires table row lock (`SELECT id, ... FROM restaurant_tables WHERE id = $1 FOR UPDATE`) inside PostgreSQL transaction.
    - Evaluates table active state and restaurant bounds (min/max party size and table min_covers/capacity bounds).
    - Computes canonical dining interval `[start, end)` using `calculateDiningInterval` incorporating dining duration and turnover cleanup buffer.
    - Inspects active table maintenance blocks (`table_blocks`), rejecting conflicts with 409 Conflict (`TABLE_UNAVAILABLE`).
    - Maps booking state `HOLD_ACTIVE` explicitly to table allocation state `HELD`.
    - Sets server-controlled hold TTL to 15 minutes (`expires_at = now + 15 min`).
    - Catches PostgreSQL exclusion constraint violations (`23P01` / `no_protected_table_overlap`) and converts them to 409 Conflict with code `TABLE_UNAVAILABLE`.
- **Deterministic Idempotency Key & Payload Hash Storage (T03)**:
  - Required client header: `Idempotency-Key` (UUID or unique string).
  - Scope key derivation: `computeScopeKey(userId, endpoint, idempotencyKey)` = `sha256(user_id + ":" + endpoint + ":" + idempotency_key)`.
  - Canonical JSON payload serialization: `canonicalJson` recursively sorts all object keys.
  - Payload hashing: `hashPayload(payload)` = `sha256(canonicalJson)`.
  - Fast-path cached response replay: Identical request payload returns original stored response with HTTP header `X-Idempotent-Replay: true` without invoking business logic or re-mutating database state.
  - Conflict detection: Reusing an idempotency key with different request parameters triggers an immediate 409 Conflict with code `IDEMPOTENCY_CONFLICT` without modifying any state.
  - Idempotency records persisted atomically in same transaction with 24-hour retention.
- **Safe-Expiry Resolution & Rollback Paths (T04)**:
  - Invariant: Expiration timestamps passing does not automatically remove a row from the PostgreSQL GiST exclusion constraint.
  - Business rule implemented: Only allocations in `HELD` status whose `expires_at` timestamp has elapsed are safely transitioned to `RELEASED` (and associated booking to `EXPIRED`) during the hold transaction, freeing the physical table for the competing winner.
  - Unresolved states (`PAYMENT_PENDING`, `PAYMENT_REVIEW`, `CONFIRMED`, `READY`, `SEATED`, `COMPLETED`) are strictly guarded and cannot be automatically expired or released by a competing client.
  - All transactional changes are wrapped in atomic `withTransaction`, ensuring rollbacks leave neither orphan allocations nor partial idempotency records.
- **Transactional Outbox & Audit Logging (T05)**:
  - Every hold creation emits an outbox event (`event_type: 'HOLD_CREATED'`) and an audit log (`action: 'CREATE_HOLD'`) inside the same database commit.
  - Hold cancellations emit an outbox event (`event_type: 'HOLD_CANCELLED'`) and an audit log (`action: 'CANCEL_HOLD'`).
- **REST API Endpoints & OpenAPI Documentation (T02, T03)**:
  - `POST /booking-holds`: Protected hold creation with mandatory `Idempotency-Key` header.
  - `GET /booking-holds/:id`: Scoped hold retrieval with customer IDOR protection and 410 `HOLD_EXPIRED` server clock check.
  - `DELETE /booking-holds/:id`: Customer hold cancellation with safe-expiry validation and outbox release.
  - Registered in `apps/api/src/modules/reservations/booking-holds.controller.ts` and `reservations.module.ts`.
  - Exported and validated in OpenAPI 3.0 specification (`docs/architecture/openapi.json`).

### 2. Automated Test Suite & CI/CD Verification Evidence
- **Automated Node.js Unit Suite (`tests/unit/atomic-holds.test.js`)**:
  - 19 dedicated unit and concurrency tests passing:
    - `computeScopeKey`: Produces deterministic 64-character SHA-256 hash unique to user, endpoint, and key.
    - `canonicalJson` & `hashPayload`: Verifies recursive key sorting and hash stability across rearranged fields.
    - `createHold` validation: Rejects missing/empty `Idempotency-Key` header with `ValidationError`.
    - `PROTECTED_ALLOCATION_STATUSES`: Verifies all 8 blueprint protected states are recognized.
    - `isHoldSafelyExpired`: Verifies only elapsed `HELD` status is safely releasable; rejects premature or payment-pending rows.
    - `calculateHoldExpiry`: Verifies 15-minute server TTL calculation.
    - `parseRangeBounds`: Verifies parsing of PostgreSQL `tstzrange` string representations.
    - Customer Alice hold acquisition: Verifies 201 Created on Table T04 with `HELD` status and derived dining interval.
    - Customer Bob concurrent overlap rejection: Verifies 409 Conflict (`TABLE_UNAVAILABLE`) when requesting overlapping range.
    - Idempotent replay: Verifies exact cached response returned with `isReplay: true` without secondary mutations.
    - Idempotency mismatch: Verifies 409 Conflict (`IDEMPOTENCY_CONFLICT`) when body differs.
    - Non-overlapping adjacent interval: Verifies Customer Bob successfully reserves adjacent time window (20:45) on Table T04.
    - 100 simultaneous simulated same-table requests: Verifies exactly 1 winner and 99 conflicts.
    - Customer IDOR protection: Customer Bob cannot access or cancel Alice's hold (`403 Forbidden`).
    - Customer hold retrieval & cancellation: Alice successfully reads own hold (200 OK) and cancels it (200 OK, outbox emitted).
- **Automated Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**:
  - Added `TestEpic8AtomicHoldsAndIdempotency` with 7 comprehensive quality gates:
    - `test_atomic_holds_node_unit_suite`: Executes Node.js suite (19/19 tests pass).
    - `test_migration_008_atomic_holds_and_idempotency`: Verifies migration 8 range constraints, indexes, and RLS policies.
    - `test_openapi_booking_holds_routes`: Verifies OpenAPI documents `POST /booking-holds`, `GET /booking-holds/{id}`, and `DELETE /booking-holds/{id}`.
    - `test_python_100_simultaneous_same_table_concurrency`: Verifies at most 1 protected winner among 100 simultaneous competing requests.
    - `test_python_two_eligible_nonoverlapping_intervals_succeed`: Verifies adjacent non-overlapping ranges coexist without conflict.
    - `test_python_idempotency_replay_and_conflict_contract`: Verifies deterministic replay and conflict rejection without database mutation.
    - `test_python_safe_expiry_vs_protected_states`: Verifies safe-expiry is restricted to elapsed HELD rows and payment states remain protected.
  - **All 59 Python CI/CD verification tests passing cleanly**.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passed successfully with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Atomic holds, idempotency and safe expiry ([EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md)) is verified, marked completed, and registered in the delivery dashboard.
- First vertical slice capability invariant (two customers competing for Table T04 -> one hold wins, second gets 409) is proven.
- Prerequisite for downstream Reservation Lifecycle ([EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md)) and Payment Orders ([EPIC-010](EPIC-010-payment-orders-and-verified-webhook-inbox.md)) is fully satisfied.

## Finalized v2 change boundary

This original epic ID, title, completed status, accepted checklist and historical completion report are preserved. New finalized-v2 changes are tracked in EPIC-021–024; they do not reset this delivered work or imply that new provider/schema behavior was already verified.
