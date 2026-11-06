---
id: "EPIC-010"
title: "Payment orders and verified webhook inbox"
type: "epic"
status: "backlog"
phase: "E · Payments"
depends_on: ["EPIC-009"]
prd_requirements: ["Blueprint §2.3", "Blueprint §7.3", "Blueprint §9.1", "Blueprint §9.2", "Blueprint §12.3", "Blueprint §13.3", "Blueprint §17"]
risk: "high"
assignee: "Unassigned"
summary: "Create/reuse Razorpay test-mode orders and durably ingest authenticated gateway events without trusting client payment claims."
---

# EPIC-010 — Payment orders and verified webhook inbox

## Objective

Create/reuse Razorpay test-mode orders and durably ingest authenticated gateway events without trusting client payment claims.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 2.3, 7.3, 9.1, 9.2, 12.3, 13.3, 17. Delivery stage: E · Payments. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- PaymentGateway adapter and server-calculated deposit in integer minor units
- Idempotent order/attempt mapping to an eligible hold
- Network calls outside allocation row locks with recoverable order-creation orchestration
- Raw request body webhook signature verification and durable inbox deduplication
- Verified success processing with amount, currency, order, booking and capture eligibility checks

## Out of scope

Live charges, exposed gateway secrets, full meal payment and client redirect as payment proof.

## Business rules

- FREE_RESERVATION creates no gateway order
- DEPOSIT_REQUIRED creates/reuses a server-owned order for the hold
- Persist unique gateway event/order mappings and process retries/out-of-order events idempotently
- Acknowledge webhook only after durable receipt; downstream failure is retryable
- Captured payment state must not be downgraded by an older failure event
- Provider order-creation timeout requires recovery, not blind duplicate order creation

## Data and API changes

payment_attempts(id,booking_id,gateway_order_id,amount_minor,currency,status); payment_events(gateway_event_id,payload,status). Use unique external IDs and protected raw payload handling/retention.

POST /booking-holds/:id/payment-order (Idempotency-Key); GET /payments/:id/status; POST /webhooks/razorpay using raw-body verification. Gateway webhook is authenticated by signature rather than a customer JWT.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Only hold owner initiates its payment; private payment status belongs to that user or authorized support. Secrets stay server-side. Logs redact sensitive payloads.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Define gateway adapter and test-only configuration
- [ ] T02 Implement order attempt persistence and timeout recovery contract
- [ ] T03 Verify original raw webhook body before durable inbox insert
- [ ] T04 Process inbox events with unique IDs and monotonic state handling
- [ ] T05 Connect verified capture to reservation transition validator

## Acceptance criteria

- [ ] Retrying an order request cannot create a second logical checkout
- [ ] Tampered/raw-body signature mismatch is rejected
- [ ] Three duplicate webhook deliveries cause one business confirmation
- [ ] Out-of-order events do not downgrade captured payment
- [ ] Wrong amount/currency/order is rejected or sent to review without false confirmation
- [ ] Test mode is explicit and live processing remains disabled

## Required verification

- Use synthetic signed and tampered raw-body payloads
- Simulate order API timeout, process crash before/after persistence and duplicate requests
- Replay success/failure in different orders
- Verify no DB row lock spans an external gateway request

## Dependencies and execution gate

Prerequisites: EPIC-009.

Test-mode signed inbox and repeat-safe order flow pass; no live money is enabled.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Payment charged without booking is critical
- Current provider signature/capture requirements must be verified against official docs at implementation; supplied links are design references

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
