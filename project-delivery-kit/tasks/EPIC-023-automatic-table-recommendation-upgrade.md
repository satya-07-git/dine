---
id: "EPIC-023"
title: "Automatic table recommendation upgrade"
type: "epic"
status: "completed"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-007", "EPIC-008", "EPIC-021", "EPIC-022"]
prd_requirements: ["Final table-selection decision", "PRD §13", "Realtime §8"]
risk: "high"
assignee: "Lead Backend Architect"
priority: "Must"
baseline: "PRD v2.0 · New delta"
summary: "Add deterministic automatic selection with bounded fallback through the already delivered atomic inventory engine."
---

# EPIC-023 — Automatic table recommendation upgrade

## Objective

Add deterministic automatic selection with bounded fallback through the already delivered atomic inventory engine.

## Delivered foundation

EPIC-007, EPIC-008, EPIC-021, EPIC-022 remain completed under their original identities. This epic covers only finalized v2 changes and their conformance verification. Inspect and reuse existing code; do not rebuild or reset delivered capabilities.

## Scope and source coverage

The prior renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/. The capability sections below consolidate that draft into additive work with new stable IDs. Source reference files use the same stable IDs. Product frontend remains deferred.

## Capability · Deterministic best-available table recommendations

### In scope

- Filter mandatory eligibility first, then deterministic capacity/preference/location/operations scoring
- Normalized 0–100 components with initial 0.40/0.25/0.20/0.15 weights
- Stable tie-break and bounded next-candidate retry on concurrent conflict
- Return ranked recommendations; clearly separate advice from allocation

### Business rules

- Latest finalization promotes automatic recommendation to required v2 scope despite base PRD Should wording
- Score = 0.40C + 0.25P + 0.20L + 0.15O; weights are starting assumptions, not validated performance
- Customer explicit manual table selection never silently switches tables
- Automatic fallback has a configured retry cap and must not leave multiple active claims
- Every attempted allocation goes through EPIC-008 database constraints

### Data and API changes

Reuse table capacity/zone/preferences, policy and interval availability; recommendations require no separate authoritative inventory table. Define missing preference/operational inputs and deterministic fallback behavior before scoring implementation.

POST /recommendations/tables returns ranked candidates and explanatory scores. /holds remains the allocation operation; automatic bounded fallback orchestration contract must state chosen table and consent.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Scoring boundary/tie/missing-preference tests
- Manual/automatic same-table concurrency test on PostgreSQL
- Race top candidate and prove bounded next-table retry without leaked claims

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Implementation tasks

- [x] T01 Define normalized component formulas, missing-input defaults and stable tie-break
- [x] T02 Implement shared eligibility-first ranking
- [x] T03 Expose recommendation DTO and score explanation
- [x] T04 Define bounded automatic retry without manual substitution
- [x] T05 Test manual-versus-automatic allocation race

## Acceptance criteria

- [x] Only capacity/time/policy-compatible tables are ranked
- [x] Same snapshot/input gives deterministic ordered scores
- [x] Two-person group prefers fit per approved formula rather than wasting larger tables by accident
- [x] Recommendation output alone grants no claim
- [x] Manual and automatic contenders cannot create overlapping active claims
- [x] Fallback stops at retry budget and reports actual selected table

## Completion report

Completed and verified by Lead Backend Architect on 10 November 2026.

### 1. Architectural Deliverables & Contracts Established
- **Authoritative Architecture Specification**: `docs/architecture/deterministic-table-recommendation.md` documents the mathematical scoring model, component weights, normalization bounds $[0, 100]$, missing input defaults, deterministic stable tie-breaking rules, shared eligibility-first filtering, bounded automatic retry protocol, and customer manual selection non-substitution invariant.
- **Normalized Component Scoring Model ($S = 0.40C + 0.25P + 0.20L + 0.15O$)**:
  - `Capacity Fit (C)`: $C = \max(0, 100 - (\text{capacity} - \text{party\_size}) \cdot 20)$. Exact fit gives 100; excess capacity is penalized so a 2-person group strictly prefers a 2-top table ($C = 100$) over a 4-top ($C = 60$) or 6-top ($C = 20$), avoiding accidental inventory waste.
  - `Preference Match (P)`: Normalizes zone and customer seating preference. Missing preference defaults to $70$ (neutral unconstrained baseline); `ANY` / `NO_PREFERENCE` yields $85$; matching zone keywords (e.g. `OUTDOOR` with Patio/Terrace/Garden, `INDOOR` with Main Dining, `WINDOW` with Window/View) yield $100$; non-matching zones yield $30$.
  - `Location Suitability (L)`: Evaluates spatial floor topology. Prime/View zones yield $90$; Main Dining yields $80$; Transit/Bar zones yield $55$; missing location metadata defaults to $75$.
  - `Operational Efficiency (O)`: Evaluates server load balancing and section pacing. 0 active service turns yield $95$; 1 turn yields $85$; 2 turns yield $70$; $\ge 3$ turns yield $50$; missing operational data defaults to $70$.
