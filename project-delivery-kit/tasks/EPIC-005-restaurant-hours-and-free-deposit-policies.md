---
id: "EPIC-005"
title: "Restaurant hours and free/deposit policies"
type: "epic"
status: "backlog"
phase: "C · Venue inventory"
depends_on: ["EPIC-004"]
prd_requirements: ["PRD §2, FR-B03–B04, §14", "SQL booking_policies, §3.3"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Configure restaurant calendars and immutable checkout terms for FREE and DEPOSIT reservations."
---

# EPIC-005 — Restaurant hours and free/deposit policies

## Objective

Configure restaurant calendars and immutable checkout terms for FREE and DEPOSIT reservations.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §2, FR-B03–B04, §14; SQL booking_policies, §3.3.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · C · Venue inventory. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Restaurant timezone/status/details and operating hours/closures
- Min/max party compatibility, dining duration and cleanup buffer
- FREE/DEPOSIT policy, amountPaise, hold_seconds and cancellation terms
- Snapshot checkout price/policy so later edits cannot alter existing transactions

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Initial hold_seconds is 120; source SQL permits configured 30–900 seconds
- Source SQL defaults duration 90 and buffer 15 minutes; treat as configurable defaults
- DEPOSIT requires positive amountPaise; FREE uses no gateway checkout
- Client cannot choose FREE at a DEPOSIT venue or tamper with amount/end time
- Policy/closure edits must preserve or explicitly resolve existing protected reservations

## Data and API changes

restaurants; booking_policies(restaurant_id,payment_mode,deposit_amount_paise,hold_seconds,duration_minutes,buffer_minutes); operating-hours/closures and versioned snapshots require additional schema.

GET /restaurants/:id returns published policies. Manager calendar/policy mutations need a reviewed OpenAPI contract.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Model timezone/calendar and policy constraints
- [ ] T02 Implement published detail and guarded settings changes
- [ ] T03 Derive duration/buffer/deposit on server
- [ ] T04 Snapshot checkout policy and price
- [ ] T05 Resolve cancellation/lateness/refund parameters for pilot

## Acceptance criteria

- [ ] Invalid capacity/duration/buffer/timezone/policy amount fails validation
- [ ] A 120-second hold is derived server-side from chosen policy
- [ ] Checkout cannot be converted from DEPOSIT to FREE by client input
- [ ] A policy edit leaves existing reservation price/terms unchanged
- [ ] Closed/out-of-hours intervals are rejected consistently

## Required verification

- Timezone/overnight closure and lead-time scenarios
- FREE/DEPOSIT tampering and amount integer validation
- Policy edits with active holds/bookings

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-004.

Calendar and checkout terms are authoritative, versioned and agreed for pilot.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
