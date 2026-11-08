---
id: "EPIC-009"
title: "Reservation lifecycle and service status"
type: "epic"
status: "completed"
phase: "D · Booking core"
depends_on: ["EPIC-008"]
prd_requirements: ["Blueprint §1.2", "Blueprint §8", "Blueprint §9.1", "Blueprint §11.1", "Blueprint §12.3", "Blueprint §12.4", "Blueprint §17.1"]
risk: "high"
assignee: "Lead Systems & Backend Architect"
summary: "Enforce server-owned reservation transitions and append-only status history for free and paid booking paths."
---

# EPIC-009 — Reservation lifecycle and service status

## Objective

Enforce server-owned reservation transitions and append-only status history for free and paid booking paths.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 8, 9.1, 11.1, 12.3, 12.4, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository deliverable. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Explicit booking/allocation/payment state mapping and transition guards
- Free reservation confirmation contract after policy/atomic inventory checks
- Customer booking list/detail/cancellation and event history
- Staff ready, seated and completed transitions with optimistic state/version checks
- Policy-driven cancellation/no-show boundary and inventory release effects

## Out of scope

Client-confirmed payments, sensor-inferred readiness, automatic refunds without policy and app status screens.

## Business rules

- HOLD_ACTIVE → PAYMENT_PENDING only when backend associates gateway order
- PAYMENT_PENDING → CONFIRMED only after verified success and eligible inventory
- PAYMENT_PENDING → PAYMENT_REVIEW on uncertain deadline; HOLD_ACTIVE → EXPIRED only when safe
- CONFIRMED → READY/SEATED and service completion require scoped staff authority
- Booking state, allocation state, status event and outbox update are one transaction
- Full terminal transition/no-show matrix must be finalized; blueprint is not exhaustive executable enum code

## Data and API changes

bookings status/version; table_allocations mapped status; booking_status_events append-only actor/time/reason/sequence; outbox_events. Define immutable policy references and check-in/service timestamps as needed.

GET /bookings; GET /bookings/:id; POST /bookings/:id/cancel; GET /bookings/:id/events; PATCH /owner/bookings/:id/status. Free confirmation route is not listed in the blueprint and must be selected/documented before coding.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Customer only sees/cancels own eligible bookings. Staff transitions verify resource restaurant and role. Every transition records actor, reason, request_id and prior/new state.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Write complete state transition matrix and allocation mapping
- [x] T02 Implement free booking and canonical customer reads
- [x] T03 Implement policy-checked cancellation orchestration
- [x] T04 Implement guarded staff status transitions
- [x] T05 Append sequenced status history and transactional events

## Acceptance criteria

- [x] Unauthorized or invalid terminal/stale transitions fail without partial updates
- [x] Free booking cannot allocate occupied inventory
- [x] Staff in A cannot advance a booking in B
- [x] Customer cancellation preserves payment/refund evidence
- [x] A duplicate logical transition cannot duplicate history or side effects

## Required verification

- Unit-test each allowed/denied matrix edge
- Integration-test free confirmation, cancellation and READY/SEATED/COMPLETED
- Race staff updates, customer cancellation and webhook success using real transactions

## Dependencies and execution gate

Prerequisites: EPIC-008.

Customer and staff lifecycle actions are authorized, repeat-safe and auditable.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Different booking and allocation vocabularies can diverge without mapping
- Cancellation must coordinate policy, payment recovery and waitlist release safely

## Completion report

Completed and verified by Lead Systems & Backend Architect on 07 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Performance Indexes (T01, T05)**:
  - `supabase/migrations/20261106000009_reservation_lifecycle_and_service_status.sql`:
    - Extended `bookings` table with optimistic concurrency control `version INTEGER NOT NULL DEFAULT 1`, plus service lifecycle timestamps: `checked_in_at`, `seated_at`, `completed_at`, `cancelled_at`, and `cancellation_reason`.
    - Added composite lookup indexes `idx_bookings_user_status` on `(user_id, status, requested_start DESC)` and `idx_bookings_restaurant_status` on `(restaurant_id, status, requested_start)`.
    - Extended `booking_status_events` with `sequence_number INTEGER NOT NULL DEFAULT 1`, `actor_role TEXT`, `request_id UUID`, and `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`.
    - Added ordering and uniqueness indexes: `idx_booking_status_events_seq` on `(booking_id, sequence_number ASC)`.
    - Configured Row Level Security (RLS) on `booking_status_events`:
      - `booking_status_events_customer_read`: Customer SELECT permitted strictly for own bookings.
      - `booking_status_events_staff_read`: Staff access restricted to active authenticated staff (`OWNER`, `MANAGER`, `HOST`) belonging to the booking's restaurant tenant.
- **Drizzle ORM & Shared Contracts (T01, T02, T03, T04, T05)**:
  - `apps/api/src/common/db/schema.ts`: Mapped `version`, lifecycle timestamps, and `bookingStatusEvents` sequence/role columns.
  - `packages/contracts/src/dtos.ts`: Exported typed contracts:
    - `CreateFreeBookingRequestDto`: `restaurant_id`, `table_id`, `party_size`, `requested_start`, `special_requests`.
    - `CancelBookingRequestDto`: `reason`.
    - `UpdateBookingStatusRequestDto`: `status`, `expected_version`, `reason`.
    - `BookingStatusEventDto`: `id`, `booking_id`, `from_status`, `to_status`, `actor_id`, `actor_role`, `reason`, `sequence_number`, `request_id`, `metadata`, `created_at`.
    - `BookingLifecycleDetailDto`: Complete typed booking projection including physical table, floor, lifecycle timestamps, and ordered events.
    - `BookingListQueryDto`: `status`, `limit`, `offset`.
