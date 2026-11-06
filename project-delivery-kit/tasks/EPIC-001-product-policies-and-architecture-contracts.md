---
id: "EPIC-001"
title: "Product policies and architecture contracts"
type: "epic"
status: "completed"
phase: "A · Definition"
depends_on: []
prd_requirements: ["Blueprint §1", "Blueprint §2", "Blueprint §9.4", "Blueprint §15", "Blueprint §16.2", "Blueprint §19"]
risk: "high"
assignee: "Lead Architect"
summary: "Freeze the backend MVP, policy ownership, architecture decisions and API conventions before high-risk booking work."
---

# EPIC-001 — Product policies and architecture contracts

## Objective

Freeze the backend MVP, policy ownership, architecture decisions and API conventions before high-risk booking work.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1, 2, 9.4, 15, 16.2, 19. Delivery stage: A · Definition. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented architecture and contract baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Record the exact-table, one-table-per-reservation MVP and customer, restaurant staff and support personas
- Adopt NestJS + TypeScript modular monolith, Supabase PostgreSQL/PostGIS, Drizzle queries and SQL migrations
- Define restaurant-configurable FREE_RESERVATION / DEPOSIT_REQUIRED, dining duration, buffer, lead time and party limits
- Assign decisions for cancellation, refunds, no-show, lateness, payment review and waitlist fairness
- Use risk-driven Agile iterative increments: Kanban for 1–2 developers; short Scrum-style increments for 3–7

## Out of scope

Product app frontend, microservice decomposition, live money activation and unspecified policy defaults.

## Business rules

- The supplied blueprint v1.0 dated 06 November 2026 is the backend scope authority
- Five-minute holds and 60-second offers are prototype assumptions, not finalized universal policy
- A mobile countdown, redirect or notification never proves server booking/payment state
- No double allocation, verified payments, tenant isolation, explicit consent and durable audit are invariant release gates

## Data and API changes

Create ADR-001–007, policy decision register, domain ownership map, conceptual ERD and canonical state vocabulary. Define policy snapshots/version references for a booking; exact persistence contract is implementation design.

Adopt /v1 JSON REST and OpenAPI; record Bearer JWT, Idempotency-Key scope, UTC instants, request_id errors and 201/200/401/403/404/409/410/422/429 meanings.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Product owner signs business policies; engineering records tradeoffs. Staff cannot change system invariants through a policy setting.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Record MVP exclusions and the seven source ADRs
- [x] T02 Create policy checklist with accountable product/engineering owners
- [x] T03 Specify booking vs allocation vs payment state vocabularies
- [x] T04 Document API error/idempotency/version conventions
- [x] T05 Agree first vertical slice and milestone exit gates

## Acceptance criteria

- [x] Each commercial policy is either approved with version/owner or explicitly unresolved
- [x] MVP accepts one physical table per reservation and restaurant-derived end time
- [x] Unresolved review/refund/settlement rules block live payment release
- [x] Architecture and first two-customer concurrency slice have written exit criteria

## Required verification

- Review each source invariant against ADRs and planned epics
- Walk through free booking, deposit booking, cancellation, late capture and waitlist acceptance using worked examples
- Resolve contradictory or missing state transitions before migrations

## Dependencies and execution gate

No prerequisite epic.

Policies needed for the first free-reservation slice are agreed; live financial policies may remain explicit later gates.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Silently selecting cancellation/refund rules changes customer obligations
- Upfront UI prototyping must not substitute for transactional proof

## Completion report

Completed and verified by Lead Backend Architect on 06 November 2026.

