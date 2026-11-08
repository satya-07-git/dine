---
id: "EPIC-007"
title: "Restaurant discovery and availability filters"
type: "epic"
status: "backlog"
phase: "C · Venue inventory"
depends_on: ["EPIC-005", "EPIC-006"]
prd_requirements: ["PRD FR-B01–B05, §11.2", "SQL §6"]
risk: "medium"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Expose restaurant discovery by name, location, cuisine, price, hours and advisory availability."
---

# EPIC-007 — Restaurant discovery and availability filters

## Objective

Expose restaurant discovery by name, location, cuisine, price, hours and advisory availability.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD FR-B01–B05, §11.2; SQL §6.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · C · Venue inventory. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Bounded search/filter/sort/pagination
- Published venue details and restaurant-local booking parameter validation
- Potentially available restaurant filtering backed by canonical interval eligibility
- Public media/storage projection through S3-compatible adapter where used

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Discovery availability is advisory; every hold rechecks PostgreSQL
- Public results exclude private staff/customer/payment fields
- Location input/query size must be validated; PostGIS may be reused if selected but is not mandated by finalized SQL
- No full menu/package/review subsystem is imported as a mandatory v2 module

## Data and API changes

Extend restaurants with description/address/location and public filter metadata absent in the critical SQL baseline. Define indexed query/read projection and S3 object authorization separately.

GET /restaurants; GET /restaurants/:id. Optional geo/read endpoint additions require explicit contract; /restaurants/nearby is legacy, not finalized catalog.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define public discovery DTO and query limits
- [ ] T02 Map location/cuisine/price/hours filters to indexed queries
- [ ] T03 Integrate advisory availability through published interface
- [ ] T04 Define public media ownership/storage adapter if needed
- [ ] T05 Document empty/invalid/no-availability responses

## Acceptance criteria

- [ ] Name/location/filter combinations return bounded published results
- [ ] Restaurant unavailable for requested interval is excluded/flagged according to contract
- [ ] Search never implies a guaranteed table allocation
- [ ] Private customer/staff data cannot appear in discovery
- [ ] Invalid query bounds/coordinates fail deterministically

## Required verification

- Seeded filter and restaurant-local hours tests
- Query-plan/pagination checks
- Anonymous public read and private-field exclusion tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-005, EPIC-006.

Discovery accurately narrows candidates without becoming inventory authority.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
