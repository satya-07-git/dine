---
id: "EPIC-005"
title: "Discovery, menus and public media"
type: "epic"
status: "backlog"
phase: "C · Inventory"
depends_on: ["EPIC-004"]
prd_requirements: ["Blueprint §1.1", "Blueprint §2.3", "Blueprint §3.1", "Blueprint §4", "Blueprint §5.2", "Blueprint §12.2"]
risk: "medium"
assignee: "Unassigned"
summary: "Expose restaurant search, nearby results, menus and media through bounded public projections."
---

# EPIC-005 — Discovery, menus and public media

## Objective

Expose restaurant search, nearby results, menus and media through bounded public projections.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 2.3, 3.1, 4, 5.2, 12.2. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Cuisine, price and location filters with bounded result pagination
- PostGIS radius search and validated latitude/longitude/radius
- Menu catalog and restaurant photos through Supabase Storage boundaries
- Replaceable maps/geo adapter and published restaurant visibility rules

## Out of scope

Mobile discovery UI, private staff data, paid ranking, unspecified recommendation AI and POS catalog sync.

## Business rules

- Search does not imply table availability; interval availability is a separate query
- Only published fields and public media may appear in discovery
- Location input is validated and query/result sizes bounded
- Menu/media write contracts and retention need definition before implementing uploads

## Data and API changes

Use restaurants.location geography and spatial indexes with cuisines associations. Menu/media schema is named behavior in the blueprint, but exact tables, upload validation and catalog fields remain implementation contracts.

GET /restaurants; GET /restaurants/nearby; GET /restaurants/:id/menu. Detail and package reads link to EPIC-004 and EPIC-015.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Public read projection excludes customer/staff/payment data. Owner-scoped catalog/media writes require authorization, object ownership and audit.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Specify search filters, sort and pagination contract
- [ ] T02 Add indexed PostGIS nearby query
- [ ] T03 Define menu and public media projection/storage rules
- [ ] T04 Implement public reads and empty/invalid filter errors

## Acceptance criteria

- [ ] Nearby search returns eligible published restaurants within requested radius
- [ ] Out-of-range geo coordinates and excessive query bounds fail validation
- [ ] Search and menu responses contain no private customer/staff fields
- [ ] Unpublished or retired restaurants are excluded as specified

## Required verification

- Use synthetic coordinates and known inside/outside-radius cases
- Inspect query plan and bounded pagination on seeded data
- Check anonymous reads and unauthorized media writes

## Dependencies and execution gate

Prerequisites: EPIC-004.

Discovery and menu API results are correct, bounded and privacy-scoped.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unbounded radius or result sets create expensive public queries
- Public/private Storage policy mistakes expose unintended objects

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
