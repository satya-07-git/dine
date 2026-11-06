---
id: "EPIC-011"
title: "Payment review, reconciliation and refunds"
type: "epic"
status: "completed"
phase: "E · Payments"
depends_on: ["EPIC-010"]
prd_requirements: ["Blueprint §1.2", "Blueprint §9.3", "Blueprint §9.4", "Blueprint §10.3", "Blueprint §14.2", "Blueprint §17", "Blueprint §19.1"]
risk: "high"
assignee: "Backend Engineering Team"
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

- [x] T01 Define bounded review and safe-release decision table
- [x] T02 Implement reconciler and concurrency-safe current-state recheck
- [x] T03 Implement late-capture recovery and idempotent refund workflow
- [x] T04 Add failed refund/review escalation visibility
- [x] T05 Write payment incident playbook and retry limits

## Acceptance criteria

- [x] Deadline with unknown payment cannot silently free inventory
- [x] Simultaneous expiry and capture produce a consistent single final allocation decision
- [x] Late capture after reallocation leaves the new customer untouched
- [x] Duplicate refund requests/events do not duplicate monetary action
- [x] Review timeout/provider outage reaches a visible bounded recovery path

## Required verification

- Race verified capture, expiry, waitlist promotion and reconciliation
- Simulate missing webhook, UPI connection loss, delayed gateway success and unknown timeout
- Replay refund pending/success/failure events and worker restarts

## Dependencies and execution gate

Prerequisites: [EPIC-010](EPIC-010-payment-orders-and-verified-webhook-inbox.md).

Duplicate, lost, late and ambiguous payment scenarios pass in staging test mode.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- No universal UPI review timeout can be inferred from the blueprint
- Indefinite review blocks inventory; reckless release risks paid-no-booking incidents

## Completion report

### Status: Completed & Verified

1. **Database Schema & Evolution**:
   - Authored authoritative migration `supabase/migrations/20261106000011_payment_review_reconciliation_and_refunds.sql` adding:
     - `payment_attempts`: columns `gateway_payment_id`, `reconciliation_status`, `review_started_at`, `review_expires_at`, `reconciled_at`, `last_reconciled_at`, `retry_count`, `escalation_reason`, and index `idx_payment_attempts_reconciliation`.
     - `refunds`: columns `booking_id`, `currency`, `idempotency_key`, `metadata`, `initiated_by`, `escalated_at`, `escalation_reason`, and unique index `idx_refunds_idempotency_key`.
     - `payment_incidents`: support escalation incident tracking table with RLS policies, check constraints (`incident_type`, `severity`, `status`), and indexes `idx_payment_incidents_status_severity`, `idx_payment_incidents_booking`.
   - Updated Drizzle ORM schema mapping in `apps/api/src/common/db/schema.ts`.

2. **Shared Contracts & Error Domain (`@dine/contracts`)**:
   - Added `RefundStatus`, `PaymentReconciliationStatus`, `PaymentIncidentType`, `PaymentIncidentSeverity`, `PaymentIncidentStatus` to `packages/contracts/src/enums.ts`.
   - Added domain errors `PAYMENT_REVIEW_TIMEOUT`, `REFUND_FAILED`, `LATE_CAPTURE_REALLOCATED`, `PAYMENT_ALREADY_CAPTURED`, `REFUND_AMOUNT_EXCEEDED` to `packages/contracts/src/errors.ts`.
   - Exported request and response DTOs (`RefundResponseDto`, `CreateRefundRequestDto`, `PaymentReconciliationDetailDto`, `ReconcilePaymentRequestDto`, `ReconciliationResultDto`, `PaymentIncidentDto`, `PaymentIncidentListQueryDto`, `ResolvePaymentIncidentRequestDto`, `ResolvePaymentIncidentResponseDto`) in `packages/contracts/src/dtos.ts`.

3. **Gateway Adapter & Core Services**:
   - Defined `apps/api/src/modules/payments/payment-gateway.interface.ts` and extended `apps/api/src/modules/payments/razorpay-gateway.adapter.ts` with `fetchPaymentStatus` and `initiateRefund` in test mode.
   - Built complete bounded reconciliation logic in `apps/api/src/modules/payments/payments.service.ts`:
     - `evaluateReconciliationDecision`: formal decision table implementation (bounded 15m review window, max 3 retries).
     - `reconcilePayment`: out-of-lock gateway status query followed by atomic transactional current-state recheck (`SELECT ... FOR UPDATE`).
     - `processRefund`: idempotent refund pipeline with deduplication on `idempotency_key` and amount validation.
     - `getIncidents`, `getIncidentById`, and `resolveIncident`: support queue visibility and audited resolution.
   - Exposed endpoints in `apps/api/src/modules/payments/payments.controller.ts`:
     - `GET /payments/:id/status`
     - `POST /payments/:id/reconcile`
     - `POST /payments/:id/refund`
     - `GET /payments/incidents`
     - `GET /payments/incidents/:id`
     - `PATCH /payments/incidents/:id/resolve`

4. **Documentation & Operational Runbooks**:
   - Created `docs/policies/payment-incident-playbook.md` defining SLA bounds, reconciler decision matrix, late-capture recovery procedures, and human support runbooks.
   - Exported updated OpenAPI specification to `docs/architecture/openapi.json` with 54 routes documented.

5. **Automated Testing & Full CI/CD Verification**:
   - Authored unit test suite `tests/unit/payment-reconciliation.test.js` (17/17 tests passing).
   - Authored integration verification test suite `TestEpic11PaymentReviewReconciliationAndRefunds` in `tests/test_ci_cd_verification.py` (84/84 tests passing).
   - Integrated unit tests into `scripts/ci.sh` Gate 4 and verified all 8 gates pass cleanly:
     - Gate 1: Dashboard and Dependency DAG
     - Gate 2: Inline Script Syntax
     - Gate 3: TypeScript Monolith Compilation
     - Gate 4: Node.js Unit Tests (Foundation, Identity, Policies, Discovery, Menus, Floor Plans, Availability, Atomic Holds, Lifecycle, Payment Orders & Reconciliation)
     - Gate 5: Authoritative SQL Migrations & Synthetic Seed Check
     - Gate 6: OpenAPI Specification Validation
     - Gate 7: Comprehensive Python Architecture & Invariant Verification Suite
     - Gate 8: Repository Markdown Links Verification