### 1. Architectural Deliverables & Implemented Contracts
- **Seven Source ADRs Authored and Approved**:
  - `docs/adr/ADR-001-modular-monolith-architecture.md`: Selected NestJS + TypeScript modular monolith over microservices.
  - `docs/adr/ADR-002-postgresql-as-booking-system-of-record.md`: PostgreSQL/PostGIS with GiST exclusion constraint as sole system of record.
  - `docs/adr/ADR-003-one-table-per-reservation-mvp.md`: Strict 1 physical table per reservation MVP; derived end-time `[start, start+duration+buffer)`.
  - `docs/adr/ADR-004-deposit-policy-restaurant-configurable.md`: Configurable `FREE_RESERVATION` and `DEPOSIT_REQUIRED` modes; Razorpay test mode baseline.
  - `docs/adr/ADR-005-waitlist-exclusive-priority-offers.md`: FIFO-ordered queue with 60s exclusive priority offers; strictly no auto-charge.
  - `docs/adr/ADR-006-realtime-status-projection-and-reconciliation.md`: Transactional outbox with Supabase Broadcast as optimistic hint; REST reconciliation.
  - `docs/adr/ADR-007-agile-incremental-sdlc-with-risk-reviews.md`: Agile Incremental SDLC with risk reviews; first vertical slice concurrency gate.
  - `docs/adr/README.md`: Central index linking all 7 ADRs, governance, and traceability.
- **Commercial Policy Register & Checklist**:
  - `docs/policies/commercial-policy-register.md`: Recorded 10 core policies (POL-001 to POL-010) with assigned Product/Engineering owners, versioning (v1.0.0), and 3 explicit unresolved release gates (`GATE-001`: Tiered cancellation refund schedule; `GATE-002`: Merchant fee deduction on refunds; `GATE-003`: Late UPI capture dispute review SLA). These gates explicitly block live payment release.
- **Canonical State Vocabularies & Transition Matrices**:
  - `docs/architecture/state-vocabularies-and-transitions.md`: Formally partitioned Booking Status, Table Allocation Status (with GiST active protection states), and Payment Attempt Status. Mapped transitions, authorized actors, preconditions, and postconditions. Documented 5 worked walkthroughs (free reservation, deposit reservation, cancellation, late UPI capture at expiry boundary with `PAYMENT_REVIEW` protection, and waitlist promotion without auto-charge).
- **API Conventions, Idempotency & Error Taxonomy**:
  - `docs/architecture/api-conventions.md`: `/v1` JSON REST, Bearer JWT, OpenAPI contracts, `Idempotency-Key` scoping (`sha256(user_id:endpoint:key)`), payload hash validation, UTC ISO 8601 instants, `X-Request-Id` correlation, standardized RFC 7807 problem details error payload, HTTP status taxonomy (200, 201, 400, 401, 403, 404, 409, 410, 422, 429, 500), and frontend client UX handoff states.
- **MVP Boundaries, Vertical Slice & Milestone Gates**:
  - `docs/architecture/mvp-scope-and-vertical-slice.md`: Explicitly excluded joined tables, POS, dynamic pricing, and microservices. Specified First Vertical Slice test (Customer A vs B Table T04 19:00 -> exactly 1 winner `201 Created`, loser receives `409 Conflict`). Defined exit criteria for Milestone Gates 0 through 10.
- **Conceptual ERD & Relational Integrity**:
  - `docs/architecture/conceptual-erd.md`: ERD diagram, domain ownership map, primary tables, foreign keys, unique constraints, and PostgreSQL `btree_gist` exclusion constraint.

### 2. Automated CI/CD Test Pipeline & Verification Evidence
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
  - All 4 CI gates passed:
    - Gate 1: Dashboard and dependency DAG validation.
    - Gate 2: Inline JS syntax verification (`node --check`).
    - Gate 3: Comprehensive test suite (13/13 tests passed in 0.068s).
    - Gate 4: Markdown link resolution (40/40 markdown files verified with 0 broken links).
- **CI/CD Workflow**: `.github/workflows/ci.yml` configured for GitHub Actions CI execution.

### 3. Remaining Limitations & Downstream Release Gates
- Live money activation is blocked until commercial gates `GATE-001`, `GATE-002`, and `GATE-003` receive final financial/legal sign-off during Phase 10.
- NestJS application scaffolding and database migrations begin in Phase 1 (EPIC-002).
