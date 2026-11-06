---
id: "EPIC-006"
title: "Versioned floor plans and table inventory"
type: "epic"
status: "backlog"
phase: "C · Inventory"
depends_on: ["EPIC-004"]
prd_requirements: ["Blueprint §4", "Blueprint §5.2", "Blueprint §6.1", "Blueprint §6.4", "Blueprint §12.2", "Blueprint §12.4", "Blueprint §14.4", "Blueprint §19.1"]
risk: "high"
assignee: "Unassigned"
summary: "Publish stable table identities and versioned floor geometry without invalidating existing reservations."
---

# EPIC-006 — Versioned floor plans and table inventory

## Objective

Publish stable table identities and versioned floor geometry without invalidating existing reservations.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 4, 5.2, 6.1, 6.4, 12.2, 12.4, 14.4, 19.1. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Migrate floors, tables and version constraints
- [ ] T02 Implement normalized geometry/capacity validators
- [ ] T03 Expose floor snapshot with stable table IDs
- [ ] T04 Implement owner compare-and-update version contract
- [ ] T05 Guard destructive edits against active and historical bookings

## Acceptance criteria

- [ ] A floor response includes version, geometry, capacity and stable IDs
- [ ] Invalid capacity or geometry fails validation
- [ ] Two edits from the same base version cannot silently overwrite each other
- [ ] Editing or retiring a held table cannot erase a protected allocation
- [ ] Cross-restaurant floor edits are rejected

## Required verification

- Test stale-version concurrent edits and held/booked table retirement
- Check floor→restaurant foreign keys and geometry bounds
- Read floor plan twice and verify stable identities without mutable availability flags

## Dependencies and execution gate

Prerequisites: EPIC-004.

Real versioned geometry is available through the API; safe owner edits pass conflicts.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- ID replacement breaks exact-table booking history
- Geometry/version mismatch can mislead later clients even when the DB is correct

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
