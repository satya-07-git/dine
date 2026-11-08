---
id: "EPIC-020"
title: "Future extensions and unresolved scope definition"
type: "epic"
status: "completed"
phase: "Later · Needs definition"
depends_on: ["EPIC-001"]
prd_requirements: ["Blueprint §1.3", "Blueprint §2.1", "Blueprint §19.1", "Blueprint §20.3"]
risk: "high"
assignee: "Lead Architecture & Governance Architect"
summary: "Keep explicitly deferred capabilities visible without expanding the exact-table backend MVP."
---

# EPIC-020 — Future extensions and unresolved scope definition

## Objective

Keep explicitly deferred capabilities visible without expanding the exact-table backend MVP.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.3, 2.1, 19.1, 20.3. Delivery stage: Later · Needs definition. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented architecture and scope governance deliverable. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Record joined tables, variable seating, POS integration, advanced pricing, demand optimization and multi-location analytics as later extensions
- Define proof/scale triggers before considering microservices/event-driven service splits
- Identify unresolved contracts for no-show, packages/reviews, gateway review/capture and settlement
- Require new requirements, threat/risk review and acceptance gates before extension implementation

## Out of scope

Building unspecified future systems or introducing Clinify healthcare/subscription/AI modules into Dine.

## Business rules

- Deferred source examples are not promised first-release work
- Joined tables require deterministic lock order and a new allocation contract
- POS events cannot bypass trusted inventory/status authorization
- Scope changes need updated ADRs, schema/API impact and release gates

## Data and API changes

No speculative production tables or routes are authorized here. Record decisions and proposed bounded changes first; preserve one SQL migration authority.

Future routes are intentionally undefined pending reviewed product requirements.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Any future integration must define credential scope, restaurant ownership, audit and data-minimization boundaries.

