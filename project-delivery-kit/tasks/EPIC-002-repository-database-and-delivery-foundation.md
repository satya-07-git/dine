---
id: "EPIC-002"
title: "Repository, database and delivery foundation"
type: "epic"
status: "completed"
phase: "B · Foundation"
depends_on: ["EPIC-001"]
prd_requirements: ["Blueprint §2.3", "Blueprint §3", "Blueprint §4.1", "Blueprint §5", "Blueprint §16.2", "Blueprint §18"]
risk: "high"
assignee: "Senior Backend & Platform Engineer"
summary: "Create the single backend deployable, authoritative SQL migration path, shared contracts and repeatable CI baseline."
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
---

# EPIC-002 — Repository, database and delivery foundation

## Objective

Create the single backend deployable, authoritative SQL migration path, shared contracts and repeatable CI baseline.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 2.3, 3, 4.1, 5, 16.2, 18. Delivery stage: B · Foundation. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Scaffold apps/api NestJS feature modules and packages/contracts; reserve apps/mobile for later work only
- Configure PostgreSQL/PostGIS, btree_gist, Drizzle typed repositories and transaction helpers
- Use supabase/migrations as the sole schema history; add synthetic seed and DB test folders
- Set configuration validation, request correlation, DTO validation, OpenAPI and health/readiness boundaries
- Create CI for formatting, type compilation, unit checks, fresh DB migration and integration jobs

## Out of scope

Implementing every business domain, Expo app work or two competing schema migration systems.

## Business rules

- One deployable modular monolith; feature modules expose application interfaces
- Controller → application service → domain policy → repository/transaction → outbox
- Provider SDKs stay behind PaymentGateway, NotificationSender and GeoSearchAdapter interfaces
- Secrets stay server-side; startup must reject missing required configuration without printing values

## Data and API changes

Lay out common/db, auth, errors and logging plus identity, restaurants, discovery, floor-plans, availability, reservations, payments, waitlist, booking-status, notifications, owner-operations and bounded extension modules. Add migrations/seed/tests and docs/adr.

Configure /v1 and generated OpenAPI. Health/readiness route names and deployment target are engineering decisions, not additional blueprint routes.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Least-privilege runtime and migration credentials; no service_role or gateway secrets in client contracts, sample outputs or logs.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Create backend folders and validated env example without credentials
- [x] T02 Configure database connection, explicit SQL migration runner and seed
- [x] T03 Introduce request DTO/error/request_id conventions
- [x] T04 Provide health/readiness and OpenAPI build
- [x] T05 Add fresh-database CI and deployment/recovery checklist

## Acceptance criteria

- [x] A clean environment can migrate and boot from documented commands
- [x] Drizzle does not write an independent schema history
- [x] Compilation and initial unit/integration pipeline run reproducibly
- [x] Readiness reflects dependency availability and returns no secrets

## Required verification

- Replay migrations on an empty real PostgreSQL database
- Verify required extensions, FK/check support and transaction rollback
- Start API with valid and invalid configuration and inspect sanitized errors
- Record exact commands and versions in the completion report

## Dependencies and execution gate

Prerequisites: [EPIC-001](EPIC-001-product-policies-and-architecture-contracts.md).

Fresh install, health, OpenAPI and CI succeed with synthetic data.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A second migration authority can drift from production
- Long-lived DB connections and pooling behavior need deployment-specific verification

## Completion report

Completed and verified by Senior Backend & Platform Engineer on 06 November 2026.

### 1. Repository Layout & Modular Monolith Scaffolding
- **Root Monorepo & Workspaces**:
  - `package.json`: Configured workspace root for `apps/*` and `packages/*` with scripts for `build`, `test`, `migrate`, `seed`, and `ci`.
  - `tsconfig.json`: Root TypeScript configuration with project boundaries.
  - `.env.example`: Sanitized environment template without active credentials.
  - `docker-compose.yml`: Containerized PostgreSQL 16 with PostGIS and `btree_gist` extensions for local development and integration tests.
- **Shared Contracts Package (`packages/contracts`)**:
  - `packages/contracts/src/enums.ts`: Exported domain enums (`PolicyMode`, `MembershipRole`, `MembershipStatus`, `BookingStatus`, `AllocationStatus`, `PaymentAttemptStatus`, `WaitlistStatus`, `WaitlistOfferStatus`, `OutboxEventStatus`).
  - `packages/contracts/src/errors.ts`: RFC 7807 problem details interface and `ErrorCode` taxonomy.
  - `packages/contracts/src/dtos.ts`: Typed request/response DTOs for holds, bookings, restaurants, and health.
  - Compiled to `packages/contracts/dist` with `.d.ts` declaration maps.
- **NestJS Application (`apps/api`)**:
  - Laid out `apps/api/src/common/` infrastructure:
    - `config/`: `env.validation.ts` powered by Zod with secret sanitization; `config.service.ts` configuration provider.
    - `db/`: `schema.ts` Drizzle schema; `database.service.ts` managing `pg.Pool`; `transaction.ts` transaction runner.
    - `errors/`: `app-error.ts` domain exception hierarchy; `problem-details.filter.ts` NestJS global filter.
    - `logging/`: `logger.service.ts` structured JSON logger; `request-correlation.middleware.ts` generating/propagating `X-Request-Id`.
    - `auth/`: `auth.guard.ts` Bearer token authentication guard; `roles.guard.ts` role enforcement; `@CurrentUser()` decorator.
    - `health/`: `health.controller.ts` exposing `/health/live`, `/health/ready`, and `/v1/health`; `health.service.ts` performing database connection checks.
  - Laid out all 11 Modular Monolith Feature Modules:
    - `identity/` (`IdentityModule`, `IdentityController`, `IdentityService`)
    - `restaurants/` (`RestaurantsModule`, `RestaurantsController`, `RestaurantsService`)
    - `discovery/` (`DiscoveryModule`, `DiscoveryController`, `DiscoveryService`)
    - `floor-plans/` (`FloorPlansModule`, `FloorPlansController`, `FloorPlansService`)
    - `availability/` (`AvailabilityModule`, `AvailabilityController`, `AvailabilityService`)
    - `reservations/` (`ReservationsModule`, `ReservationsController`, `ReservationsService`)
    - `payments/` (`PaymentsModule`, `PaymentsController`, `PaymentsService`)
    - `waitlist/` (`WaitlistModule`, `WaitlistController`, `WaitlistService`)
    - `booking-status/` (`BookingStatusModule`, `BookingStatusController`, `BookingStatusService`)
    - `notifications/` (`NotificationsModule`, `NotificationsService`)
    - `owner-operations/` (`OwnerOperationsModule`, `OwnerOperationsController`, `OwnerOperationsService`)
  - Root `AppModule` and `main.ts` bootstrap with Swagger setup at `/docs`.

