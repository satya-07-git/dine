---
id: "EPIC-030"
title: "Durable webhook inbox and safe late-payment confirmation"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-028", "EPIC-029"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "critical"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Webhook dedup reads a body identifier rather than x-razorpay-event-id and races around INSERT ON CONFLICT."
---

# EPIC-030 — Durable webhook inbox and safe late-payment confirmation

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Webhook dedup reads a body identifier rather than x-razorpay-event-id and races around INSERT ON CONFLICT. Captured payment can confirm without a fresh locked expiry/claim check. Unknown outcomes and replay ordering need a durable state machine.

## Evidence and affected surfaces

- [apps/api/src/modules/payments/payments.controller.ts](../../apps/api/src/modules/payments/payments.controller.ts)
- [apps/api/src/modules/payments/payments.service.ts](../../apps/api/src/modules/payments/payments.service.ts)

## Implementation tasks

- [ ] T01 Validate raw-body HMAC before accepting events; read x-razorpay-event-id and persist unique durable inbox with safe payload retention.
- [ ] T02 Acknowledge only after durable acceptance; atomically claim processing so duplicates cannot repeat side effects.
- [ ] T03 Verify captured amount, currency and stored order/payment association with the gateway, not optional payload fields.
- [ ] T04 Lock canonical hold/claim and check fresh DB expiry and current ownership inside the confirmation transaction.
- [ ] T05 Model reordered, duplicate, delayed, unknown and failed events with monotonic financial state and transactional booking/outbox changes.
- [ ] T06 For capture after lost/expired claim create a durable refund/review operation; never confirm or seize replacement inventory.
- [ ] T07 Exercise public HTTPS staging webhook delivery, retry, worker crash and reconciliation when webhook delivery is missing.

## Acceptance criteria

- [ ] Bad HMAC and mismatched provider identities cause no state mutation.
- [ ] Parallel duplicate event deliveries produce one logical transition/outbox event.
- [ ] Capture before valid expiry confirms exactly once; capture after expiry cannot confirm.
- [ ] Customer B retains a replacement claim when customer A pays late.
- [ ] Pending/timeout remains under reconciliation until provider evidence resolves it.
- [ ] Crash after inbox commit resumes processing; delayed/reordered events cannot regress final state.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-028, EPIC-029. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.

## Official provider references

- [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Webhook validation and testing](https://razorpay.com/docs/webhooks/validate-test)
- [Webhook delivery and duplicates](https://razorpay.com/docs/webhooks/best-practices/)
- [Refund API](https://razorpay.com/docs/api/refunds/create-normal/)