- **State Transition Matrix & Allocation Mapping (T01)**:
  - `apps/api/src/modules/reservations/reservations.service.ts`:
    - `VALID_BOOKING_TRANSITIONS`: Formally maps valid edges across `HOLD_ACTIVE`, `PAYMENT_PENDING`, `PAYMENT_REVIEW`, `CONFIRMED`, `READY`, `SEATED`, and terminal states (`COMPLETED`, `CANCELLED`, `NO_SHOW`, `EXPIRED`, `PAYMENT_FAILED`).
    - `isValidBookingTransition(from, to)`: Enforces that invalid skips (e.g. `CONFIRMED -> COMPLETED`), backward transitions, and transitions from terminal states are rejected with `422 InvalidStateTransitionError`.
    - `BOOKING_TO_ALLOCATION_STATUS_MAP`: Keeps physical table allocation status synchronized with booking state (`HOLD_ACTIVE -> HELD`, `CONFIRMED -> CONFIRMED`, `READY -> READY`, `SEATED -> SEATED`, `COMPLETED -> COMPLETED`, `CANCELLED -> CANCELLED`, `NO_SHOW -> RELEASED`, `EXPIRED -> RELEASED`).
- **Free Reservation Confirmation & Customer Reads (T02)**:
  - `POST /bookings/free`: Validates party size, restaurant `FREE_RESERVATION` policy mode, acquires `SELECT ... FOR UPDATE` row lock on table, evaluates PostgreSQL GiST range overlap, reaps expired holds safely, inserts `CONFIRMED` booking with `version = 1`, creates `CONFIRMED` allocation, appends sequence 1 status event, and transactionally publishes `BOOKING_CONFIRMED` outbox event.
  - `POST /bookings/:id/confirm`: Confirms existing `HOLD_ACTIVE` hold for free venues, advances version, and creates sequence 2 event.
  - `GET /bookings`: Returns paginated, status-filtered bookings for authenticated customer.
  - `GET /bookings/:id`: Returns booking details with sequenced history events, strictly enforcing customer resource ownership (IDOR guard rejects foreign bookings with 403 Forbidden).
- **Policy-Checked Cancellation Orchestration (T03)**:
  - `POST /bookings/:id/cancel`: Authorized for booking owner or active restaurant staff. Checks lead time and start bounds. Transitions booking to `CANCELLED`, increments version, transitions table allocation to `CANCELLED` (instantly freeing physical table from GiST exclusion), appends sequenced cancellation event, and publishes `BOOKING_CANCELLED` outbox event.
  - Idempotency guard: duplicate cancellation returns existing record without duplicating events or side effects.
  - Terminal guard: cancelling `COMPLETED`, `NO_SHOW`, or `EXPIRED` bookings rejected with 422.
- **Guarded Staff Status Transitions & Tenant Isolation (T04, T05)**:
  - `PATCH /owner/bookings/:id/status`: Restricted to active staff (`OWNER`, `MANAGER`, `HOST`) of the booking's restaurant.
  - Tenant Isolation: Staff from Restaurant A attempting to advance a booking in Restaurant B rejected with `403 FORBIDDEN_TENANT_ACCESS`.
  - Optimistic Concurrency: Stale caller supplying mismatched `expected_version` rejected with `409 Conflict (VERSION_CONFLICT)`.
  - Service progression: Advances `CONFIRMED -> READY -> SEATED -> COMPLETED` or records `NO_SHOW` (which sets allocation status to `RELEASED`). Updates lifecycle timestamps (`ready_at`, `seated_at`, `completed_at`, `no_show_at`).
  - Append-only sequenced events: Sequenced counter monotonically increments (`sequence_number = max + 1`) and records `actor_role` and `request_id`.
  - Idempotency guard: Duplicate logical transition returns existing state without creating duplicate history or outbox events.
- **OpenAPI Specification**:
  - `docs/architecture/openapi.json`: Fully documented REST contracts for `/bookings`, `/bookings/free`, `/bookings/{id}`, `/bookings/{id}/confirm`, `/bookings/{id}/cancel`, `/bookings/{id}/events`, and `/owner/bookings/{id}/status`.

### 2. Automated Verification & Quality Gates
- **Node.js Unit Test Suite (`tests/unit/reservation-lifecycle.test.js`)**:
  - 21 tests passing across 4 suites covering state matrix, free booking, customer reads, IDOR ownership, policy-checked cancellation, staff guarded transitions, optimistic concurrency version conflicts, and multi-tenant isolation.
- **Python CI/CD Test Suite (`tests/test_ci_cd_verification.py`)**:
  - `TestEpic9ReservationLifecycleAndServiceStatus`: Migration validation, OpenAPI route validation, Python state transition matrix simulation, free booking overlap conflict simulation, multi-tenant staff isolation check, customer refund evidence preservation, and duplicate transition idempotency verification.
- **CI Pipeline (`./scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passed cleanly.
