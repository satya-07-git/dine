---
id: "EPIC-015"
title: "Dining experiences and package contracts"
type: "epic"
status: "completed"
phase: "G · Restaurant operations"
depends_on: ["EPIC-004", "EPIC-009"]
prd_requirements: ["Blueprint §1.1", "Blueprint §4", "Blueprint §12.2", "Blueprint §16.2"]
risk: "medium"
assignee: "Lead Backend Architect"
summary: "Expose restaurant dining packages and define bounded booking rules without turning packages into a separate inventory system."
---

# EPIC-015 — Dining experiences and package contracts

## Objective

Expose restaurant dining packages and define bounded booking rules without turning packages into a separate inventory system.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 4, 12.2, 16.2. Delivery stage: G · Restaurant operations. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository deliverable verified through automated CI/CD quality gates. Dependencies are capability prerequisites.

## In scope

- Restaurant package/celebration option read model
- Define package capacity, eligibility and limits with restaurant ownership
- Agree whether package selection affects duration, deposit or availability before booking integration
- Keep package use inside canonical reservation policy and allocation checks

## Out of scope

Unspecified event-commerce engine, dynamic pricing, joined-table events and frontend package presentation.

## Business rules

- Packages cannot bypass one-table MVP or protected allocation checks
- The blueprint names packages and limits but does not specify complete purchase semantics
- If package terms change amount/duration, server computes and snapshots approved terms
- Unresolved package business rules remain gated instead of silently invented

## Data and API changes

Blueprint does not define package table fields. Specify package identity, restaurant FK, limits, publication/version and optional booking reference in an implementation contract before SQL migration.

GET /restaurants/:id/packages. Owner package management and booking selection fields need an explicit reviewed contract; no additional route is claimed as source-defined.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public reads expose published package terms. Owner/authorized manager scope package changes and audit term versions.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Define package MVP fields and eligibility limits
- [x] T02 Resolve reservation/deposit/duration effect
- [x] T03 Add approved schema and public read contract
- [x] T04 Wire package validation to reservation policy if pilot needs it

## Acceptance criteria

- [x] Every package belongs to the requested restaurant
- [x] Missing purchase rules are documented and block that behavior
- [x] A selected package cannot change protected interval or price via client input
- [x] Booking still respects the one-table and no-overlap invariant

## Required verification

- Validate restaurant ownership and package visibility
- If integration is enabled, test capacity, retired package and changed terms
- Verify package read does not reveal private reservation data

## Dependencies and execution gate

Prerequisites: EPIC-004, EPIC-009.

Package read and any approved pilot booking behavior pass; unapproved semantics remain explicitly gated.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A catalog endpoint does not define a full commerce contract
- A package changing dining duration can invalidate availability if applied after hold

## Completion report

### Deliverables Implemented & Verified

1. **Authoritative SQL Migration (`supabase/migrations/20261106000015_dining_experiences_and_packages.sql`)**:
   - Created `packages` table with columns: `id` (UUID PRIMARY KEY), `restaurant_id` (UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE), `name` (VARCHAR(150)), `slug` (VARCHAR(150)), `description` (TEXT), `price_minor` (INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0)), `currency` (VARCHAR(3) NOT NULL DEFAULT 'INR'), `duration_min` (INTEGER NOT NULL DEFAULT 90 CHECK (duration_min >= 30 AND duration_min <= 360)), `min_party_size` (INTEGER NOT NULL DEFAULT 1 CHECK (min_party_size > 0)), `max_party_size` (INTEGER NOT NULL DEFAULT 20 CHECK (max_party_size >= min_party_size)), `is_published` (BOOLEAN NOT NULL DEFAULT TRUE), `version` (INTEGER NOT NULL DEFAULT 1), `terms_and_conditions` (TEXT), `created_at`, `updated_at`.
   - Enforced uniqueness per restaurant and slug: `CONSTRAINT uq_restaurant_package_slug UNIQUE (restaurant_id, slug)`.
   - Extended `bookings` table with `package_id` (UUID REFERENCES packages(id) ON DELETE SET NULL) and `package_snapshot` (JSONB NOT NULL DEFAULT '{}'::jsonb) for immutable terms snapshotting.
   - Added performance indices: `idx_packages_restaurant_published` and `idx_bookings_package_id`.
   - Enabled Row Level Security (RLS) on `packages`: public read policy (`packages_public_read` for `is_published = TRUE`) and staff management policy (`packages_staff_manage` for active `OWNER` / `MANAGER` roles).

