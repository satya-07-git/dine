---
id: "EPIC-004"
title: "Restaurant profiles, hours and policies"
type: "epic"
status: "backlog"
phase: "C · Inventory"
depends_on: ["EPIC-003"]
prd_requirements: ["Blueprint §1.3", "Blueprint §4", "Blueprint §5.2", "Blueprint §6.2", "Blueprint §9.1", "Blueprint §12.2", "Blueprint §12.4", "Blueprint §19.1"]
risk: "high"
assignee: "Unassigned"
summary: "Model a restaurant, its local operating calendar and versioned reservation rules used by every inventory decision."
---

# EPIC-004 — Restaurant profiles, hours and policies

## Objective

Model a restaurant, its local operating calendar and versioned reservation rules used by every inventory decision.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.3, 4, 5.2, 6.2, 9.1, 12.2, 12.4, 19.1. Delivery stage: C · Inventory. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

- [ ] T01 Create restaurant/calendar/policy schema and seed
- [ ] T02 Validate timezone, hours and capacity/lead-time policies
- [ ] T03 Implement published detail read and guarded policy/closure actions
- [ ] T04 Define existing-booking behavior for closure/policy edits
- [ ] T05 Connect policy evaluator to availability/hold services

## Acceptance criteria

- [ ] Closed dates and out-of-hours requests are ineligible
- [ ] Invalid or missing timezone is rejected at configuration
- [ ] DEPOSIT_REQUIRED validates positive integer minor-unit amount and currency
- [ ] Policy changes preserve existing confirmed allocation history
- [ ] Restaurant A staff cannot change B policy

## Required verification

- Test midnight/overnight opening intervals and timezone boundaries
- Test closure conflicts against future bookings and configured buffer
- Test free and deposit policy DTO validation and authorization

## Dependencies and execution gate

Prerequisites: EPIC-003.

Restaurant policy and hours can be read and safely managed through scoped API contracts.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Local date interpreted in server timezone can book the wrong interval
- Closure edits can invalidate inventory unless conflict behavior is explicit

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
