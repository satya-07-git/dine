---
id: "EPIC-007"
title: "Time-range availability and policy engine"
type: "epic"
status: "backlog"
phase: "D · Booking core"
depends_on: ["EPIC-006"]
prd_requirements: ["Blueprint §5.3", "Blueprint §5.4", "Blueprint §6", "Blueprint §12.2", "Blueprint §17.1"]
risk: "high"
assignee: "Unassigned"
summary: "Compute restaurant-local dining intervals and time-scoped eligibility from policy, blocks and protected allocations."
---

# EPIC-007 — Time-range availability and policy engine

## Objective

Compute restaurant-local dining intervals and time-scoped eligibility from policy, blocks and protected allocations.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 5.3, 5.4, 6, 12.2, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

- [ ] T01 Implement timezone/interval and buffer calculator
- [ ] T02 Implement eligibility evaluator and overlap queries
- [ ] T03 Define table state/reason contract
- [ ] T04 Add interval/block query indexes
- [ ] T05 Document snapshot staleness and authoritative hold recheck

## Acceptance criteria

- [ ] 19:00–20:45 allocation rejects a 20:00 overlapping request
- [ ] An adjacent eligible range beginning at 20:45 is not rejected solely for adjacency
- [ ] Capacity, closure and inactive table rules apply consistently
- [ ] Snapshot includes server timestamp and layout version
- [ ] Another guest identity is never returned with table status

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

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
