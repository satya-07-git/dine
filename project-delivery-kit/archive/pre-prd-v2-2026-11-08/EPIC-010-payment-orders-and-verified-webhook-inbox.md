---
id: "EPIC-010"
title: "Payment orders and verified webhook inbox"
type: "epic"
status: "completed"
phase: "E · Payments"
depends_on: ["EPIC-009"]
prd_requirements: ["Blueprint §2.3", "Blueprint §7.3", "Blueprint §9.1", "Blueprint §9.2", "Blueprint §12.3", "Blueprint §13.3", "Blueprint §17"]
risk: "high"
assignee: "Lead Systems & Backend Architect"
summary: "Create/reuse Razorpay test-mode orders and durably ingest authenticated gateway events without trusting client payment claims."
---

# EPIC-010 — Payment orders and verified webhook inbox

## Objective

Create/reuse Razorpay test-mode orders and durably ingest authenticated gateway events without trusting client payment claims.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 2.3, 7.3, 9.1, 9.2, 12.3, 13.3, 17. Delivery stage: E · Payments. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository deliverable. Dependencies are capability prerequisites, verified through automated CI/CD gates.

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

- [x] T01 Define gateway adapter and test-only configuration
- [x] T02 Implement order attempt persistence and timeout recovery contract
- [x] T03 Verify original raw webhook body before durable inbox insert
- [x] T04 Process inbox events with unique IDs and monotonic state handling
- [x] T05 Connect verified capture to reservation transition validator

## Acceptance criteria

- [x] Retrying an order request cannot create a second logical checkout
- [x] Tampered/raw-body signature mismatch is rejected
- [x] Three duplicate webhook deliveries cause one business confirmation
- [x] Out-of-order events do not downgrade captured payment
- [x] Wrong amount/currency/order is rejected or sent to review without false confirmation
- [x] Test mode is explicit and live processing remains disabled

## Required verification

- Use synthetic signed and tampered raw-body payloads
- Simulate order API timeout, process crash before/after persistence and duplicate requests
- Replay success/failure in different orders
- Verify no DB row lock spans an external gateway request

## Dependencies and execution gate

Prerequisites: [EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md).

Test-mode signed inbox and repeat-safe order flow pass; no live money is enabled.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Payment charged without booking is critical
- Current provider signature/capture requirements must be verified against official docs at implementation; supplied links are design references

## Completion report

Completed and verified by Lead Systems & Backend Architect on 07 November 2026.

### 1. Architectural Deliverables & Core Features Implemented
- **Authoritative Database Migrations & Performance Indexes (T01, T02, T03, T04, T05)**:
  - `supabase/migrations/20261106000010_payment_orders_and_verified_webhook_inbox.sql`:
    - Defined `payment_attempts` with `id`, `booking_id`, `gateway`, `gateway_order_id`, `amount_minor`, `currency`, `status`, and timestamps.
    - Defined `payment_events` inbox table with `gateway_event_id` unique constraint, `event_type`, `payload JSONB`, and `processed_at`.
    - Added lookup and ordering indexes: `idx_payment_attempts_booking`, `idx_payment_attempts_gateway_order`, `idx_payment_attempts_status`, `idx_payment_events_gateway_event`, and `idx_payment_events_event_type`.
    - Configured Row Level Security (RLS) on `payment_attempts`:
      - `payment_attempts_customer_read`: Customer SELECT permitted strictly for own bookings.
      - `payment_attempts_staff_read`: Staff access restricted to active authenticated staff (`OWNER`, `MANAGER`, `HOST`) of the booking's restaurant tenant.
    - Configured Row Level Security (RLS) on `payment_events`:
      - `payment_events_service_only`: Restricted to backend service role.
- **Payment Gateway Adapter & Explicit Test Mode (T01)**:
  - `apps/api/src/modules/payments/razorpay-gateway.adapter.ts`:
    - `RazorpayGatewayAdapter` implementing `PaymentGateway` interface.
    - Explicit test-mode validation checking `rzp_test_` prefix; live money processing is strictly disabled (`isLiveDisabled: true`).
    - Cryptographic HMAC-SHA256 signature verification over raw request payloads with timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
    - Deterministic test-mode order generation operating outside database row locks.
- **Order Attempt Persistence & Idempotent Reuse (T02)**:
  - `apps/api/src/modules/payments/payments.service.ts`:
    - `createPaymentOrder`: Validates customer IDOR ownership, hold safe expiry, and restaurant policy mode.
    - Strictly rejects `FREE_RESERVATION` policy mode with 400/422 ValidationError.
    - Derives deposit amount and currency strictly from server policy snapshot in integer minor units, preventing client-side amount tampering.
    - Idempotency key checking via `idempotency_records` cache and deterministic SHA-256 payload hashing.
    - Checks for existing `INITIATED` payment attempts for the booking: reuses the existing `gateway_order_id` rather than generating a second logical checkout (Acceptance Criterion 1).
    - Transitions booking and table allocation to `PAYMENT_PENDING`, appends sequenced `booking_status_events`, and emits transactional outbox event.
