---
id: "EPIC-015"
title: "Staff check-in, walk-ins and operational blocks"
type: "epic"
status: "backlog"
phase: "F · Operations"
depends_on: ["EPIC-004", "EPIC-012"]
prd_requirements: ["PRD §3.2–3.3, §11.10, §14, C-006", "SQL §3.3, §6", "Diagrams 2,4"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Operate restaurant arrivals, seating, completion, no-shows and external/walk-in inventory through the same claim protocol."
---

# EPIC-015 — Staff check-in, walk-ins and operational blocks

## Objective

Operate restaurant arrivals, seating, completion, no-shows and external/walk-in inventory through the same claim protocol.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §3.2–3.3, §11.10, §14, C-006; SQL §3.3, §6; Diagrams 2,4.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · F · Operations. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Scoped daily reservation/arrival/occupancy read model
- Check-in, seat, complete, cancellation and no-show authorized transitions
- BLOCKED inventory claims for maintenance/operational table blocks
- Record walk-ins, telephone and externally accepted bookings in Dine to protect internal inventory
- Conflict-aware operational interventions without silent cancellation

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Blocks, manual staff bookings, walk-ins and customers acquire the same table lock and exclusion constraint
- A block overlapping a confirmed reservation is rejected or enters an explicit audited resolution workflow
- Check-in is explicit CHECKED_IN; optional preparation/READY is not automatically reintroduced
- External bookings unrecorded in Dine are outside its consistency guarantee
- Guest contact/nullable customer semantics for walk-ins require explicit design beyond SQL user_id NOT NULL
- No-show grace/cancel/refund policies remain product decisions, not guessed values

## Data and API changes

Reuse inventory_claims BLOCKED, reservations and reservation_events; table_blocks, actor/reason/claim association and walk-in guest representation need missing production migrations. Preserve composite tenant ownership.

GET /restaurant-ops/reservations; POST /restaurant-ops/bookings/:id/check-in, /seat, /complete; POST /restaurant-ops/table-blocks. Base PRD reservation-path variants are documented aliases to resolve. No-show/walk-in routes require explicit contracts.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Implement scoped staff reservation projection and role checks
- [ ] T02 Implement repeat-safe check-in/seat/complete transitions
- [ ] T03 Route operational blocks through unified claim writer
- [ ] T04 Define walk-in/phone/external booking entry and privacy model
- [ ] T05 Define conflict resolution and no-show policy/audit flow

## Acceptance criteria

- [ ] Foreign restaurant staff cannot inspect or operate booking
- [ ] Block racing customer hold cannot create overlapping active claims
- [ ] Blocking an existing reservation never silently cancels it
- [ ] Repeated check-in/seat/complete cannot duplicate state/event action
- [ ] Staff-recorded walk-in protects the same inventory as an online booking
- [ ] No-show follows approved grace and money policy

## Required verification

- Staff/customer/block three-way PostgreSQL race
- Role and tenant denial matrix on direct calls
- External/walk-in booking dry-run and conflict resolution
- Duplicate/stale service transitions

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-004, EPIC-012.

Restaurant dry-run includes recording off-platform arrivals before claiming internal consistency.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
