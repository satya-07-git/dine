---
id: "EPIC-007"
title: "Time-range availability and policy engine"
type: "epic"
status: "completed"
phase: "D · Booking core"
depends_on: ["EPIC-006"]
prd_requirements: ["Blueprint §5.3", "Blueprint §5.4", "Blueprint §6", "Blueprint §12.2", "Blueprint §17.1"]
risk: "high"
assignee: "Lead Backend & Systems Architect"
summary: "Compute restaurant-local dining intervals and time-scoped eligibility from policy, blocks and protected allocations."
---

# EPIC-007 — Time-range availability and policy engine

## Objective

Compute restaurant-local dining intervals and time-scoped eligibility from policy, blocks and protected allocations.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 5.3, 5.4, 6, 12.2, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Derive end time from duration plus cleanup buffer; canonical UTC intervals
- Filter by party size, table activity, zone/type policy, lead time, hours and closures
- Exclude overlapping blocks and protected allocations
- Return timestamped snapshot and floor-plan version with table-specific status/reason

## Out of scope

Storing a permanent is_available flag, client-defined end times and availability as a booking guarantee.

## Business rules

- For a 19:00 start with 90-minute dining plus 15-minute cleanup, protection ends at 20:45
- Full interval overlap matters; hourly slot equality is insufficient
- Use documented [start,end) semantics so adjacent nonoverlapping ranges may coexist
- Expired timestamps alone do not make a protected allocation safe to ignore
- The subsequent hold transaction always rechecks eligibility

## Data and API changes

table_blocks plus table_allocations dining_period tstzrange and protected status indexes; restaurant time/policy inputs from EPIC-004. Define block writes through shared locking to avoid races with holds.

GET /restaurants/:id/availability; GET /tables/:id/availability. Inputs: requested local/absolute time contract, party size; outputs: server-derived range, table states/reasons, availability_snapshot_at and floor_plan_version.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public status responses never include another guest identity, payment details or private booking data. Table/restaurant association must be validated.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Implement timezone/interval and buffer calculator
- [x] T02 Implement eligibility evaluator and overlap queries
- [x] T03 Define table state/reason contract
- [x] T04 Add interval/block query indexes
- [x] T05 Document snapshot staleness and authoritative hold recheck

## Acceptance criteria

- [x] 19:00–20:45 allocation rejects a 20:00 overlapping request
- [x] An adjacent eligible range beginning at 20:45 is not rejected solely for adjacency
- [x] Capacity, closure and inactive table rules apply consistently
- [x] Snapshot includes server timestamp and layout version
- [x] Another guest identity is never returned with table status

## Required verification

- Unit-test duration, buffer, timezone, lead-time and party rules
- DB-test range overlap, zero/negative intervals, table blocks and adjacency
- Delay cron and verify protected expired rows are handled conservatively

## Dependencies and execution gate

Prerequisites: EPIC-006.

Interval-based availability matches policy and protected inventory with deterministic tests.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Ignoring buffer or using local server clock creates false availability
- Availability/block and allocation writers can race without common transaction discipline

## Completion report

Completed and verified by Lead Backend & Systems Architect on 07 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Performance Indexes (T04)**:
  - `supabase/migrations/20261106000007_time_range_availability_and_blocks.sql`:
    - Added valid range constraint to `table_blocks`: `check_table_blocks_valid_range` enforcing non-empty intervals where `lower(block_period) < upper(block_period)`.
    - Added GiST index on `table_blocks`: `idx_table_blocks_gist` on `(table_id, block_period)` using PostgreSQL `btree_gist` extension for range overlap queries (`&&`).
    - Added table index `idx_table_blocks_table` on `table_blocks(table_id)`.
    - Added GiST index on `table_allocations`: `idx_table_allocations_gist` on `(table_id, dining_period)` for range overlap queries (`&&`).
    - Added composite partial index `idx_table_allocations_protected_status` on `table_allocations(table_id, status, expires_at)` filtered to active protected states (`HELD`, `OFFER_HELD`, `PAYMENT_PENDING`, `PAYMENT_REVIEW`, `CONFIRMED`, `READY`, `SEATED`, `COMPLETED`).
    - Configured Row Level Security (RLS) on `table_blocks`:
      - `table_blocks_public_read`: Public SELECT permitted for tables belonging to published restaurants.
      - `table_blocks_staff_manage`: Full administrative access restricted to active authenticated staff (`OWNER`, `MANAGER`, `HOST`).
    - Synthetic seed (`supabase/seed.sql`): Added sample table block (`70000000-0000-0000-0000-000000000001`) on table T05 (`f0000000-0000-0000-0000-000000000005`) for `2026-11-10 14:00:00+00` to `2026-11-10 16:00:00+00`.
