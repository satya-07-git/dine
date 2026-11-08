---
id: "EPIC-009"
title: "Interval availability, capacity and table state"
type: "epic"
status: "backlog"
phase: "D · Reservation engine"
depends_on: ["EPIC-008"]
prd_requirements: ["PRD FR-C03–C06, §5, §9–10", "SQL §3.3, §6"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Compute eligible table availability from restaurant-local scheduling, capacity and authoritative active claim ranges."
---

# EPIC-009 — Interval availability, capacity and table state

## Objective

Compute eligible table availability from restaurant-local scheduling, capacity and authoritative active claim ranges.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD FR-C03–C06, §5, §9–10; SQL §3.3, §6.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · D · Reservation engine. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- UTC-aware startsAt and policy-derived visible end/effective buffer end
- Capacity min/max, active table, hours, closure and block eligibility
- Computed AVAILABLE/HELD/RESERVED/OCCUPIED/BLOCKED classification
- Snapshot time and layout version with privacy-safe rejection reasons

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Do not trust a client-provided duration/end without validating restaurant policy
- Requested interval spans full dining plus turnover protection
- OCCUPIED is staff-service evidence, not inferred sensor telemetry
- Expired HELD rows require transactional release; simply filtering expires_at in a read is not enough
- Changing time/party parameters invalidates the previous snapshot

## Data and API changes

Indexed inventory_claims ranges plus table/calendar/policy data. Specify consistent enum projection and snapshot/version contract; direct current occupancy does not replace future interval calculation.

GET /restaurants/:id/availability (date,startTime,partySize); output candidates, table statuses, capacity, version and optional recommendation references.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Implement timezone/interval and effective buffer calculator
- [ ] T02 Implement shared capacity/calendar/claim eligibility
- [ ] T03 Define public table status/reason snapshot DTO
- [ ] T04 Validate end-time and layout-version compatibility
- [ ] T05 Index and measure interval queries

## Acceptance criteria

- [ ] Overlap and buffer requests are rejected; exact effective-range adjacency can succeed
- [ ] Party size must satisfy table min/max capacity
- [ ] Closures and BLOCKED claims are respected
- [ ] Snapshot exposes no other customer identity
- [ ] Both manual and automatic candidates use the same eligibility rules

## Required verification

- Timezone/overnight, buffer and invalid interval unit cases
- Real DB HELD/RESERVED/BLOCKED overlap tests
- Stale snapshot and layout version scenarios

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-008.

Availability agrees with authoritative claim rules and remains advisory until hold commit.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
