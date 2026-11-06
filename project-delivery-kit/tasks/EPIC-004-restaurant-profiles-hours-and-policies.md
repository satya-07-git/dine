---
id: "EPIC-004"
title: "Restaurant profiles, hours and policies"
type: "epic"
status: "completed"
phase: "C · Inventory"
depends_on: ["EPIC-003"]
prd_requirements: ["Blueprint §1.3", "Blueprint §4", "Blueprint §5.2", "Blueprint §6.2", "Blueprint §9.1", "Blueprint §12.2", "Blueprint §12.4", "Blueprint §19.1"]
risk: "high"
assignee: "Lead Backend & Systems Architect"
summary: "Model a restaurant, its local operating calendar and versioned reservation rules used by every inventory decision."
---

# EPIC-004 — Restaurant profiles, hours and policies

## Objective

Model a restaurant, its local operating calendar and versioned reservation rules used by every inventory decision.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.3, 4, 5.2, 6.2, 9.1, 12.2, 12.4, 19.1. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Restaurant profile, location, timezone, cuisine associations and published eligibility
- Opening hours, special closures, lead time and supported party sizes
- Dining duration, clean-up buffer and free/deposit policy configuration
- Owner-authorized policy changes with audit and compatibility checks for existing bookings

## Out of scope

Multi-location analytics, advanced dynamic pricing, full meal billing and assumed refund/tax policy.

## Business rules

- Use restaurant timezone for eligibility; persist instants in UTC/timestamptz
- Server derives duration, buffer, amount and hold deadline
- A policy edit cannot silently change a historical booking obligation
- Closures and table blocks must be respected on hold creation, not just public reads

## Data and API changes

restaurants(id,location geography(Point,4326),timezone,policy_id); opening_hours; special_closures; cuisines; restaurant_cuisines. Policy history/snapshot representation must be finalized during schema work.

GET /restaurants/:id; PATCH /owner/restaurants/:id/policies; POST /owner/restaurants/:id/closures. Profile/hour management writes need an explicit OpenAPI addition before coding.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public reads return published fields only. Owners edit policy; only authorized scheduling staff add closures. Every change records actor, restaurant, before/after reference and request_id.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Create restaurant/calendar/policy schema and seed
- [x] T02 Validate timezone, hours and capacity/lead-time policies
- [x] T03 Implement published detail read and guarded policy/closure actions
- [x] T04 Define existing-booking behavior for closure/policy edits
- [x] T05 Connect policy evaluator to availability/hold services

## Acceptance criteria

- [x] Closed dates and out-of-hours requests are ineligible
- [x] Invalid or missing timezone is rejected at configuration
- [x] DEPOSIT_REQUIRED validates positive integer minor-unit amount and currency
- [x] Policy changes preserve existing confirmed allocation history
- [x] Restaurant A staff cannot change B policy

## Required verification

- Test midnight/overnight opening intervals and timezone boundaries
- Test closure conflicts against future bookings and configured buffer
- Test free and deposit policy DTO validation and authorization

## Dependencies and execution gate

Prerequisites: [EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md).

Restaurant policy and hours can be read and safely managed through scoped API contracts.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Local date interpreted in server timezone can book the wrong interval
- Closure edits can invalidate inventory unless conflict behavior is explicit

## Completion report

Completed and verified by Lead Backend & Systems Architect on 06 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Seed (T01)**:
  - `supabase/migrations/20261106000004_restaurant_profiles_hours_and_policies.sql`:
    - Created `cuisines` table and `restaurant_cuisines` relational junction with composite primary key.
    - Extended `restaurants` table with `policy_version`, `deposit_currency` (ISO 4217), `min_party_size`, `max_party_size`, `lead_time_min_minutes`, `lead_time_max_days`, `latitude`, `longitude`, and PostGIS `geography(Point, 4326)` column.
    - Created immutable `restaurant_policy_history` table for monotonic policy snapshots (`restaurant_id`, `version`, `policy_mode`, `deposit_amount_minor`, `default_duration_min`, `turnover_buffer_min`, `changed_by`, `change_reason`).
    - Added check constraints on operating intervals and special closures (`end_time > start_time`).
    - Configured Row Level Security (RLS) on `cuisines`, `restaurant_cuisines`, `opening_hours`, `special_closures`, and `restaurant_policy_history`.
  - `supabase/seed.sql`: Seeded 4 cuisine categories, restaurant-cuisine links, initial policy history versions, and scheduled special closure test data.
- **Drizzle Schema & Shared Contracts (T01, T02)**:
  - `apps/api/src/common/db/schema.ts`: Aligned TypeScript ORM schema with `cuisines`, `restaurantCuisines`, `restaurantPolicyHistory`, and updated `restaurants` attributes.
  - `packages/contracts/src/dtos.ts`: Exported `RestaurantResponseDto`, `UpdateRestaurantPolicyDto`, `CreateSpecialClosureDto`, `OpeningHourDto`, `SpecialClosureDto`, and `CuisineDto`.