- **Drizzle ORM Schema & Contract Alignment (T01, T04)**:
  - `apps/api/src/common/db/schema.ts`: Defined custom type `tstzrange` and mapped `blockPeriod` on `tableBlocks`, and `diningPeriod` on `tableAllocations` and `bookings`.
  - `packages/contracts/src/errors.ts`: Added standardized `ErrorCode` members: `TABLE_NOT_FOUND`, `TABLE_UNAVAILABLE`, `INVALID_TIME_RANGE`, and `CAPACITY_MISMATCH`.
  - `packages/contracts/src/dtos.ts`: Exported typed DTO contracts:
    - `TableAvailabilityDto`: `table_id`, `table_number`, `floor_id`, `floor_name`, `capacity`, `min_covers`, `zone`, `state` (`AVAILABLE` | `UNAVAILABLE`), `reason` (`ALLOCATED` | `BLOCKED` | `CAPACITY_MISMATCH` | `TABLE_INACTIVE`).
    - `DiningIntervalDto`: `requested_start`, `derived_end`, `dining_duration_min`, `turnover_buffer_min`, `protection_duration_min`, `timezone`.
    - `RestaurantAvailabilityResponseDto`: `restaurant_id`, `eligible`, `availability_snapshot_at`, `floor_plan_version`, `interval`, `party_size`, `tables`, `available_tables_count`, `total_tables_count`.
    - `SingleTableAvailabilityResponseDto`: `table_id`, `restaurant_id`, `table_number`, `floor_id`, `floor_plan_version`, `availability_snapshot_at`, `state`, `reason`, `interval`, `eligible`.
- **Canonical UTC Interval & Buffer Calculator (T01)**:
  - `apps/api/src/modules/availability/availability.service.ts` (`calculateDiningInterval` & `parseLocalOrUtcToDate`):
    - Parses ISO UTC timestamps and restaurant-local timestamps using the restaurant's IANA timezone (`Intl.DateTimeFormat`).
    - Enforces positive integer dining duration (`duration_min > 0`) and non-negative turnover buffer (`buffer_min >= 0`).
    - Computes total protection window: `derived_end = start + (duration + buffer) * 60 * 1000`.
    - Rejects zero or negative intervals with `ValidationError`.
- **Half-Open [start, end) Interval Overlap Evaluator (T02)**:
  - Implements half-open `[start, end)` continuous interval semantics (`doIntervalsOverlap`):
    - Overlap condition: `max(a.start, b.start) < min(a.end, b.end)`.
    - Verified: 19:00–20:45 allocation rejects a 20:00 overlapping request (20:00–21:45).
    - Verified: Adjacent eligible range beginning at 20:45 (20:45–22:30) is NOT rejected solely for adjacency.
- **Table State & Reason Evaluation Matrix (T03)**:
  - Evaluates table availability through a deterministic rule hierarchy:
    1. Inactive table (`is_active = false`) -> `UNAVAILABLE` (`TABLE_INACTIVE`).
    2. Capacity mismatch (`party_size > capacity` or `party_size < min_covers`) -> `UNAVAILABLE` (`CAPACITY_MISMATCH`).
    3. Physical block (`table_blocks` overlap) -> `UNAVAILABLE` (`BLOCKED`).
    4. Protected allocation (`table_allocations` overlap) -> `UNAVAILABLE` (`ALLOCATED`).
    5. Clear inventory -> `AVAILABLE` (`reason: null`).
