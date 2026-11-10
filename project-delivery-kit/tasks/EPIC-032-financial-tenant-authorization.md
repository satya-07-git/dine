---
id: "EPIC-032"
title: "Tenant and support authorization across financial operations"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-027"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "critical"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "Authentication alone protects some reconcile/incident endpoints."
---

# EPIC-032 — Tenant and support authorization across financial operations

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

Authentication alone protects some reconcile/incident endpoints. Role booleans can bypass restaurant membership, and refund replay precedes ownership validation. A valid token therefore does not establish access to a specific payment or restaurant.

## Evidence and affected surfaces

- [apps/api/src/modules/payments/payments.controller.ts](../../apps/api/src/modules/payments/payments.controller.ts)
- [apps/api/src/modules/payments/payments.service.ts](../../apps/api/src/modules/payments/payments.service.ts)
- [apps/api/src/common/auth](../../apps/api/src/common/auth)

## Implementation tasks

- [ ] T01 Create actor/action/resource permission matrix for customer, owner, manager, platform admin and support.
- [ ] T02 Resolve resource tenant and active membership server-side for status, reconcile, refund and incident routes.
- [ ] T03 Require explicit scoped support grants and audited reason for privileged financial access; remove broad role-boolean bypasses.
- [ ] T04 Authorize before any cache/idempotency return and scope incident listings by permitted tenants.
- [ ] T05 Enforce revocation for HTTP and private subscriptions using shared persistent session state.
- [ ] T06 Add actual HTTP negative tests: unrelated owner, other customer, revoked manager, support without grant and mixed-tenant IDs.

## Acceptance criteria

- [ ] Every financial route rejects unauthorized cross-tenant and cross-user requests.
- [ ] Manager permissions reflect active membership and granular assigned actions.
- [ ] Unauthorized idempotency replay cannot return cached private results.
- [ ] Incident list/detail/resolve and reconcile require explicit resource authorization.
- [ ] Privileged actions record actor, scope, reason and correlation ID.
- [ ] Positive permitted flows remain functional; rejected calls cause no provider or DB mutation.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-027. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
