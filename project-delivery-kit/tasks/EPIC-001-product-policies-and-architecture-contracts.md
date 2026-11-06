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