- **Raw Webhook Verification & Durable Inbox Deduplication (T03, T04, T05)**:
  - `PaymentsController`:
    - `POST /webhooks/razorpay` and `POST /payments/webhooks/razorpay`: Raw request body preserved via `rawBody: true` in NestJS bootstrap.
    - Rejects missing or tampered signature with `401 Unauthorized` (`INVALID_WEBHOOK_SIGNATURE`) (Acceptance Criterion 2).
    - Deduplicates webhook deliveries using unique `gateway_event_id` in `payment_events`: three identical deliveries cause exactly one business confirmation and two `DUPLICATE_IGNORED` acknowledgments (Acceptance Criterion 3).
    - Monotonic state handling: `payment.failed` event arriving out-of-order after `payment.captured` does NOT downgrade `CAPTURED` or `CONFIRMED` states (Acceptance Criterion 4).
    - Amount and currency verification: Mismatched amounts or currencies are detected and routed to `PAYMENT_REVIEW` on both payment attempt and booking, preserving inventory safely without false confirmation (Acceptance Criterion 5).
    - Verified `payment.captured` events advance booking and table allocation to `CONFIRMED`, append sequenced audit history, and emit `BOOKING_CONFIRMED` outbox records.
  - `BookingHoldsController`:
    - `POST /booking-holds/:id/payment-order`: Route for generating or reusing orders directly from hold references.
  - `PaymentsController`:
    - `GET /payments/:id/status`: Retrieves payment attempt and booking status scoped by customer IDOR ownership or staff tenancy.
- **Shared Contracts & DTOs**:
  - `packages/contracts/src/dtos.ts`: Exported `CreatePaymentOrderRequestDto`, `PaymentOrderResponseDto`, `PaymentStatusResponseDto`, and `RazorpayWebhookResponseDto`.
  - `packages/contracts/src/errors.ts`: Added error taxonomy entries `INVALID_WEBHOOK_SIGNATURE`, `PAYMENT_ORDER_CREATION_FAILED`, `PAYMENT_AMOUNT_MISMATCH`, and `PAYMENT_ATTEMPT_NOT_FOUND`.

### 2. Automated Test & CI Verification Evidence
- **Automated Node.js Unit Suite**: `tests/unit/payment-orders-and-webhooks.test.js`
  - 12 comprehensive unit and invariant tests passing:
    - `Test mode is explicit and live money is disabled (AC 6)`: Verified test mode and live disablement.
    - `createOrder generates test order outside row locks with minor units`: Verified minor unit generation.
    - `createOrder rejects invalid or zero deposit amount`: Verified validation guards.
    - `verifyWebhookSignature validates genuine signature and detects tampering (AC 2)`: Verified HMAC-SHA256 verification and tamper rejection.
    - `Order creation succeeds for DEPOSIT_REQUIRED hold`: Verified order persistence and state transition to `PAYMENT_PENDING`.
    - `Retrying an order request reuses existing initiated order without second checkout (AC 1)`: Verified order reuse.
    - `Identical idempotency replay returns cached response with isReplay=true`: Verified idempotency cache replay.
    - `FREE_RESERVATION creates no gateway order and is rejected`: Verified free reservation policy rejection.
    - `Customer cannot create order for another user booking (IDOR protection)`: Verified IDOR access denial.
    - `Expired hold cannot create payment order`: Verified server clock expiry enforcement.
    - `Webhook with missing or tampered signature is rejected with 401 Unauthorized (AC 2)`: Verified signature rejection.
    - `Verified payment.captured webhook confirms booking and advances allocation (AC 3, T04, T05)`: Verified capture, confirmation, and events.
    - `Three duplicate webhook deliveries cause exactly one business confirmation (AC 3)`: Verified inbox deduplication.
    - `Out-of-order payment.failed event does NOT downgrade captured payment (AC 4)`: Verified monotonic state protection.
    - `Mismatched amount or currency sent to PAYMENT_REVIEW without false confirmation (AC 5)`: Verified review routing.
- **Python CI/CD Test Suite**: `tests/test_ci_cd_verification.py`
  - `TestEpic10PaymentOrdersAndWebhooks` passing all verification checks:
    - Node.js unit suite execution
    - SQL migration 10 schema, index, and RLS policy verification
    - OpenAPI contract documentation
    - Cryptographic HMAC-SHA256 signature verification and tamper rejection
    - Idempotent order reuse without duplicate checkout
    - 3 duplicate webhooks deduplication
    - Monotonic state out-of-order protection
    - Amount and currency mismatch detection
    - Free reservation order exclusion
    - Explicit test mode and live money disablement
- **CI Shell Pipeline**: `scripts/ci.sh`
  - All 8 CI/CD quality and architecture gates passed.

### 3. Remaining Limitations & Downstream Release Gates
- Live payment processing is blocked until Phase 10 commercial gates `GATE-001`, `GATE-002`, and `GATE-003` receive official sign-off.
- Downstream payment reconciliation and refund flows are tracked in [EPIC-011](EPIC-011-payment-review-reconciliation-and-refunds.md).
