---
id: "EPIC-015"
title: "Dining experiences and package contracts"
type: "epic"
status: "backlog"
phase: "G · Restaurant operations"
depends_on: ["EPIC-004", "EPIC-009"]
prd_requirements: ["Blueprint §1.1", "Blueprint §4", "Blueprint §12.2", "Blueprint §16.2"]
risk: "medium"
assignee: "Unassigned"
summary: "Expose restaurant dining packages and define bounded booking rules without turning packages into a separate inventory system."
---

# EPIC-015 — Dining experiences and package contracts

## Objective

Expose restaurant dining packages and define bounded booking rules without turning packages into a separate inventory system.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 4, 12.2, 16.2. Delivery stage: G · Restaurant operations. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

- [ ] T01 Define package MVP fields and eligibility limits
- [ ] T02 Resolve reservation/deposit/duration effect
- [ ] T03 Add approved schema and public read contract
- [ ] T04 Wire package validation to reservation policy if pilot needs it

## Acceptance criteria

- [ ] Every package belongs to the requested restaurant
- [ ] Missing purchase rules are documented and block that behavior
- [ ] A selected package cannot change protected interval or price via client input
- [ ] Booking still respects the one-table and no-overlap invariant

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

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
