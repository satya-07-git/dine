---
id: "EPIC-013"
title: "Razorpay orders, verification and webhook inbox"
type: "epic"
status: "backlog"
phase: "E · Payments"
depends_on: ["EPIC-012"]
prd_requirements: ["PRD §7, §11.6–11.8, C-004", "SQL §5–6"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Persist server-owned payment attempts and verify gateway evidence without extending holds or trusting client callbacks."
---

# EPIC-013 — Razorpay orders, verification and webhook inbox

## Objective

Persist server-owned payment attempts and verify gateway evidence without extending holds or trusting client callbacks.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §7, §11.6–11.8, C-004; SQL §5–6.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · E · Payments. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Create/reuse orders for DEPOSIT reservation snapshot amount/currency
- Persist attempt/operation identity before external calls; recover uncertain order creation
- Raw-body HMAC webhook verification and durable unique inbox
- Server payment verification with order, amount, currency and capture-state validation
- Confirm only valid owned claim under the same inventory lock

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Provider HTTP calls happen outside inventory transactions
- A client success callback/Socket.IO event cannot confirm a booking
- Payment attempt does not extend 120-second hold
- Durable inbox receipt precedes acknowledgment; event replay/out-of-order processing is monotonic
- FREE mode creates no payment record/order unnecessarily
- Persisted order identifiers enable crash recovery

## Data and API changes

payments(reservation_id,gateway_order_id,gateway_payment_id,amount_paise,currency,status); payment_events(gateway_event_id,payload,processed_at). Refund failure/partial states differ across source snippets; canonical mapping belongs to EPIC-014, not silently dropped.

POST /payments/orders; POST /payments/verify; POST /webhooks/razorpay. Signature-auth webhook differs from Bearer-auth customer verification; customer proof is still verified server-side.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define PaymentGateway adapter and server snapshot contract
- [ ] T02 Implement durable idempotent order orchestration and timeout recovery
- [ ] T03 Verify original raw webhook body into unique inbox
- [ ] T04 Validate amount/currency/order/capture evidence
- [ ] T05 Integrate short atomic claim finalization and outbox

## Acceptance criteria

- [ ] Same operation/key does not create a second logical payment order
- [ ] Tampered/raw-body signature mismatch is rejected
- [ ] Duplicate/out-of-order events yield one logical payment update
- [ ] Wrong amount/currency/order cannot confirm a reservation
- [ ] Gateway wait never holds inventory row lock
- [ ] Capture after hold expiry routes to reconciliation, not confirmation

## Required verification

- Signed/tampered synthetic webhook fixtures
- Order timeout and crash-before/after persistence scenarios
- Duplicate success and delayed failure replays
- Verify unchanged expiresAt during payment initiation

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-012.

Gateway test-mode happy path and replay trust checks pass; live money remains gated.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