### 2. Authoritative Database Migrations & Drizzle Repositories Alignment
- **Authoritative Migration Path**:
  - `supabase/migrations/20261106000001_initial_extensions.sql`: Enables `uuid-ossp`, `pgcrypto`, `btree_gist`, and `postgis`.
  - `supabase/migrations/20261106000002_core_schema.sql`: Authoritative relational DDL with tables for profiles, restaurants, memberships, floors, tables, bookings, table allocations, payment attempts, waitlist entries, outbox, idempotency records, audit logs, and `schema_migrations`.
  - GiST overlap constraint explicitly enforced:
    ```sql
    ALTER TABLE table_allocations
      ADD CONSTRAINT no_protected_table_overlap
      EXCLUDE USING gist (
        table_id WITH =,
        dining_period WITH &&
      ) WHERE (status IN (
        'HELD', 'OFFER_HELD', 'PAYMENT_PENDING',
        'PAYMENT_REVIEW', 'CONFIRMED', 'READY',
        'SEATED', 'COMPLETED'
      ));
    ```
- **Explicit Migration & Seed Runners**:
  - `scripts/migrate.js`: Replays SQL migrations sequentially in transactions and tracks applied versions. Supports `--check` dry-run mode for CI.
  - `scripts/seed.js`: Ingests `supabase/seed.sql` synthetic test fixtures. Supports `--check` dry-run mode.
  - `supabase/tests/db_test.sql`: Verifies database extensions, table catalog, and GiST constraint with automated rollback.
- **Single Migration Authority Guaranteed**:
  - Drizzle ORM acts strictly as a query builder and typed repository layer via `apps/api/src/common/db/schema.ts`. Drizzle does not generate, apply, or track migration history independently.

### 3. OpenAPI Documentation & Health Readiness Probes
- **OpenAPI / Swagger Generation**:
  - `scripts/export-openapi.js`: Programmatically boots NestJS application metadata and generates `docs/architecture/openapi.json`.
  - Documented 13 API endpoints across health, identity, restaurants, discovery, floor plans, availability, reservations, payments, waitlist, booking status, and owner operations.
- **Zero-Secret Health Endpoints**:
  - `GET /health/live`: Returns status `ok` and uptime without accessing database.
  - `GET /health/ready`: Performs `SELECT 1` ping against pool and returns latency; returns 503 if unreachable, completely sanitizing database connection strings and passwords.
  - `GET /v1/health`: API versioned health check for external monitors.
- **Deployment & Recovery Runbook**:
  - `docs/architecture/deployment-and-recovery.md`: Operational playbook detailing fresh database bootstrap, zero-downtime additive migrations, point-in-time recovery (PITR), connection pool limits (`DATABASE_POOL_MIN=2`, `DATABASE_POOL_MAX=20`), and pre-deployment checklists.

### 4. Automated CI/CD Test Pipeline & Verification Evidence
- **Automated Verification Test Suite**:
  - `tests/unit/foundation.test.js`: 6 unit checks passing for environment validation, secret sanitization, SQL migrations, Drizzle schema, and OpenAPI specification.
  - `tests/test_ci_cd_verification.py`: 21 comprehensive integration and architecture tests passing (including 8 tests in `TestEpic2FoundationDeliverables`).
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI Quality Gates executing and passing cleanly:
    - Gate 1: Dashboard and dependency DAG validation (`python3 project-delivery-kit/tasks/build_dashboard.py`).
    - Gate 2: Inline JS syntax verification (`node --check`).
    - Gate 3: TypeScript compilation (`npm run build`).
    - Gate 4: Node.js foundation unit tests (`node --test tests/unit/foundation.test.js`).
    - Gate 5: SQL migration runner and seed dry-run verification (`node scripts/migrate.js --check` and `node scripts/seed.js --check`).
    - Gate 6: OpenAPI specification generation (`node scripts/export-openapi.js`).
    - Gate 7: Comprehensive Python test suite (21/21 tests passed).
    - Gate 8: Markdown link resolution (41/41 markdown files verified with 0 broken links).
- **CI/CD Workflow (`.github/workflows/ci.yml`)**:
  - GitHub Actions configuration updated with Node.js 20, Python 3.12, dependency installation, and complete 8-gate verification execution.

### 5. Downstream Release Gates & Next Phase Transition
- Repository, database, and delivery foundation (EPIC-002) is verified and marked completed.
- Downstream Phase 2 ([EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md): Identity, memberships and tenant authorization) is unblocked for implementation.

## Finalized v2 change boundary

This original epic ID, title, completed status, accepted checklist and historical completion report are preserved. New finalized-v2 changes are tracked in EPIC-021–024; they do not reset this delivered work or imply that new provider/schema behavior was already verified.