- **Policy & Calendar Evaluation Engine (T02, T04, T05)**:
  - `apps/api/src/modules/restaurants/restaurant-policy.service.ts`:
    - `isValidIanaTimezone`: Strict IANA timezone validation using `Intl.DateTimeFormat`.
    - `validatePolicyConfig`: Validates timezone format, enforces positive integer minor units for `DEPOSIT_REQUIRED`, verifies 3-letter currency codes, and checks party size and duration bounds.
    - `isWithinOpeningHours`: Evaluates standard same-day operating hours and overnight / midnight intervals (e.g. 18:00 to 02:00 next day).
    - `evaluateReservationEligibility`: Converts requested UTC instants to restaurant's local timezone, checks lead time, checks special closure intersections, verifies party size bounds, and outputs an immutable `policySnapshot`.
    - `checkClosureConflicts`: Detects conflicts between proposed closures and existing confirmed bookings including the turnaround buffer.
    - `updatePolicies`: Version-increments restaurant policies, archives previous version into `restaurant_policy_history`, and logs audit entries in `audit_logs`.
    - `addSpecialClosure`: Validates closure interval, detects conflicts with future bookings, and records an audited closure.
- **REST Endpoints & Scoped Authorization (T03)**:
  - `GET /restaurants/:id`: Public endpoint returning published restaurant profile, operating hours, upcoming closures, cuisines, and current booking policy.
  - `PATCH /owner/restaurants/:id/policies`: Scoped endpoint guarded by `AuthGuard`, `TenantGuard`, and `@RequireRestaurantRoles('OWNER')`. Rejects cross-tenant attempts with 403 `FORBIDDEN_TENANT_ACCESS`.
  - `POST /owner/restaurants/:id/closures`: Scoped endpoint guarded by `TenantGuard` requiring `OWNER` or `MANAGER` role. Rejects conflicts with 409 `ConflictError`.
  - `GET /owner/restaurants/:id/closures`: Staff list of closures.
  - `GET /owner/restaurants/:id/policy-history`: Owner view of policy version history.
- **Integration with Availability Core (T05)**:
  - `apps/api/src/modules/availability/availability.service.ts`: Directly integrates `RestaurantPolicyService.evaluateReservationEligibility` so closed dates and out-of-hours requests are marked ineligible with explicit diagnostic reasons.

### 2. Automated Test Suite & CI/CD Verification Evidence
- **Automated Node.js Unit Suite (`tests/unit/restaurant-policy.test.js`)**:
  - 23 dedicated unit tests passing:
    - Timezone validation: accepts valid IANA zones; rejects invalid, empty, or missing timezones with `ValidationError`.
    - Deposit validation: `DEPOSIT_REQUIRED` strictly validates positive integer minor units (`deposit_amount_minor > 0`) and valid currency; rejects zero, negative, or fractional amounts.
    - Operating hours & overnight calculation: verified standard 11:00-23:00 hours, overnight 18:00-02:00 intervals, and timezone conversions (UTC to Asia/Kolkata +5:30).
    - Special closures: verified closure intersection logic including turnaround buffer.
    - Multi-tenant RBAC: verified Restaurant 1 Owner can edit policies, Restaurant 1 staff cannot edit Restaurant 2 (403), Host cannot edit policies (403), Manager can schedule closures.
    - Historical booking obligation preservation: verified existing booking `policy_snapshot` remains immutable when restaurant policy advances.
- **Automated Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**:
  - Added `TestEpic4RestaurantProfilesAndPolicies` with 6 verification gates:
    - `test_restaurant_policy_node_unit_suite`: Executes Node.js suite (23/23 tests pass).
    - `test_migration_004_restaurant_profiles_and_policies`: Verified migration 4 tables, columns, indexes, and RLS.
    - `test_openapi_restaurant_and_owner_policy_routes`: Verified OpenAPI documents `/restaurants/{id}`, `/owner/restaurants/{id}/policies`, `/owner/restaurants/{id}/closures`, and `/owner/restaurants/{id}/policy-history`.
    - `test_python_operating_hours_midnight_and_timezone_boundary`: Verified timezone conversions and overnight intervals.
    - `test_python_closure_conflict_and_buffer_detection`: Verified closure conflict detection with buffer.
    - `test_python_deposit_validation_and_history_preservation`: Verified deposit validation and policy history snapshot preservation.
- **All 32 Python CI/CD verification tests passing**.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI/CD quality gates passing cleanly with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Restaurant profiles, hours and policies ([EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md)) is verified, marked completed, and registered in the delivery dashboard.
- Prerequisite for downstream Phase 3 / Inventory tasks ([EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md): Versioned floor plans and table inventory) and Phase 4 / Availability engine ([EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md)) is fully satisfied.
