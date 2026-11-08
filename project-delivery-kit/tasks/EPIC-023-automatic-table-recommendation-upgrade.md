---
id: "EPIC-023"
title: "Automatic table recommendation upgrade"
type: "epic"
status: "backlog"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-007", "EPIC-008", "EPIC-021", "EPIC-022"]
prd_requirements: ["Final table-selection decision", "PRD §13", "Realtime §8"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0 · New delta"
summary: "Add deterministic automatic selection with bounded fallback through the already delivered atomic inventory engine."
---

# EPIC-023 — Automatic table recommendation upgrade

## Objective

Add deterministic automatic selection with bounded fallback through the already delivered atomic inventory engine.

## Delivered foundation

EPIC-007, EPIC-008, EPIC-021, EPIC-022 remain completed under their original identities. This epic covers only finalized v2 changes and their conformance verification. Inspect and reuse existing code; do not rebuild or reset delivered capabilities.

## Scope and source coverage

The prior renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/. The capability sections below consolidate that draft into additive work with new stable IDs. Source reference files use the same stable IDs. Product frontend remains deferred.

## Capability · Deterministic best-available table recommendations

### In scope

- Filter mandatory eligibility first, then deterministic capacity/preference/location/operations scoring
- Normalized 0–100 components with initial 0.40/0.25/0.20/0.15 weights
- Stable tie-break and bounded next-candidate retry on concurrent conflict
- Return ranked recommendations; clearly separate advice from allocation

### Business rules

- Latest finalization promotes automatic recommendation to required v2 scope despite base PRD Should wording
- Score = 0.40C + 0.25P + 0.20L + 0.15O; weights are starting assumptions, not validated performance
- Customer explicit manual table selection never silently switches tables
- Automatic fallback has a configured retry cap and must not leave multiple active claims
- Every attempted allocation goes through EPIC-008 database constraints

### Data and API changes

Reuse table capacity/zone/preferences, policy and interval availability; recommendations require no separate authoritative inventory table. Define missing preference/operational inputs and deterministic fallback behavior before scoring implementation.

POST /recommendations/tables returns ranked candidates and explanatory scores. /holds remains the allocation operation; automatic bounded fallback orchestration contract must state chosen table and consent.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Scoring boundary/tie/missing-preference tests
- Manual/automatic same-table concurrency test on PostgreSQL
- Race top candidate and prove bounded next-table retry without leaked claims

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

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

## Completion report

New v2 delta pending. The original 20 completed epics are not reopened by this work. Record actual changed code/migrations, commands and results here when these deltas are implemented. No new backend test result is claimed by a planning/status correction.
