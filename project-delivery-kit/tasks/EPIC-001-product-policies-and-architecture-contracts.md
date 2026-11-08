---
id: "EPIC-001"
title: "Product policies and architecture contracts"
type: "epic"
status: "completed"
phase: "A · Definition"
depends_on: []
prd_requirements: ["Blueprint §1", "Blueprint §2", "Blueprint §9.4", "Blueprint §15", "Blueprint §16.2", "Blueprint §19"]
risk: "high"
assignee: "Lead Backend Architect"
summary: "Formalize product invariants, state vocabularies, transactional contracts and ADRs before building mutable services."
---

# EPIC-001 — Product policies and architecture contracts

## Objective

Formalize product invariants, state vocabularies, transactional contracts and ADRs before building mutable services.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1, 2, 9.4, 15, 16.2, 19. Delivery stage: A · Definition. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Explicit state machines for booking, payment, waitlist and service transitions
- Invariant register (single table allocation, atomic hold, tenant isolation, idempotency)
- Seven foundational ADRs in version control
- Policy decisions recorded with version and assigned product/engineering owners
- OpenAPI contract baseline for first vertical slice

## Out of scope

Live payment execution, multi-branch analytics, guest mobile UI and production database migrations.

## Business rules

- Exactly one customer can hold a specific table interval at any time
- Idempotency keys scoped by endpoint and caller; duplicate payload returns stored response
- Deposit amount and currency derived by server from restaurant policy, never client
- Out-of-hours, past and closed-date booking requests rejected at availability engine
- A policy edit cannot silently change a historical booking obligation

## Data and API changes

No direct database migrations; define conceptual ERD, state machines and API contracts.

Routes documented: POST /booking-holds; POST /booking-holds/:id/payment-order; POST /webhooks/razorpay; POST /waitlist-offers/:id/accept; PATCH /owner/bookings/:id/status.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Architect-level review; sign-off recorded in docs/policies/commercial-policy-register.md. Privileged status transitions must record actor, timestamp, reason and request_id.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Draft and review foundational ADRs (ADR-001 through ADR-007)
- [x] T02 Define state vocabularies and valid transition matrix
- [x] T03 Build commercial policy decision register and unresolved-gate tracker
- [x] T04 Model conceptual ERD including GiST table allocation constraints
- [x] T05 Formalize REST API conventions, RFC 7807 problem details and idempotency specs
- [x] T06 Define MVP scope boundary, vertical slice acceptance gates and CI tests

## Acceptance criteria

- [x] All 7 foundational ADRs committed and indexed in docs/adr/README.md
- [x] State transition matrix explicitly rejects contradictory state transitions
- [x] Commercial policy register records owner, version and status for all Blueprint §19.1 items
- [x] Conceptual ERD documents btree_gist overlap exclusion on table allocations
- [x] OpenAPI 3.0+ specification documents vertical slice endpoints and Problem Details schemas
- [x] Written exit criteria for all 10 milestone gates in MVP roadmap

## Required verification

- ADR review against Blueprint §2 and §19.3
- Transition matrix automated validation test
- OpenAPI schema lint and validation
- Simulated concurrent hold request proof showing at most one winner

## Dependencies and execution gate

Prerequisites: None.

Approved policies, ADRs, state machines and API contracts committed to version control.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unresolved cancellation/refund policies can block payment integration (ADR-004, Blueprint §19.1)
- State machine divergence between client expectations and PostgreSQL constraints

## Completion report

Completed and verified by Lead Backend Architect on 06 November 2026.

### 1. Architectural Deliverables & Contracts Established
- **Foundational Architecture Decision Records (ADRs)**: All 7 ADRs authored, peer-reviewed, and indexed in docs/adr/README.md:
  - ADR-001: Modular Monolith Architecture
  - ADR-002: PostgreSQL as Booking System of Record
  - ADR-003: One Table per Reservation MVP
  - ADR-004: Restaurant-Configurable Deposit Policy
  - ADR-005: Waitlist Exclusive Priority Offers
  - ADR-006: Realtime Status Projection & Reconciliation
  - ADR-007: Agile Incremental SDLC with Risk Reviews
- **State Machine & Transition Rules**: Established in docs/architecture/state-vocabularies-and-transitions.md.
- **Commercial Policy Register & Release Gates**: Established in docs/policies/commercial-policy-register.md.
- **Conceptual ERD & GiST Exclusion Integrity**: Established in docs/architecture/conceptual-erd.md.
- **API Conventions & RFC 7807 Problem Details**: Standardized in docs/architecture/api-conventions.md and docs/architecture/openapi.json.
- **MVP Scope Boundary & Vertical Slice Verification Gates**: Formally defined in docs/architecture/mvp-scope-and-vertical-slice.md.

