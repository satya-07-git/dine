---
id: "EPIC-018"
title: "Push notifications and booking reminders"
type: "epic"
status: "backlog"
phase: "Should · Extensions"
depends_on: ["EPIC-016", "EPIC-017"]
prd_requirements: ["PRD §17 Should Have, §18.4", "Realtime §9"]
risk: "medium"
assignee: "Unassigned"
priority: "Should"
baseline: "PRD v2.0"
summary: "Dispatch optional push and reminder messages through replaceable providers without coupling booking correctness to delivery."
---

# EPIC-018 — Push notifications and booking reminders

## Objective

Dispatch optional push and reminder messages through replaceable providers without coupling booking correctness to delivery.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §17 Should Have, §18.4; Realtime §9.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Should · Should · Extensions. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- NotificationSender adapter, recipient consent/device ownership and delivery log
- Outbox-backed booking reminders and terminal payment-recovery notifications
- Bounded retries, delivery dedup and provider-failure visibility
- Reminder cancellation/reschedule guards against stale booking state

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Push is Should Have; it is not a mandatory release dependency unless pilot explicitly selects it
- Provider success does not confirm a reservation
- Retries must not promise exactly-once external delivery without provider support
- A cancelled/completed booking cannot trigger a stale reminder action

## Data and API changes

notification_deliveries, device tokens/preferences and reminder schedule are not in supplied core SQL; define privacy/expiry/dedup contracts first.

Notification/device/reminder routes are proposed optional contracts, not source-enumerated API endpoints.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define optional pilot channels/recipient consent
- [ ] T02 Design delivery identity and reminder scheduler
- [ ] T03 Implement provider adapter/retry visibility
- [ ] T04 Recheck current reservation before dispatch
- [ ] T05 Test duplicate/outage/stale reminder behavior

## Acceptance criteria

- [ ] Provider outage cannot roll back a booking
- [ ] Duplicate delivery attempt is identified and handled within adapter capability
- [ ] Unauthorized device token/recipient attachment fails
- [ ] Cancelled booking reminders are suppressed or corrected
- [ ] Optional scope remains separate from core pilot gating

## Required verification

- Synthetic provider outage/retry and worker restart tests
- Reminder vs cancellation race
- Recipient ownership/redaction checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-016, EPIC-017.

Only selected optional channels are activated after consent and failure behavior are verified.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
