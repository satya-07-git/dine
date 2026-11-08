---
id: "EPIC-010"
title: "Atomic holds, expiry and idempotency"
type: "epic"
status: "backlog"
phase: "D · Reservation engine"
depends_on: ["EPIC-003", "EPIC-004", "EPIC-009"]
prd_requirements: ["PRD BR-004–BR-005, BR-010, §5, C-001–C-002", "SQL §4, §5–6"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Acquire, inspect and release 120-second initial holds safely under contention and delayed workers."
---

# EPIC-010 — Atomic holds, expiry and idempotency

## Objective

Acquire, inspect and release 120-second initial holds safely under contention and delayed workers.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD BR-004–BR-005, BR-010, §5, C-001–C-002; SQL §4, §5–6.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · D · Reservation engine. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Table-row FOR UPDATE lock, fixed database decision clock captured after lock acquisition
- Release expired HELD claims and expire active holds atomically before reuse
- Insert claim + hold + replayable result + audit/outbox in one short transaction
- Caller+operation+key idempotency/hash and original response replay
- Owned inspect/cancel plus conflict/expiry/error contracts

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Initial two-minute hold is not extended by creating a payment attempt
- Expiry of inventory and unresolved financial reconciliation are separate: RELEASED claim does not mean payment failed
- Every confirmation rechecks claim, owner and deadline under the same table lock
- No NOW() predicate can automatically remove expired claims from the exclusion set
- Map SQLSTATE 23P01 to 409 TABLE_UNAVAILABLE; zero rows locked must not proceed
- Lock wait time cannot consume a pre-captured expiry decision clock

## Data and API changes

reservation_holds(status ACTIVE/CONSUMED/EXPIRED/RELEASED); inventory_claims; idempotency_records UNIQUE(actor_id,operation,idempotency_key); audit/outbox. Capture clock_timestamp() after acquiring the target row and reuse that decision instant.

POST /holds; GET /holds/:id; DELETE /holds/:id under /api/v1. Input restaurantId,tableId,startsAt,partySize; output holdId,status,tableId,expiresAt,serverTime,payment policy.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Implement post-lock decision clock and serialized expiry cleanup
- [ ] T02 Implement claim/hold/idempotency/audit/outbox transaction
- [ ] T03 Validate caller, capacity, time, policy and active table again
- [ ] T04 Implement replay/mismatched body response semantics
- [ ] T05 Implement owned inspect/release and delayed-worker handling
- [ ] T06 Prove first real DB hold and 100-client conflict slice

## Acceptance criteria

- [ ] 100 eligible conflicting requests produce exactly one successful active claim and 99 conflict/controlled non-success responses
- [ ] Same key/body returns original result; different body conflicts without mutation
- [ ] Rollback leaves no orphan claim, hold, event or incomplete replay result
- [ ] A new hold can safely replace expired inventory even if expiry worker is delayed
- [ ] Payment initiation does not change expiresAt
- [ ] Only owner can inspect/release the hold

## Required verification

- Separate-connection synchronized 100-request PostgreSQL test
- Expired hold replacement, lock-wait clock and process crash tests
- Retry races, hash mismatch and cross-user IDOR tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-003, EPIC-004, EPIC-009.

First milestone: migrations + inventory service + hold API + real DB concurrency proof, before Razorpay or UI animation.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