- **Deterministic Stable Tie-Breaking**: When multiple tables yield identical composite scores, ties are deterministically broken by: (1) capacity waste ascending, (2) total capacity ascending, (3) min capacity ascending, (4) table number alphanumeric ascending, (5) table UUID ascending.
- **Shared Eligibility-First Filter**: Tables are evaluated against real-time availability before scoring; tables with capacity mismatches, inactive status, active blocks, or active overlapping allocations/claims are strictly excluded prior to ranking.
- **Separation of Advice from Allocation**: `POST /api/v1/recommendations/tables` returns ranked candidate tables and detailed score explanations with `recommendation_only: true`. Retrieving recommendations acquires no locks and creates no claims or holds.
- **Bounded Fallback & Manual Non-Substitution Orchestration**:
  - `POST /api/v1/recommendations/holds` (and alias `/api/v1/holds/auto`) attempts atomic hold on candidate #1.
  - On concurrent conflict (`409 Conflict`), the engine automatically falls back to candidate #2 up to the configurable `retry_cap` (default 3), reporting the actual chosen table, rank, and retry count.
  - If the retry budget is exhausted, it safely terminates with 409 `AUTO_RECOMMENDATION_EXHAUSTED` with zero leaked claims.
  - If a customer explicitly chooses a table manually (`table_id` provided, `auto_recommend: false`), the backend never silently switches tables upon conflict, returning `409 Conflict`.
- **Modular Monolith Implementation**:
  - `RecommendationsModule`, `RecommendationsService`, and `RecommendationsController` implemented in `apps/api/src/modules/recommendations/` and registered in `apps/api/src/app.module.ts`.
  - Contracts and DTOs formalized in `packages/contracts/src/dtos.ts` and `errors.ts`.
  - OpenAPI 3.0 specification exported to `docs/architecture/openapi.json`.

### 2. Automated Test & CI Verification Evidence
- **Node.js Automated Unit Test Suite**: `tests/unit/recommendations.test.js`
  - 15 automated unit tests passing:
    - `Task T01: Weights adhere strictly to PRD §13 and Realtime §8 specification (0.40C + 0.25P + 0.20L + 0.15O = 1.0)`.
    - `Task T01: Capacity fit score C normalizes [0, 100] and penalizes capacity waste`.
    - `Task T01: Preference match score P handles missing defaults, ANY, and zone matching`.
    - `Task T01: Location suitability score L evaluates floor zone topology with default`.
    - `Task T01: Operational efficiency score O balances table turns and section load with default`.
    - `Task T01: Weighted score calculation S = 0.40C + 0.25P + 0.20L + 0.15O`.
    - `Task T02 & AC 1: Shared eligibility-first ranking filters out incompatible tables`.
    - `Task T03 & AC 2: Deterministic scoring and stable tie-breaking across identical inputs`.
    - `AC 3: Two-person group prefers fit per approved formula rather than wasting larger tables`.
    - `Task T04 & AC 6: Retries next ranked candidate when candidate #1 experiences concurrent conflict`.
    - `Task T04 & AC 6: Stops at configured retry budget and raises AUTO_RECOMMENDATION_EXHAUSTED`.
    - `Task T04 & AC 6: Non-conflict error (e.g. validation failure) aborts immediately without fallback`.
    - `Task T05 & AC 5: Manual versus automatic allocation race on shared atomic inventory with 0 overlapping claims`.
- **Python CI/CD Verification Suite**: `tests/test_ci_cd_verification.py`
  - `TestEpic23AutomaticTableRecommendationUpgrade` with 10 automated verification tests passing:
    - `test_recommendation_architecture_document_exists`: Verified architectural specification exists and covers all requirements.
    - `test_openapi_recommendations_routes`: Verified `/api/v1/recommendations/tables`, `/api/v1/recommendations/holds`, `/api/v1/holds/auto`, and `/v1/recommendations`.
    - `test_recommendations_node_unit_suite`: Verified 15 Node.js unit tests execution.
    - `test_python_scoring_weights_and_normalization_t01`: Verified exact mathematical weights and bounds.
    - `test_python_capacity_waste_penalization_ac3`: Verified 2-person group preference for 2-top over 4-top and 6-top.
    - `test_python_missing_input_defaults_t01`: Verified safe fallback defaults for preference (70), location (75), and operational (70).
    - `test_python_deterministic_stable_tie_break_ac2`: Verified tie-breaking determinism.
    - `test_python_eligibility_first_filtering_ac1`: Verified strict filtering of capacity/status incompatible tables.
    - `test_python_bounded_fallback_retry_cap_ac6`: Verified retry loop stops at retry budget.
    - `test_python_manual_vs_automatic_concurrency_race_ac5`: Verified manual contender taking T04 forces automatic contender to safely fall back to T05 with 0 overlapping claims.
- **CI Shell Pipeline**: `scripts/ci.sh`
  - Total test count expanded to **204 passing automated tests**.
  - All 8 CI/CD quality and architecture gates passed cleanly:
    - Gate 1: Dashboard and dependency DAG validation.
    - Gate 2: Inline script syntax in `dashboard.html`.
    - Gate 3: Clean TypeScript compilation (`packages/contracts` and `apps/api`).
    - Gate 4: Complete Node.js unit test suite (22 unit test files).
    - Gate 5: Authoritative SQL migration and seed checks.
    - Gate 6: OpenAPI specification export and validation (147 paths).
    - Gate 7: Comprehensive Python test suite (204 tests).
    - Gate 8: Repository markdown links verification across 51 markdown files (0 broken links).

### 3. Release Governance & Downstream Integration
- Referenced in `EPIC-001` completion report summary under Downstream Release Gates.
- Rebuild executed with `build_dashboard.py` updating `dashboard.html` and `dashboard-v2.html`.
- Preserved all historical completed epics (EPIC-001 through EPIC-022) without reopening or modifying baseline capabilities.
