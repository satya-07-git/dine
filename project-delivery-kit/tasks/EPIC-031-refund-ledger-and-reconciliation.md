---
id: "EPIC-031"
title: "Refund ledger, reconciliation and financial truth"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-029", "EPIC-030"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "critical"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Late-capture code inserts SUCCEEDED refund without calling the gateway."
---

# EPIC-031 — Refund ledger, reconciliation and financial truth

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Late-capture code inserts SUCCEEDED refund without calling the gateway. Refund limits are checked per request rather than cumulatively; replay can return a cached result before verifying actor ownership. Mock responses are not proof money was refunded.

## Evidence and affected surfaces

- [apps/api/src/modules/payments/payments.service.ts](../../apps/api/src/modules/payments/payments.service.ts)
- [docs/policies/payment-incident-playbook.md](../../docs/policies/payment-incident-playbook.md)

## Implementation tasks

- [ ] T01 Persist refund intent/attempt before provider submission and store actual provider refund ID; never synthesize success.
- [ ] T02 Keep requested/pending/processed/failed/unknown financial states distinct, mapping verified provider states explicitly.
- [ ] T03 Serialize cumulative refund checks against captured amount minus processed and pending commitments using integer minor units.
- [ ] T04 Authorize before idempotency replay; scope keys to actor/resource/operation and reject changed payload.
- [ ] T05 Reconcile unknown submission outcomes and duplicate refund webhooks; resolve incidents only from evidence with audit history.
- [ ] T06 Test full/partial refund, concurrent over-refund, provider rejection, timeout, late capture and process death.

## Acceptance criteria

- [ ] Actual Test Mode refund exists at provider and local terminal status matches provider evidence.
- [ ] Cumulative concurrent refunds never exceed captured refundable balance.
- [ ] Timeout does not become automatic success or a blind duplicate submission.
- [ ] Cross-user idempotency replay reveals no financial information.
- [ ] Late capture queues a real refund/review and preserves replacement inventory.
- [ ] Incident resolution is evidence-backed, replay-safe and audited.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-029, EPIC-030. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.

## Official provider references

- [Razorpay integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Webhook validation and testing](https://razorpay.com/docs/webhooks/validate-test)
- [Webhook delivery and duplicates](https://razorpay.com/docs/webhooks/best-practices/)
- [Refund API](https://razorpay.com/docs/api/refunds/create-normal/)