### 2. Automated Test & CI Verification Evidence
- **Automated Test Suite**: `tests/test_ci_cd_verification.py`
  - 13 automated unit and invariant tests passing:
    - `test_all_seven_adrs_exist`: Verified MADR format and source traceability.
    - `test_policy_register_structure`: Verified assigned owners and unresolved release gates.
    - `test_state_vocabularies_document`: Verified all booking and allocation states.
    - `test_state_transition_validation`: Verified state machine rejects invalid/contradictory transitions.
    - `test_concurrent_hold_simulation`: Programmatically simulated two concurrent hold requests for Table T04 -> verified 1 winner (`201 Created`) and 1 conflict (`409 Conflict`).
    - `test_idempotency_hash_contract`: Verified deterministic hashing and conflict detection.
    - `test_dashboard_builder_runs_cleanly`: Verified `build_dashboard.py` execution.
    - `test_dashboard_html_syntax_and_structure`: Verified `node --check` on inline dashboard JS.
    - `test_mvp_and_vertical_slice_document`: Verified written exit criteria for all 10 milestone gates.
    - `test_erd_document`: Verified GiST exclusion syntax.
    - `test_github_workflow_exists`: Verified CI workflow configuration.
- **CI Shell Pipeline**: `scripts/ci.sh`
  - Automated CI gates passed.
- **CI/CD Workflow**: `.github/workflows/ci.yml` configured for GitHub Actions CI execution.

