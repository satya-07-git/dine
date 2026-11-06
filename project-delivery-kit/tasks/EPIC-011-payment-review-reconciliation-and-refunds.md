---
id: "EPIC-011"
title: "Payment review, reconciliation and refunds"
type: "epic"
status: "backlog"
phase: "E · Payments"
depends_on: ["EPIC-010"]
prd_requirements: ["Blueprint §1.2", "Blueprint §9.3", "Blueprint §9.4", "Blueprint §10.3", "Blueprint §14.2", "Blueprint §17", "Blueprint §19.1"]
risk: "high"
assignee: "Unassigned"
summary: "Resolve uncertain or late payments without double allocation, silent charges or indefinite inventory protection."
---

# EPIC-011 — Payment review, reconciliation and refunds

## Objective

Resolve uncertain or late payments without double allocation, silent charges or indefinite inventory protection.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 9.3, 9.4, 10.3, 14.2, 17, 19.1. Delivery stage: E · Payments. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- PAYMENT_REVIEW with bounded, gateway-specific reconciliation policy
- Scheduled and event-triggered provider status lookup/recovery
- Atomic confirm-vs-release decision under the inventory lock
- Late capture after safe reallocation triggers refund/compensation, never table theft
- Idempotent refund attempts, provider outcomes and audited support recovery

## Out of scope

Assuming deadline means payment failure, reclaiming B inventory for A, invented settlement promises and real refunds during dashboard planning.

## Business rules

- Unknown pending outcome is not conclusively safe to release
- Do provider queries outside locks; revalidate current state within a short commit transaction
- If A pays after inventory has moved to B, retain B and recover/refund A
- Refund request, provider completion and customer notification are distinct states
- Bound review duration, retries and manual escalation after explicit policy decisions
- Commercial release requires approved cancellation/refund/settlement rules

## Data and API changes

Extend payment_attempts with reconciliation metadata; refunds with unique logical request/provider IDs; payment_events; audit_logs; outbox_events. Precise recovery statuses/time windows need the approved contract.

GET /payments/:id/status reflects trusted review/refund status. Blueprint names refund idempotency but no refund/support route; document its contract and RBAC before implementation.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Workers use least-privilege internal identity. Support actions require controlled permission, reason and immutable audit; customers never declare capture/refund success.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Define bounded review and safe-release decision table
- [ ] T02 Implement reconciler and concurrency-safe current-state recheck
- [ ] T03 Implement late-capture recovery and idempotent refund workflow
- [ ] T04 Add failed refund/review escalation visibility
- [ ] T05 Write payment incident playbook and retry limits

## Acceptance criteria

- [ ] Deadline with unknown payment cannot silently free inventory
- [ ] Simultaneous expiry and capture produce a consistent single final allocation decision
- [ ] Late capture after reallocation leaves the new customer untouched
- [ ] Duplicate refund requests/events do not duplicate monetary action
- [ ] Review timeout/provider outage reaches a visible bounded recovery path

## Required verification

- Race verified capture, expiry, waitlist promotion and reconciliation
- Simulate missing webhook, UPI connection loss, delayed gateway success and unknown timeout
- Replay refund pending/success/failure events and worker restarts

## Dependencies and execution gate

Prerequisites: EPIC-010.

Duplicate, lost, late and ambiguous payment scenarios pass in staging test mode.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- No universal UPI review timeout can be inferred from the blueprint
- Indefinite review blocks inventory; reckless release risks paid-no-booking incidents

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
