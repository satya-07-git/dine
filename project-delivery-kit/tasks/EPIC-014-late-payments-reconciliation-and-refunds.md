---
id: "EPIC-014"
title: "Late payments, reconciliation and refunds"
type: "epic"
status: "backlog"
phase: "E · Payments"
depends_on: ["EPIC-013"]
prd_requirements: ["PRD §6.3, §7.2, C-003–C-005", "SQL §5", "Diagram 2"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Track every uncertain financial operation to verified resolution without reclaiming expired inventory or duplicating refunds."
---

# EPIC-014 — Late payments, reconciliation and refunds

## Objective

Track every uncertain financial operation to verified resolution without reclaiming expired inventory or duplicating refunds.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §6.3, §7.2, C-003–C-005; SQL §5; Diagram 2.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · E · Payments. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Durable reconciliation queue/state separate from reservation/payment enum
- Gateway lookup after missing webhook/client disconnect/server crash
- Late payment after claim expiry/reallocation → reconciliation/refund/explicit authorized alternative
- Idempotent refunds with attempt/result history and visible escalation
- Recover captured payment after process death before booking commit

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Unknown timeout is not FAILED payment; financial reconciliation continues after inventory expiry
- MVP hold is not silently leased/extended while money is pending
- Late success cannot take B claim or normally confirm A expired hold, even if UI still says processing
- Any alternative recovery requires explicit authorized policy and fresh inventory protocol
- PRD includes REFUND_FAILED; SQL includes PARTIALLY_REFUNDED—model both intentionally and test mappings
- Retry budgets schedule escalation; they cannot silently abandon unresolved money

## Data and API changes

Review payment/refund enum constraints; add reconciliation records, retry/escalation metadata and immutable payment/refund operation IDs. refunds.status is unconstrained in baseline and needs a defined transition contract; cap total successful refunds against verified capture under serialization.

Private GET /bookings/:id must expose safe financial-recovery status separately. Refund/reconciliation support APIs are not enumerated; design RBAC/idempotency/reason contracts before adding routes.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define expiry-vs-finance decision matrix and terminal outcomes
- [ ] T02 Persist reconciliation state and provider lookup scheduling
- [ ] T03 Implement valid-live-claim confirmation versus expired-claim recovery
- [ ] T04 Implement idempotent full/partial/failed refund state mappings
- [ ] T05 Add support escalation and non-abandonment monitoring

## Acceptance criteria

- [ ] Unknown payment remains tracked after table claim safely expires
- [ ] A late captured payment after B acquisition never reclaims B inventory
- [ ] Server crash after capture recovers to valid confirmation or refund/authorized alternative
- [ ] Duplicate refund requests cannot duplicate financial side effects
- [ ] Partial/refund-failed outcomes are represented and audited
- [ ] No unresolved money disappears because retry limit was reached

## Required verification

- Crash after capture before confirmation and missing webhook cases
- Race expiry, provider verification and new claimant
- Partial/duplicate/failed refund event replays
- Unknown provider outcome with bounded retries and human escalation

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-013.

Every unresolved payment has an owner and durable path to verified terminal resolution.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
