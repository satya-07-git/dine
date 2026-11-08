---
id: "EPIC-012"
title: "Free confirmation and reservation state machine"
type: "epic"
status: "backlog"
phase: "D · Reservation engine"
depends_on: ["EPIC-010"]
prd_requirements: ["PRD BR-006, BR-009, §6, §11.9", "SQL reservations, §4, §6", "Diagram 2"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Atomically consume valid owned holds into free confirmations and enforce the common reservation lifecycle."
---

# EPIC-012 — Free confirmation and reservation state machine

## Objective

Atomically consume valid owned holds into free confirmations and enforce the common reservation lifecycle.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD BR-006, BR-009, §6, §11.9; SQL reservations, §4, §6; Diagram 2.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · D · Reservation engine. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- POST free confirmation with server policy snapshot and unique booking reference
- Separate reservation, hold, claim, payment and reconciliation states
- CONFIRMED → CHECKED_IN → SEATED → COMPLETED plus cancellation/no-show/expiry guards
- Versioned event history and atomic audit/outbox on transitions

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- FREE must not create a gateway order; DEPOSIT cannot call free path to bypass payment
- Consume hold ACTIVE→CONSUMED and claim HELD→RESERVED atomically under table lock
- Expired/released/foreign hold cannot confirm under normal flow
- Reservation enum: PENDING_PAYMENT,CONFIRMED,CHECKED_IN,SEATED,COMPLETED,CANCELLED,EXPIRED,NO_SHOW
- Do not add PAYMENT_REVIEW to booking/claim enum: unresolved money uses a separate reconciliation workflow
- Cancellation/no-show/completion release behavior must be explicitly specified against remaining buffer; no silent range weakening

## Data and API changes

reservations with unique booking_reference, hold_id and claim_id; reservation_events (missing from supplied SQL, requires migration), version/sequence and policy snapshot. Verify same hold/claim/user/restaurant/table association and distinct visible/effective end times.

POST /reservations/free; GET /bookings; GET /bookings/:id; POST /bookings/:id/cancel. Free request body/Idempotency-Key DTO must be documented.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define complete transition matrix and all state mappings
- [ ] T02 Implement repeat-safe FREE consume-and-confirm transaction
- [ ] T03 Add booking reference and scoped list/detail
- [ ] T04 Implement cancellation release/refund coordination boundary
- [ ] T05 Append reservation event/version and outbox transactionally

## Acceptance criteria

- [ ] Duplicate free confirmation returns one reservation/reference
- [ ] Expired or foreign hold fails without claim transition
- [ ] DEPOSIT venue cannot be confirmed through free action
- [ ] Illegal/terminal/reverse transitions fail without partial state
- [ ] Confirmed reservation retains its RESERVED claim until approved release transition
- [ ] Events/version agree with the committed reservation state

## Required verification

- Free confirmation/expiry/cancellation races
- Direct cross-user and DEPOSIT bypass calls
- State matrix and reservation-claim consistency tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-010.

Free booking and common lifecycle are proven before gateway integration.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
