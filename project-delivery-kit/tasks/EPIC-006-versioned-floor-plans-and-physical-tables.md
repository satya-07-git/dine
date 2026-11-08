---
id: "EPIC-006"
title: "Versioned floor plans and physical tables"
type: "epic"
status: "backlog"
phase: "C · Venue inventory"
depends_on: ["EPIC-005"]
prd_requirements: ["PRD FR-C01–C06, §9, §14", "SQL §3.2", "Diagram 3"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Represent restaurant-owned physical tables and safe versioned floor geometry independently of time-scoped availability."
---

# EPIC-006 — Versioned floor plans and physical tables

## Objective

Represent restaurant-owned physical tables and safe versioned floor geometry independently of time-scoped availability.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD FR-C01–C06, §9, §14; SQL §3.2; Diagram 3.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · C · Venue inventory. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- floor_plans versions with one active plan per restaurant per supplied SQL
- Table label, min/max capacity, position, type/zone and operational status
- Manager layout writes with optimistic version guard
- Stable table identity and safe retirement across historical/active claims

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Composite (floor_plan_id,restaurant_id) FK prevents cross-tenant plan attachment
- Unique (restaurant_id,label); min_capacity > 0 and max_capacity >= min_capacity
- AVAILABLE/HELD/RESERVED/OCCUPIED/BLOCKED are computed projections, not one permanent physical table flag
- One active plan must not be silently expanded into multi-floor policy without a reviewed change

## Data and API changes

floor_plans(id,restaurant_id,version,name,is_active); restaurant_tables(id,restaurant_id,floor_plan_id,label,min_capacity,max_capacity,x_position,y_position,operational_status). Type/zone and geometry bounds are source requirements beyond baseline SQL columns.

GET /restaurants/:id/floor-plan; manager layout writes need explicit route/DTO/version contracts.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Migrate floor/table composite ownership and uniqueness
- [ ] T02 Validate capacity, coordinates and type metadata
- [ ] T03 Expose stable versioned geometry
- [ ] T04 Implement optimistic manager update and safe activation
- [ ] T05 Protect table identity across retirement/layout edits

## Acceptance criteria

- [ ] Foreign restaurant floor/table combinations are rejected
- [ ] Exactly one active plan exists per restaurant per selected source contract
- [ ] Stale version edit returns conflict instead of overwrite
- [ ] Table with protected inventory/history is not destructively replaced
- [ ] Future UI receives stable ID, version, capacity and geometry

## Required verification

- Composite FK and one-active-plan constraint tests
- Concurrent layout edits and booked-table retirement tests
- Capacity/geometry validation and privacy projections

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-005.

Versioned geometry and physical identity survive concurrent edits and reservation history.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
