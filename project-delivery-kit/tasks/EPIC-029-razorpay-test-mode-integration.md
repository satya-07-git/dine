---
id: "EPIC-029"
title: "Actual Razorpay Test Mode orders and checkout adapter"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-027", "EPIC-028", "EPIC-032"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Current adapter locally generates order IDs, derives payment success from strings and returns mock refund results."
---

# EPIC-029 — Actual Razorpay Test Mode orders and checkout adapter

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Current adapter locally generates order IDs, derives payment success from strings and returns mock refund results. Providing test keys does not convert this adapter into a provider integration. Order creation occurs before a durable local operation, leaving a crash/concurrency gap.

## Evidence and affected surfaces

- [apps/api/src/modules/payments/razorpay-gateway.adapter.ts](../../apps/api/src/modules/payments/razorpay-gateway.adapter.ts)
- [apps/api/src/modules/payments/payments.service.ts](../../apps/api/src/modules/payments/payments.service.ts)

## Implementation tasks

- [ ] T01 Separate explicit MockPaymentGateway and actual Razorpay Test gateway; configure fail-closed mode with no placeholder secret fallback.
- [ ] T02 Create real provider orders via authenticated server API with integer minor units, currency, receipt and local operation correlation.
- [ ] T03 Persist and uniquely claim the payment operation before provider calls; define timeout/unknown reconciliation and crash recovery without assuming provider order creation is idempotent.
- [ ] T04 Return only public checkout configuration; verify checkout HMAC with stored order_id and server secret using constant-time comparison.
- [ ] T05 Fetch provider payment/order data and validate merchant mode, association, captured status, exact amount and currency before delegating confirmation.
- [ ] T06 Use a minimal developer checkout harness for backend sandbox verification; product frontend remains deferred.
- [ ] T07 Record actual Test Mode order/payment IDs and redacted responses, never API secrets; keep live collection disabled.

## Acceptance criteria

- [ ] Actual Test dashboard/API contains the created order; local fake IDs do not count.
- [ ] Successful and failed sandbox checkout are exercised without real money.
- [ ] Timeout leaves an explicit unknown operation for reconciliation instead of a false failure/success.
- [ ] Simultaneous/retried order requests return one locally owned operation with bounded provider reconciliation.
- [ ] Invalid signature, wrong amount/currency/order and another user payment are rejected.
- [ ] Free reservations bypass payment; deposit policy cannot be bypassed by the customer.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-027, EPIC-028, EPIC-032. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.

## Official provider references

- [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Webhook validation and testing](https://razorpay.com/docs/webhooks/validate-test)
- [Webhook delivery and duplicates](https://razorpay.com/docs/webhooks/best-practices/)
- [Refund API](https://razorpay.com/docs/api/refunds/create-normal/)
