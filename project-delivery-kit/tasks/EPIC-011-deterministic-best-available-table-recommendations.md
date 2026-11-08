---
id: "EPIC-011"
title: "Deterministic best-available table recommendations"
type: "epic"
status: "backlog"
phase: "D · Reservation engine"
depends_on: ["EPIC-009", "EPIC-010"]
prd_requirements: ["Final table-selection decision", "PRD §13", "Realtime §8"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Rank eligible tables for automatic selection while manual and automatic flows share one atomic hold engine."
---

# EPIC-011 — Deterministic best-available table recommendations

## Objective

Rank eligible tables for automatic selection while manual and automatic flows share one atomic hold engine.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: Final table-selection decision; PRD §13; Realtime §8.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · D · Reservation engine. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Filter mandatory eligibility first, then deterministic capacity/preference/location/operations scoring
- Normalized 0–100 components with initial 0.40/0.25/0.20/0.15 weights
- Stable tie-break and bounded next-candidate retry on concurrent conflict
- Return ranked recommendations; clearly separate advice from allocation

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Latest finalization promotes automatic recommendation to required v2 scope despite base PRD Should wording
- Score = 0.40C + 0.25P + 0.20L + 0.15O; weights are starting assumptions, not validated performance
- Customer explicit manual table selection never silently switches tables
- Automatic fallback has a configured retry cap and must not leave multiple active claims
- Every attempted allocation goes through EPIC-010 database constraints

## Data and API changes

Reuse table capacity/zone/preferences, policy and interval availability; recommendations require no separate authoritative inventory table. Define missing preference/operational inputs and deterministic fallback behavior before scoring implementation.

POST /recommendations/tables returns ranked candidates and explanatory scores. /holds remains the allocation operation; automatic bounded fallback orchestration contract must state chosen table and consent.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define normalized component formulas, missing-input defaults and stable tie-break
- [ ] T02 Implement shared eligibility-first ranking
- [ ] T03 Expose recommendation DTO and score explanation
- [ ] T04 Define bounded automatic retry without manual substitution
- [ ] T05 Test manual-versus-automatic allocation race

## Acceptance criteria

- [ ] Only capacity/time/policy-compatible tables are ranked
- [ ] Same snapshot/input gives deterministic ordered scores
- [ ] Two-person group prefers fit per approved formula rather than wasting larger tables by accident
- [ ] Recommendation output alone grants no claim
- [ ] Manual and automatic contenders cannot create overlapping active claims
- [ ] Fallback stops at retry budget and reports actual selected table

## Required verification

- Scoring boundary/tie/missing-preference tests
- Manual/automatic same-table concurrency test on PostgreSQL
- Race top candidate and prove bounded next-table retry without leaked claims

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-009, EPIC-010.

Deterministic ranking and bounded atomic allocation behavior are verified; no ML dependency.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