Use verified identity, restaurant/resource ownership checks and [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Maintain deferred-scope register with owner and rationale
- [x] T02 Define prerequisites and risk criteria for each candidate extension
- [x] T03 Write new product/API/data contracts before scheduling implementation

## Acceptance criteria

- [x] Each later extension is identified with missing requirements and a decision owner
- [x] No unresolved extension is shown as ready or completed
- [x] First release dependencies do not require unspecified future modules
- [x] Architecture scale changes require measured evidence and explicit ADR

## Required verification

- Review MVP/non-goals against blueprint §1.3
- Check dependency graph contains no future-only prerequisite for core release
- Review any proposed extension against all inventory/payment/tenant invariants

## Dependencies and execution gate

Prerequisites: [EPIC-001](EPIC-001-product-policies-and-architecture-contracts.md).

Approved scope register, candidate extension invariants, scale trigger evaluations, and unresolved operational contracts committed to version control.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unbounded scope delays the first safe pilot
- Copying Clinify domain requirements would contradict the Dine source

## Completion report

Completed and verified by Lead Architecture & Governance Architect on 08 November 2026.

### 1. Architectural Deliverables & Scope Governance Established
- **Formal Architecture Specification**: Established in `docs/architecture/deferred-scope-and-future-extensions.md`:
  - Formally links Blueprint §1.3, §2.1, §19.1, and §20.3 to the deferred scope register and MVP non-goals.
  - Documents all 6 major candidate extensions (`EXT-001` through `EXT-006`):
    1. `JOINED_TABLES` (EXT-001): Multi-table allocations, deterministic ascending UUID lock ordering to eliminate distributed deadlocks, capacity summation, rollback guarantees, new allocation contract. Owner: Lead Core Engine Architect.
    2. `VARIABLE_SEATING` (EXT-002): Dynamic table resizing, flexible floor layout configurations, reconfigurable dining spaces. Owner: Restaurant Operations Lead.
    3. `POS_INTEGRATION` (EXT-003): External POS system integration (Petpooja, Micros, POSist, Toast). Non-bypass invariant: POS events must NEVER bypass trusted inventory or status authorization; dedicated API credentials scoped strictly per restaurant tenant; idempotency keys and audit logging. Owner: POS Integration Product Lead.
    4. `DYNAMIC_DEMAND_PRICING` (EXT-004): Peak-hour table surcharges, demand optimization, algorithmic deposit yield management. Owner: VP Revenue & Growth.
    5. `MULTI_LOCATION_ANALYTICS` (EXT-005): Cross-restaurant chain analytics, group reporting, franchise dashboards while maintaining strict multi-tenant data isolation. Owner: Enterprise Platform Architect.
    6. `MICROSERVICES_DECOMPOSITION` (EXT-006): Proof and measurable scale triggers before considering service splits (`SCALE-001` through `SCALE-005`). Owner: Principal Distributed Systems Architect.
  - Documents the prerequisites, risk criteria, missing requirements, and accountable decision owners for each candidate extension.
  - Documents unresolved operational contracts (`CONTRACT-001` through `CONTRACT-005` covering no-show deposit forfeiture, gateway settlement fee absorption, dispute resolution SLAs, dynamic packages, and review moderation).
  - Explicitly verifies that no first-release dependency relies on any deferred extension.

### 2. Domain Contracts & DTOs (`packages/contracts`)
- **Enums (`packages/contracts/src/enums.ts`)**:
  - `DeferredExtensionId`: `JOINED_TABLES`, `VARIABLE_SEATING`, `POS_INTEGRATION`, `DYNAMIC_DEMAND_PRICING`, `MULTI_LOCATION_ANALYTICS`, `MICROSERVICES_DECOMPOSITION`.
  - `ExtensionStatus`: `DEFERRED`, `CANDIDATE_UNDER_REVIEW`, `BLOCKED_ON_REQUIREMENTS`, `REJECTED`.
  - `ScaleTriggerMetric`: `RESERVATIONS_PER_DAY`, `CONCURRENT_ACTIVE_HOLDS`, `DATABASE_CONNECTION_POOL_SATURATION`, `ENGINEERING_TEAM_CONTENTION`, `P95_LATENCY_BREACH`.
- **Error Codes (`packages/contracts/src/errors.ts`)**:
  - `FEATURE_DEFERRED_TO_FUTURE_RELEASE`: Returns HTTP 501 / RFC 7807 when candidate future routes are requested.
  - `EXTENSION_PREREQUISITES_UNMET`: Prerequisite validation failed.
  - `SPECULATIVE_SCHEMA_PROHIBITED`: Prohibits speculative production schema additions without approved ADR.
  - `SCALE_TRIGGER_THRESHOLD_NOT_MET`: Rejects premature microservices decomposition under ADR-001.
  - `JOINED_TABLES_LOCK_ORDER_VIOLATION`: Rejects unsorted table locking to prevent distributed deadlocks.
  - `POS_AUTHORIZATION_BYPASS_ATTEMPT`: Rejects attempts by external POS to bypass trusted inventory or status checks.
- **DTOs (`packages/contracts/src/dtos.ts`)**:
  - `DeferredExtensionItemDto`, `DeferredScopeRegisterResponseDto`, `ExtensionFeasibilityAssessmentRequestDto`, `ExtensionFeasibilityAssessmentResponseDto`, `MicroserviceDecompositionScaleCheckRequestDto`, `MicroserviceDecompositionScaleCheckResponseDto`, `UnresolvedContractItemDto`, `UnresolvedContractsRegisterResponseDto`, `SimulateDeferredRouteRequestDto`, `SimulateDeferredRouteResponseDto`.

### 3. NestJS Modular Engine Module (`apps/api/src/modules/future-extensions`)
- `FutureExtensionsService`:
  - Task T01: Maintains canonical deferred scope register in code with owners, rationale, status, missing requirements, and risks.
  - Task T02 / AC 1: Evaluates extension feasibility; validates deterministic table lock ordering for joined tables; enforces non-bypass rules for POS; strictly prohibits speculative production schemas.
  - Task T03 / AC 4: Evaluates microservices scale triggers against empirical metrics; enforces ADR-001 modular monolith architecture when metrics remain below scale triggers; requires formal ADR and evidence before decomposition.
  - AC 2: Validates that no unresolved extension in the register is marked as `READY` or `COMPLETED`. All remain in `DEFERRED` status.
  - AC 3: Validates first-release dependency independence; verifies that core epics EPIC-001 through EPIC-019 execute completely without dependency on optional future extensions.
  - Simulates deferred route rejection with RFC 7807 problem details.
- `FutureExtensionsController`:
  - `GET /future-extensions/register`
  - `GET /future-extensions/unresolved-contracts`
  - `POST /future-extensions/evaluate-feasibility`
  - `POST /future-extensions/scale-check`
  - `POST /future-extensions/simulate-deferred-route`
  - `GET /future-extensions/independence-check`
- Documented 6 operational paths in OpenAPI specification (`docs/architecture/openapi.json`).

### 4. Automated Verification Suites
- **Node.js Unit Suite (`tests/unit/future-extensions.test.js`)**: 11 passed tests verifying all tasks and acceptance criteria.
- **Python Verification Suite (`tests/test_ci_cd_verification.py` -> `TestEpic20FutureExtensionsAndUnresolvedScopeDefinition`)**: 11 automated tests verifying documentation, OpenAPI routes, unit test execution, register completeness, prerequisites, invariants, independence, scale triggers, and route rejection.
- **CI Pipeline**: All 8 CI/CD quality gates passed cleanly (`scripts/ci.sh`).
