---
id: "EPIC-006"
title: "Versioned floor plans and table inventory"
type: "epic"
status: "completed"
phase: "C · Inventory"
depends_on: ["EPIC-004"]
prd_requirements: ["Blueprint §4", "Blueprint §5.2", "Blueprint §6.1", "Blueprint §6.4", "Blueprint §12.2", "Blueprint §12.4", "Blueprint §14.4", "Blueprint §19.1"]
risk: "high"
assignee: "Lead Backend & Systems Architect"
summary: "Publish stable table identities and versioned floor geometry without invalidating existing reservations."
---

# EPIC-006 — Versioned floor plans and table inventory

## Objective

Publish stable table identities and versioned floor geometry without invalidating existing reservations.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 4, 5.2, 6.1, 6.4, 12.2, 12.4, 14.4, 19.1. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Floors, floor-plan versions and table geometry with normalized coordinates
- Table capacity, active flag, zone and geometry validation
- Optimistic version guard on owner floor-plan writes
- Safe table retirement and layout edits while historical/current allocations exist

## Out of scope

Floor-plan editor frontend, chair-level booking, joined tables and variable seating configurations.

## Business rules

- MVP selects one physical table, not individual chairs
- Static geometry is separate from time-dependent availability
- Never delete or reuse a table ID that still anchors booking history
- Stale layout version must fail with an actionable conflict rather than overwrite

## Data and API changes

floors(id,restaurant_id); floor_plan_versions(id,floor_id,version); restaurant_tables(id,floor_id,capacity,zone,x,y,w,h,active). Define stable table/version relationship and foreign keys before writing migrations.

GET /restaurants/:id/floor-plan; PUT /owner/restaurants/:id/floor-plan with version guard. Availability includes floor_plan_version for cross-checking.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public geometry is bounded to active published inventory. Only owner/layout editor for that restaurant can edit; record version changes and retired tables.