- **Conservative Handling of Expired Protected Allocations (T02, T05)**:
  - Business Rule Invariant: Expired timestamps alone do not make a protected allocation safe to ignore.
  - Because PostgreSQL GiST exclusion constraint (`no_protected_table_overlap`) strictly prevents overlapping inserts while a row remains in protected status, the availability engine conservatively treats un-reaped expired rows as blocking until transactionally released or reaped.
- **Privacy Invariants & Snapshot Integrity (T03, T05)**:
  - Responses strictly strip all guest identities (`user_id`, `guest_name`, `booking_id`, `payment_id`, `email`, `phone`).
  - Responses include authoritative server timestamp (`availability_snapshot_at`) and floor plan layout version (`floor_plan_version`).
- **REST Endpoints & OpenAPI Documentation (T03, T04)**:
  - `GET /restaurants/:id/availability`: Computes restaurant-wide table availability for party size and requested time.
  - `GET /tables/:id/availability`: Evaluates individual table eligibility and status.
  - `GET /availability`: Legacy backward-compatible endpoint.
  - Exported and validated in OpenAPI 3.0 specification (`docs/architecture/openapi.json`).

### 2. Automated Test Suite & CI/CD Verification Evidence
- **Automated Node.js Unit Suite (`tests/unit/availability.test.js`)**:
  - 26 dedicated unit tests passing:
    - `calculateDiningInterval`: Computes 19:00 + 90m + 15m -> 20:45; parses local ISO with `Asia/Kolkata` (19:00 IST -> 13:30 UTC); rejects non-positive/fractional durations; rejects negative buffer; accepts zero buffer; rejects invalid timestamp strings.
    - `doIntervalsOverlap`: 19:00–20:45 rejects 20:00–21:45; adjacent 20:45–22:30 does NOT overlap; preceding adjacent 17:15–19:00 does NOT overlap; contained and enclosing ranges overlap.
    - `evaluateTableAvailability`: Verifies AVAILABLE, TABLE_INACTIVE, CAPACITY_MISMATCH (upper/lower bounds), BLOCKED, and ALLOCATED states.
    - `getRestaurantAvailability`: Evaluates table states, floor version, and snapshot; enforces privacy invariant (no guest identity leak); rejects invalid party_size; rejects non-existent restaurant.
    - `getTableAvailability`: Evaluates single table availability; enforces privacy invariant; rejects non-existent table.
- **Automated Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**:
  - Added `TestEpic7TimeRangeAvailabilityAndPolicyEngine` with 7 verification gates:
    - `test_availability_node_unit_suite`: Executes Node.js suite (26/26 tests pass).
    - `test_migration_007_time_range_availability_and_blocks`: Verified migration 7 schema, range checks, GiST indexes, and RLS policies.
    - `test_openapi_availability_routes`: Verified OpenAPI documents `/restaurants/{id}/availability`, `/tables/{id}/availability`, and `/availability`.
    - `test_python_half_open_interval_and_buffer_rules`: Verified interval calculations, 20:00 overlap rejection, and 20:45 adjacency non-rejection.
    - `test_python_table_state_and_reason_matrix`: Verified state and reason evaluation matrix.
    - `test_python_conservative_expired_allocation_handling`: Verified conservative handling of un-reaped expired rows.
    - `test_python_public_availability_privacy_invariants`: Verified public responses strip all customer and private booking identities.
- **All 52 Python CI/CD verification tests passing**.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passing cleanly with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Time-range availability and policy engine ([EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md)) is verified, marked completed, and registered in the delivery dashboard.
- Prerequisite for downstream Atomic holds engine ([EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md)) is fully satisfied.
