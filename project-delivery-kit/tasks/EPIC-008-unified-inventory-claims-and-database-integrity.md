---
id: "EPIC-008"
title: "Unified inventory claims and database integrity"
type: "epic"
status: "backlog"
phase: "D · Reservation engine"
depends_on: ["EPIC-002", "EPIC-005", "EPIC-006"]
prd_requirements: ["PRD BR-001–BR-003, BR-008, BR-011–BR-012, §10", "SQL §3.2–3.3", "Diagram 3"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Enforce one exclusive active inventory claim per physical table and effective interval across holds, reservations and blocks."
---

# EPIC-008 — Unified inventory claims and database integrity

## Objective

Enforce one exclusive active inventory claim per physical table and effective interval across holds, reservations and blocks.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD BR-001–BR-003, BR-008, BR-011–BR-012, §10; SQL §3.2–3.3; Diagram 3.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · D · Reservation engine. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- inventory_claims with HELD/RESERVED/BLOCKED/RELEASED and half-open ranges
- GiST exclusion over every active claim, including operational blocks
- Composite restaurant/table/claim/hold ownership and strict writer permissions
- Transactional consistency for hold-claim and reservation-claim associations

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- PostgreSQL is the sole authority; Redis locks/cache are not final ownership
- EXCLUDE prevents overlap for states HELD, RESERVED and BLOCKED
- [start,end) permits exact adjacency; ends_at must be greater than starts_at
- Claim interval includes cleanup buffer; reservation stores separate customer-visible dining end
- Schema FKs do not alone prove same user, matching hold/claim identity or interval consistency
- One-table lock protocol applies to all writers; no direct client DB mutation

## Data and API changes

inventory_claims; reservation_holds; reservations with composite FKs and unique claim_id/hold_id. Review same-claim/user/expiry/interval association triggers or controlled services; source calls for consistency additions. Document incremental mapping from legacy table_allocations without destructive replacement.

Internal inventory application interface used by /holds, /reservations/free, payment finalization and /restaurant-ops/table-blocks; no public raw-claim-write endpoint.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Translate supplied schema into additive migration/upgrade design
- [ ] T02 Add active range exclusion and composite foreign keys
- [ ] T03 Define controlled writer and consistency enforcement
- [ ] T04 Separate effective claim range from dining interval
- [ ] T05 Prove direct DB overlap rejection across all claim types

## Acceptance criteria

- [ ] A direct overlapping HELD/RESERVED/BLOCKED insert is rejected by database exclusion
- [ ] Adjacent compatible ranges are permitted
- [ ] Cross-restaurant claim/hold/reservation links are rejected
- [ ] Every HELD claim has exactly one corresponding active hold while held
- [ ] Every RESERVED/BLOCKED claim has the required reservation/authorized block evidence
- [ ] Migration preserves existing confirmed inventory without duplicate claim ownership

## Required verification

- Real PostgreSQL separate-connection constraint/FK tests
- Direct invalid claim/hold/user/interval association inserts
- Fresh migration and seeded legacy upgrade rehearsal

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-002, EPIC-005, EPIC-006.

DB-level invariants proven before high-risk hold/payment work; schema baseline is not treated as already production-tested.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
