---
id: "EPIC-002"
title: "Repository, database and delivery foundation"
type: "epic"
status: "backlog"
phase: "B · Foundation"
depends_on: ["EPIC-001"]
prd_requirements: ["Blueprint §2.3", "Blueprint §3", "Blueprint §4.1", "Blueprint §5", "Blueprint §16.2", "Blueprint §18"]
risk: "high"
assignee: "Unassigned"
summary: "Create the single backend deployable, authoritative SQL migration path, shared contracts and repeatable CI baseline."
---

# EPIC-002 — Repository, database and delivery foundation

## Objective

Create the single backend deployable, authoritative SQL migration path, shared contracts and repeatable CI baseline.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 2.3, 3, 4.1, 5, 16.2, 18. Delivery stage: B · Foundation. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

- [ ] T01 Create backend folders and validated env example without credentials
- [ ] T02 Configure database connection, explicit SQL migration runner and seed
- [ ] T03 Introduce request DTO/error/request_id conventions
- [ ] T04 Provide health/readiness and OpenAPI build
- [ ] T05 Add fresh-database CI and deployment/recovery checklist

## Acceptance criteria

- [ ] A clean environment can migrate and boot from documented commands
- [ ] Drizzle does not write an independent schema history
- [ ] Compilation and initial unit/integration pipeline run reproducibly
- [ ] Readiness reflects dependency availability and returns no secrets

## Required verification

- Replay migrations on an empty real PostgreSQL database
- Verify required extensions, FK/check support and transaction rollback
- Start API with valid and invalid configuration and inspect sanitized errors
- Record exact commands and versions in the completion report

## Dependencies and execution gate

Prerequisites: EPIC-001.

Fresh install, health, OpenAPI and CI succeed with synthetic data.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A second migration authority can drift from production
- Long-lived DB connections and pooling behavior need deployment-specific verification

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