Use verified identity, restaurant/resource ownership checks and [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Migrate floors, tables and version constraints
- [x] T02 Implement normalized geometry/capacity validators
- [x] T03 Expose floor snapshot with stable table IDs
- [x] T04 Implement owner compare-and-update version contract
- [x] T05 Guard destructive edits against active and historical bookings

## Acceptance criteria

- [x] A floor response includes version, geometry, capacity and stable IDs
- [x] Invalid capacity or geometry fails validation
- [x] Two edits from the same base version cannot silently overwrite each other
- [x] Editing or retiring a held table cannot erase a protected allocation
- [x] Cross-restaurant floor edits are rejected

## Required verification

- Test stale-version concurrent edits and held/booked table retirement
- Check floor→restaurant foreign keys and geometry bounds
- Read floor plan twice and verify stable identities without mutable availability flags

## Dependencies and execution gate

Prerequisites: [EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md).

Real versioned geometry is available through the API; safe owner edits pass conflicts.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- ID replacement breaks exact-table booking history
- Geometry/version mismatch can mislead later clients even when the DB is correct

## Completion report

Completed and verified by Lead Backend & Systems Architect on 07 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Integrity Constraints (T01, T02, T05)**:
  - `supabase/migrations/20261106000006_versioned_floor_plans_and_tables.sql`:
    - Added `current_version` (INTEGER NOT NULL DEFAULT 1) and `updated_at` to `floors`.
    - Added `layout_snapshot` (JSONB NOT NULL DEFAULT '{}'::jsonb), `created_by` (UUID REFERENCES profiles(id)), and `uq_floor_version` (UNIQUE (floor_id, version_number)) to `floor_plan_versions`.
    - Added table constraints to `restaurant_tables`:
      - `check_table_min_covers`: Enforces `min_covers > 0 AND min_covers <= capacity`.
      - `check_table_geometry`: Enforces `x >= 0.0 AND y >= 0.0 AND w > 0.0 AND h > 0.0`.
      - `check_table_bounds`: Enforces bounding canvas constraint `x + w <= 1000.0 AND y + h <= 1000.0`.
    - Configured indexes: `idx_floors_restaurant`, `idx_floor_plan_versions_floor`, and `idx_restaurant_tables_floor_active`.
    - Configured Row Level Security (RLS) on `floors`, `floor_plan_versions`, and `restaurant_tables`:
      - Public SELECT: Restricts reads to published restaurants (`is_published = true`) and active inventory.
      - Staff / Owner ALL: Restricts writes and floor modifications to authenticated members with `OWNER` or `MANAGER` role for that restaurant.
  - Aligned synthetic seed (`supabase/seed.sql`): Updated floors with `current_version: 1`, seeded tables, and anchored active allocation `30000000-0000-0000-0000-000000000001` on table T04 (`f0000000-0000-0000-0000-000000000004`).
- **Drizzle Schema & Shared Contracts (T01, T02)**:
  - `apps/api/src/common/db/schema.ts`: Aligned TypeScript ORM schema with `floors.currentVersion`, `floors.updatedAt`, `floorPlanVersions.layoutSnapshot`, and `floorPlanVersions.createdBy`.
  - `packages/contracts/src/errors.ts`: Added `VERSION_CONFLICT = 'VERSION_CONFLICT'` to standard `ErrorCode` enum.
  - `packages/contracts/src/dtos.ts`: Exported `RestaurantTableDto`, `FloorDto`, `RestaurantFloorPlanDto`, `UpdateFloorPlanTableDto`, `UpdateFloorPlanRequestDto`, and `UpdateFloorPlanResponseDto`.
- **Validation Engine & Geometry Guard (T02)**:
  - `apps/api/src/modules/floor-plans/floor-plans.service.ts`:
    - `validateTableCapacity`: Verifies positive integer capacity and ensures `min_covers` is positive and `<= capacity`.
    - `validateTableGeometry`: Verifies non-negative finite coordinates (`x >= 0, y >= 0`), strictly positive dimensions (`w > 0, h > 0`), and canvas boundaries (`x + w <= 1000, y + h <= 1000`).
    - `validateFloorPlanTables`: Enforces non-empty table lists, non-empty table numbers, and eliminates duplicate table numbers within the layout.
- **Static Floor Snapshot with Stable Identities (T03)**:
  - `apps/api/src/modules/floor-plans/floor-plans.service.ts` (`getActiveFloorPlan`):
    - Fetches floors, active floor plan version, and active tables for a restaurant.
    - Preserves stable UUIDs for tables across queries.
    - Strictly separates static physical geometry from mutable time-dependent availability flags (`is_held`, `available`, etc.).
- **Optimistic Compare-and-Update & Version Guard (T04)**:
  - `apps/api/src/modules/floor-plans/floor-plans.service.ts` (`updateFloorPlan`):
    - Validates `base_version` against `floor.current_version`.
    - Rejects stale versions with 409 Conflict (`VERSION_CONFLICT`).
    - Uses transactional compare-and-update (`UPDATE floors SET current_version = $1 WHERE id = $2 AND current_version = $3`), advancing version to `base_version + 1`.
    - Deactivates previous versions, records historical version snapshot in `floor_plan_versions`, and logs audit trail.
- **Destructive Edits & Protected Allocations Guard (T05)**:
  - Before retiring or omitting any table, queries `table_allocations` and `bookings` for active holds or confirmed reservations (`HELD`, `OFFER_HELD`, `PAYMENT_PENDING`, `PAYMENT_REVIEW`, `CONFIRMED`, `READY`, `SEATED`).
  - Rejects attempts to delete or retire allocated tables with 409 Conflict (`INVENTORY_HOLD_CONFLICT`).
  - Implements soft-retirement (`is_active = false`) for omitted tables, ensuring physical rows are never deleted and historical booking records maintain foreign key integrity.
- **REST Endpoints & Routing Architecture (T03, T04)**:
  - `GET /restaurants/:id/floor-plan`: Public published floor plan and table geometry.
  - `GET /floor-plans/:restaurantId`: Alias endpoint for active floor plan retrieval.
  - `PUT /owner/restaurants/:id/floor-plan`: Owner / Manager endpoint with optimistic version lock and tenant authorization.
  - Fully documented in OpenAPI 3.0 specification (`docs/architecture/openapi.json`).

### 2. Automated Test Suite & CI/CD Verification Evidence
- **Automated Node.js Unit Suite (`tests/unit/floor-plans.test.js`)**:
  - 17 dedicated unit tests passing:
    - `validateTableCapacity`: accepts valid positive integers; rejects zero/negative/non-integer capacity; rejects min_covers > capacity.
    - `validateTableGeometry`: accepts valid coords/dimensions; rejects negative coordinates; rejects zero/negative dimensions; rejects canvas boundary overflow; rejects NaN/non-finite inputs.
    - `validateFloorPlanTables`: validates table arrays; rejects empty tables; rejects duplicate table numbers.
    - `getActiveFloorPlan`: returns static geometry, stable IDs, and version without mutable availability; rejects unknown restaurant with 404 NotFoundError.
    - Tenant isolation: rejects cross-restaurant floor edits with 403 Forbidden.
    - Optimistic concurrency: rejects stale base versions with 409 Conflict (`VERSION_CONFLICT`); prevents silent overwrites between concurrent edits on the same base version.
    - Protected allocation guard: rejects removing or retiring held/confirmed tables with 409 Conflict (`INVENTORY_HOLD_CONFLICT`).
    - Safe retirement: soft-retires unallocated tables (`is_active: false`) and preserves stable table IDs.
- **Automated Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**:
  - Added `TestEpic6VersionedFloorPlansAndTables` with 7 verification gates:
    - `test_floor_plans_node_unit_suite`: Executes Node.js suite (17/17 tests pass).
    - `test_migration_006_floor_plans_and_tables`: Verified migration 6 schema, version tracking, checks, and RLS policies.
    - `test_openapi_floor_plan_routes`: Verified OpenAPI documents `/restaurants/{id}/floor-plan`, `/owner/restaurants/{id}/floor-plan`, and `/floor-plans/{restaurantId}`.
    - `test_python_table_geometry_and_capacity_validation`: Verified geometry bounds and capacity rules.
    - `test_python_optimistic_floor_version_conflict`: Verified optimistic compare-and-update version guard.
    - `test_python_held_table_retirement_and_stable_id_protection`: Verified allocation protection against table deletion/retirement.
    - `test_python_floor_tenant_isolation`: Verified cross-tenant floor updates are rejected.
- **All 45 Python CI/CD verification tests passing**.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passing cleanly with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Versioned floor plans and table inventory ([EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md)) is verified, marked completed, and registered in the delivery dashboard.
- Prerequisite for downstream Availability engine ([EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md)) and Atomic holds engine ([EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md)) is fully satisfied.