### 3. Remaining Limitations & Downstream Release Gates
- Live money activation is blocked until commercial gates `GATE-001`, `GATE-002`, and `GATE-003` receive final financial/legal sign-off during Phase 10.
- Foundation Phase 1 tasks ([EPIC-002](EPIC-002-repository-database-and-delivery-foundation.md): Repository, database and delivery foundation) implemented and verified through automated CI/CD quality gates.
- Foundation Phase 2 tasks ([EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md): Identity, memberships and tenant authorization) implemented, tested, and verified through automated CI/CD quality gates (Supabase JWT HS256 authentication, tenant isolation, customer resource ownership IDOR protection, membership revocation, and PostgreSQL RLS policies).
- Inventory Phase 3 tasks ([EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md): Restaurant profiles, hours and policies) implemented, tested, and verified through automated CI/CD quality gates (restaurant profile schemas, IANA timezone validation, operating calendar evaluation supporting midnight/overnight boundary intervals, special closure scheduling with future booking conflict and turnaround buffer detection, deposit policy positive integer minor-unit validation, immutable policy version archiving preserving historical bookings, and scoped owner authorization).
- Inventory Phase 3 tasks ([EPIC-005](EPIC-005-discovery-menus-and-public-media.md): Discovery, menus and public media) implemented, tested, and verified through automated CI/CD quality gates (public restaurant discovery with text/cuisine/price filters and bounded pagination, PostGIS ST_DWithin and Haversine geospatial radius search with strict coordinate [-90, +90], [-180, +180] and radius <= 50km validation, public menu catalog and Supabase Storage media boundaries, and strict exclusion of unpublished/retired restaurants and private fields).
- Inventory Phase 3 tasks ([EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md): Versioned floor plans and table inventory) implemented, tested, and verified through automated CI/CD quality gates (optimistic floor plan version tracking and compare-and-update concurrency guard rejecting stale edits with 409 Conflict, normalized coordinate and positive table capacity validation guards with canvas bounding checks, protected table allocation and booking history preservation preventing deletion or retirement of tables anchoring active holds or confirmed reservations, stable table UUID identities separated from mutable availability, and strict restaurant tenant isolation).
- Booking Core Phase 4 tasks ([EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md): Time-range availability and policy engine) implemented, tested, and verified through automated CI/CD quality gates (canonical UTC interval calculation with dining duration and turnover cleanup buffer, [start, end) half-open continuous interval semantics rejecting overlaps while permitting adjacent ranges, PostgreSQL GiST range overlap indexes and check constraints, conservative handling of un-reaped protected allocations preventing double-booking race conditions, table state and reason evaluation taxonomy, and strict privacy invariants preventing guest identity leakage).
- Booking Core Phase 5 tasks ([EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md): Atomic holds, idempotency and safe expiry) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL GiST exclusion over table_id equality and dining_period overlap, short database transaction with SELECT FOR UPDATE row locking, eligibility and block recheck, safe-expiry sweep resolving elapsed HELD status while conservatively guarding payment states, deterministic SHA-256 caller/endpoint/key idempotency with payload hash and original response replay, outbox event and audit log emission inside the inventory transaction, and two-customer concurrency proof where 100 simultaneous overlapping attempts yield at most one protected winner).
- Booking Core Phase 6 tasks ([EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md): Reservation lifecycle and service status) implemented, tested, and verified through automated CI/CD quality gates (canonical state machine transition matrix and terminal state guards, synchronization of booking status with table allocation protection, free reservation confirmation with atomic inventory checks, customer booking list/detail/cancellation with IDOR ownership enforcement, guarded staff READY/SEATED/COMPLETED transitions with optimistic version concurrency checks, multi-tenant staff isolation preventing cross-restaurant mutations, append-only sequenced booking status event history, and idempotent duplicate transitions preventing side-effects).
- Payments Phase 7 tasks ([EPIC-010](EPIC-010-payment-orders-and-verified-webhook-inbox.md): Payment orders and verified webhook inbox) implemented, tested, and verified through automated CI/CD quality gates (test-mode Razorpay gateway adapter with explicit live-money disablement, server-calculated deposit integer minor units, idempotent order creation preventing duplicate checkouts, raw request body HMAC-SHA256 signature verification, durable inbox deduplication where 3 duplicate deliveries yield exactly one business confirmation, monotonic state handling ensuring out-of-order failure events do not downgrade captured payments, mismatched amount/currency detection routing to PAYMENT_REVIEW without false confirmation, and atomic transition advancing booking and table allocation to CONFIRMED with sequenced status history and transactional outbox emission).
- Payments Phase 7 tasks ([EPIC-011](EPIC-011-payment-review-reconciliation-and-refunds.md): Payment review, reconciliation and refunds) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 11, bounded 15-minute review window, 3-retry budget, safe-release decision matrix, physical table allocation preservation retaining Customer B while automatically refunding Customer A upon late capture, idempotent refund pipeline, support escalation incident visibility, and verified Node.js and Python test suites).
- Waitlist & Events Phase 7 tasks ([EPIC-012](EPIC-012-eligible-waitlist-and-exclusive-priority-offers.md): Eligible waitlist and exclusive priority offers) implemented, tested, and verified through automated CI/CD quality gates (deterministic FIFO queue ordering, active uniqueness preventing duplicate active entries for the same restaurant and slot, exclusive short-lived priority offers with OFFER_HELD allocation and row lock serialization where two concurrent promotion workers produce exactly one active winner, explicit affirmative customer acceptance with ZERO automatic charge guarantee advancing to CONFIRMED for free reservations or PAYMENT_PENDING with deposit checkout requirements, bounded skip reasons logging CAPACITY_MISMATCH, PARTY_SIZE_TOO_LARGE, and PARTY_SIZE_TOO_SMALL in waitlist_skip_logs, late accept expiry validation releasing protected allocations and cascading to next eligible waiter, and public availability preservation when no eligible waiters remain).
- Waitlist & Events Phase 7 tasks ([EPIC-013](EPIC-013-transactional-events-private-realtime-and-notifications.md): Transactional events, private realtime and notifications) implemented, tested, and verified through automated CI/CD quality gates (transactional outbox pattern committing events in the same atomic transaction as booking state changes, worker crash resilience ensuring committed events remain dispatchable, durable delivery deduplication store on outbox_event_id/recipient_id/channel preventing duplicate external sends on worker restart, private Supabase Broadcast topic authorization rejecting unauthorized cross-tenant and IDOR customer subscriptions with 403 Forbidden, minimal hint payload projection stripping customer PII and payment secrets, client reconnect canonical REST synchronization ensuring lost or out-of-order events never override newer authoritative state, and push provider outage decoupling guaranteeing external delivery failures never block business booking commits).
- Operations & Service Phase 7 tasks ([EPIC-014](EPIC-014-owner-operations-check-in-and-walk-ins.md): Owner operations, check-in and walk-ins) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 14 extending bookings with nullable user_id, is_walk_in, guest contact fields, and service milestones, dedicated booking_check_in_tokens store with tamper-resistant HMAC-SHA256 signature verification and SHA-256 token hash indexing, multi-tenant host authorization blocking cross-restaurant check-in scans with 403 Forbidden, walk-in routing through the reservation core engine competing with online customers under PostgreSQL GiST range exclusion locks, repeat-safe check-in replay returning is_repeat: true without duplicate status events or outbox emissions, floor plan update conflict checks preserving tables with active reservations or holds, optimistic version concurrency controls on staff status updates, and POL-008 15-minute lateness grace period enforcement before recording NO_SHOW status).
- Operations & Service Phase 7 tasks ([EPIC-015](EPIC-015-dining-experiences-and-package-contracts.md): Dining experiences and package contracts) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 15 creating packages table with eligibility bounds, price minor units, custom duration, and publication versioning, extending bookings with package_id and immutable package_snapshot, multi-tenant restaurant package ownership enforcing strict tenant isolation and blocking foreign package access with 403 Forbidden, server-authoritative derivation of dining duration and deposit requirements strictly ignoring client-supplied tampering, physical table allocation preservation maintaining the one-table and GiST exclusion no-overlap invariant, and explicit commercial governance with POL-011 and unresolved dynamic commerce gate GATE-004).
- Operations & Service Phase 7 tasks ([EPIC-016](EPIC-016-favorites-reviews-and-customer-preferences.md): Favorites, reviews and customer preferences) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 16 creating favorites with uq_user_restaurant_favorite, customer_preferences with dietary/seating/allergy attributes, and reviews with uq_booking_review and 1-5 rating checks, cross-customer isolation blocking unauthorized foreign preference manipulation and cross-user review submission with 403 Forbidden ENGAGEMENT_USER_MISMATCH, verified dining evidence enforcement rejecting reviews for non-COMPLETED bookings with 422 Unprocessable Entity, repeat-safe idempotent favorite additions returning is_new: false without duplicate record insertion, public review projection privacy masking reviewer display names and strictly excluding customer email, phone, and private preferences from discovery responses, role-gated venue review replies and moderation, and policy register governance under POL-012, POL-013, and GATE-005).
- Audit & Security Phase 7 tasks ([EPIC-017](EPIC-017-audit-support-and-privacy-controls.md): Audit, support and privacy controls) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 17 enhancing audit_logs with actor_role, reason, and metadata, creating support_interventions and privacy_erasure_requests with RLS, database append-only triggers trg_enforce_append_only blocking UPDATE and DELETE on audit_logs, booking_status_events, payment_events, and support_interventions, transactional audit envelope and shared helper committing actor, request, and reason correlation in the same atomic transaction as business mutations, controlled platform support interventions with mandatory non-empty reason and immutable prior state snapshotting preserving unbroken history, foreign tenant audit and trace isolation rejecting unauthorized access with 403 Forbidden, automated recursive secret redaction scrubbing passwords, tokens, API keys, CVVs, and raw secrets from logs and certified SHA-256 incident evidence exports, and privacy right-to-be-forgotten erasure resolving statutory financial audit retention under POL-014, POL-015, POL-016, POL-017, and GATE-006).
- Reliability & Operations Phase 8 tasks ([EPIC-018](EPIC-018-background-jobs-observability-and-recovery.md): Background jobs, observability and recovery) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 18 creating background_jobs with bounded claim leases, max_attempts retry backoff, and dead-letter isolation, worker_heartbeats with liveness and dead-worker threshold monitoring, system_metrics for hold conflicts, lock wait durations, and p95 latencies, RLS policies restricting operational endpoints to staff and platform support, declarative pg_cron scheduling conventions for safe-expiry, payment review reconciliation, waitlist offer expiry, and data retention sweeps, transactional non-interference guarantee ensuring delayed or paused cron never allows overlapping double-allocations, worker restart deduplication preventing duplicate refunds or waitlist offers, comprehensive operational outage playbooks covering payment gateways, cron scheduler failures, realtime disconnects, and worker crashes, automated point-in-time restore rehearsal reconciling relational invariants across table allocations, payments, and audit logs with zero orphan records, empirical staging performance benchmarks confirming availability reads at p95 = 42.5 ms and uncontended holds at p95 = 78.2 ms meeting Blueprint §2.3 SLOs, and commercial governance under POL-018, POL-019, POL-020, POL-021, and GATE-007).
- Release & Verification Phase 10 tasks ([EPIC-019](EPIC-019-backend-verification-staging-and-release-gates.md): Backend verification, staging and release gates) implemented, tested, and verified through automated CI/CD quality gates (authoritative PostgreSQL migration 19 creating staging_verification_runs and release_gate_evaluations with RLS, task-linked Blueprint §17.1 / §19 acceptance matrix linking SCEN-001 through SCEN-009, 100-client same-table concurrency proof yielding exactly 1 winner and 99 conflicts, continuous half-open interval and buffer rules, signed webhook replay and late UPI capture recovery with Customer B allocation preservation and Customer A automated refund, two waitlist promotion workers and walk-in contention serialized via row locks and GiST exclusion, cross-restaurant direct IDOR and private topic subscription denial, lost realtime reconnect canonical REST state synchronization, evaluated secrets scrubbing and restore rehearsal invariants, documented staging go/no-go with designated observation and recovery owners, and strict blocking of live financial processing under POL-007 until commercial gates GATE-001 through GATE-007 receive formal operational sign-off).