2. **Domain Contracts & DTOs (`packages/contracts`)**:
   - Added standard Problem Details error codes in `packages/contracts/src/errors.ts`: `PACKAGE_NOT_FOUND`, `PACKAGE_RESTAURANT_MISMATCH`, `PACKAGE_PARTY_SIZE_EXCEEDED`, `PACKAGE_INACTIVE`, `PACKAGE_TERMS_CHANGED`, and `PACKAGE_COMMERCE_GATED`.
   - Added typed domain DTOs in `packages/contracts/src/dtos.ts`:
     - `RestaurantPackageDto`
     - `CreatePackageRequestDto`
     - `UpdatePackageRequestDto`
     - `PackageListResponseDto`
     - `PackageSnapshotDto`
     - Extended `CreateHoldRequestDto` with optional `package_id?: string;`.
     - Extended `BookingHoldResponseDto` with optional `package?: PackageSnapshotDto | null;`.

3. **NestJS Modular Monolith Architecture (`apps/api/src/modules/packages/`)**:
   - **`PackagesService` (`apps/api/src/modules/packages/packages.service.ts`)**:
     - `getPublishedPackages(restaurantId)`: Public read of published packages. Strictly excludes unpublished packages, retired venues, and customer/financial secrets.
     - `getPackageById(restaurantId, packageId)`: Single package read with cross-tenant ownership guard rejecting foreign restaurant packages with 403 Forbidden (`PACKAGE_RESTAURANT_MISMATCH`).
     - `getOwnerPackages(staffUserId, restaurantId)`: Staff-scoped package list including draft and retired packages, guarded by active membership verification.
     - `createPackage(staffUserId, restaurantId, dto)`: Role-gated package creation (OWNER/MANAGER) with parameter validation and audit logging.
     - `updatePackage(staffUserId, packageId, dto)`: Monotonically increments package version (`version + 1`) and logs audit differences.
   - **`PackagesController` (`apps/api/src/modules/packages/packages.controller.ts`)**:
     - Public endpoints: `GET /restaurants/:id/packages`, `GET /restaurants/:restaurantId/packages/:packageId`.
     - Staff owner endpoints: `GET /owner/restaurants/:id/packages`, `POST /owner/restaurants/:id/packages`, `PATCH /owner/packages/:id`.
   - **`PackagesModule` & `AppModule`**: Registered feature module inside the modular monolith.
   - **`ReservationsService` Hold Integration (`apps/api/src/modules/reservations/reservations.service.ts`)**:
     - AC1: Validates `package.restaurant_id === dto.restaurant_id`, throwing 403 Forbidden with `PACKAGE_RESTAURANT_MISMATCH` if mismatched.
     - AC2: Bounded commerce gating. Unapproved dynamic pricing, multi-table packages, and split billing are blocked under **GATE-004** in the Commercial Policy Register.
     - AC3: Server-derived duration and deposit calculation strictly ignoring client-supplied tampering. Captures immutable package snapshot (`id`, `name`, `price_minor`, `duration_min`, `version`).
     - AC4: Table availability check uses `package.duration_min + turnover_buffer_min`, enforcing PostgreSQL GiST exclusion `no_protected_table_overlap`.

4. **Policy Governance Register Updates (`docs/policies/commercial-policy-register.md`)**:
   - **POL-011**: Dining Experiences & Package Terms (eligibility bounds `min_party_size <= party_size <= max_party_size`, server-derived dining duration, and deposit requirement).
   - **GATE-004**: Dynamic & Multi-Table Package Commerce Gate (blocking live release of dynamic pricing, split billing, or joined-table package allocation until formally approved).

5. **OpenAPI Specification (`docs/architecture/openapi.json`)**:
   - Documented all public and staff package endpoints with Swagger schemas, parameters, and responses.

6. **Automated Verification & CI/CD Quality Gates**:
   - **Node.js Unit Test Suite (`tests/unit/packages.test.js`)**: 23 tests passing with 100% success covering public catalog, privacy guarantees, cross-tenant denial, server-computed intervals and deposit tamper protection, one-table GiST overlap invariants, party capacity bounds, and owner versioning.
   - **Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**: `TestEpic15DiningExperiencesAndPackages` with comprehensive tests verifying migration 15, OpenAPI spec, Node.js runner, and Acceptance Criteria 1 through 4.
   - **All 8 CI/CD Quality Gates Passed Cleanly** via `./scripts/ci.sh`.
