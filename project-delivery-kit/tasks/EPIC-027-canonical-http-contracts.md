---
id: "EPIC-027"
title: "Canonical HTTP contracts and request validation"
type: "epic"
status: "backlog"
phase: "R1 · Verification foundation"
depends_on: ["EPIC-026"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "The global /v1 prefix combines with embedded api/v1 route strings."
---

# EPIC-027 — Canonical HTTP contracts and request validation

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

The global /v1 prefix combines with embedded api/v1 route strings. A static compatibility map lists routes without registering handlers; checkout verification is listed but missing as an actual handler.

## Evidence and affected surfaces

- [apps/api/src/main.ts](../../apps/api/src/main.ts)
- [apps/api/src/modules/recommendations](../../apps/api/src/modules/recommendations)
- [apps/api/src/modules/v2-compatibility](../../apps/api/src/modules/v2-compatibility)
- [apps/api/src/modules/payments/payments.controller.ts](../../apps/api/src/modules/payments/payments.controller.ts)

## Implementation tasks

- [ ] T01 Inventory all 23 finalized canonical routes and map actual registered Nest endpoints and legacy aliases.
- [ ] T02 Apply /api/v1 exactly once; add explicit backwards-compatible aliases with deprecation contract.
- [ ] T03 Implement missing server checkout verification route using stored provider order identity; never trust client success alone.
- [ ] T04 Use runtime DTO validators for identifiers, integer minor-unit amounts, dates and enum values; reject unknown fields.
- [ ] T05 Generate OpenAPI from actual application registration and compare request/response/error schemas.
- [ ] T06 Add real HTTP request tests for every route including auth errors, invalid payloads and duplicate prefix regressions.

## Acceptance criteria

- [ ] Every canonical route resolves to its intended handler; no /v1/api/v1 paths.
- [ ] Legacy supported aliases invoke the same business service.
- [ ] Missing handler and undocumented route drift fail CI.
- [ ] Malformed IDs, fractional money and unknown fields return documented errors.
- [ ] Checkout route does not confirm based only on client-supplied payment IDs.
- [ ] HTTP and generated OpenAPI contract evidence attached.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-026. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
