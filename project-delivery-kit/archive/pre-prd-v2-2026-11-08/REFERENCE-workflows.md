---
id: "workflows"
title: "Booking, payment and waitlist workflows"
---
# Critical backend workflows

Source: Blueprint §3.3, §6–11, §14–17. These are design walkthroughs, not executed integration tests.

## 1 · First vertical slice

Sign in → GET published restaurant/floor → GET availability for party/date/time → POST atomic hold → competing customer requests same table/range → max one winner, other receives 409.

Build and prove this with real PostgreSQL before adding Razorpay or waitlist. Suggested capability sequence: EPIC-001 → 002 → 003 → 004 → 006 → 007 → 008. Audit/security/migration controls apply during this slice; public discovery richness can be parallel follow-up.

## 2 · Atomic hold transaction

```text
BEGIN
  Validate caller, request and idempotency key/payload hash
  Lock physical table row FOR UPDATE
  Validate table belongs to restaurant; capacity, hours, policy, version
  Reconcile/expire only conclusively safe prior allocations
  Check candidate range against protected allocations and blocks
  Insert booking HOLD_ACTIVE + allocation HELD + expires_at
  Persist replayable idempotency result
  Append audit and outbox event
COMMIT
Return server_time, expiry, price and stable hold identity
```

Never call Razorpay while holding this lock. Exclusion constraint is the safety net for every writer. On rollback, no orphan booking/allocation/event/result may remain. Scheduled expiry does not replace request-time safety checks.

## 3 · Booking and allocation state mapping

```text
Booking HOLD_ACTIVE / allocation HELD
  → FREE_RESERVATION approved confirm action → CONFIRMED
  → order creation → PAYMENT_PENDING
      → verified capture + eligible inventory → CONFIRMED
      → unknown at deadline → PAYMENT_REVIEW
          → verified success + eligible inventory → CONFIRMED
          → conclusively safe failure/release → EXPIRED

HOLD_ACTIVE → safe expiration → EXPIRED
CONFIRMED → READY → SEATED → COMPLETED
CONFIRMED → SEATED when approved staff transition allows
Eligible booking → policy-checked CANCELLED
```

This expands the source transition examples into a planning walkthrough; it is not a complete enum/transition matrix. No-show, direct seating/completion, free confirmation and cancellation from pending/review require EPIC-001/009 policy definition. Actor and prior state are validated at every transition. Service states and append-only event/outbox commit together.

## 4 · Free versus deposit reservation

| Policy | Inventory action | Payment action |
| --- | --- | --- |
| FREE_RESERVATION | Atomic hold or direct confirmation after approved policy checks | No gateway order |
| DEPOSIT_REQUIRED | Hold → order → verified success → confirmed | Server amount/currency, test mode first |

Deposit is not necessarily the whole meal bill. Cancellation cutoff, refundability, tax handling, lateness and no-show are owner-configurable only after the approved policy contract.

## 5 · Webhook and payment trust

```text
Gateway event
  → Read ORIGINAL raw body
  → Verify gateway signature
  → Durably insert unique gateway_event_id into inbox
  → Acknowledge durable receipt
  → Idempotent processor verifies order, amount, currency, capture state
  → Lock/recheck current inventory and booking
  → Commit valid transition + history + audit + outbox
```

Duplicate and out-of-order events must not downgrade capture or duplicate confirmation/refund. A mobile success redirect is not proof. Gateway order timeouts are recoverable uncertainty, not permission to create unlimited duplicate orders.

## 6 · Expiry versus late UPI capture

| At deadline / later evidence | Inventory outcome | Recovery |
| --- | --- | --- |
| No payment started and release is conclusively safe | Expire held allocation transactionally | Public availability / eligible waitlist |
| Payment outcome unknown | Protect PAYMENT_REVIEW within bounded policy | Scheduled/event reconciliation; visible escalation |
| Verified success while eligible allocation retained | Confirm once | Publish canonical status event |
| Verified success arrives after safe release to B | Keep B allocation | Refund/compensate A with audit |
| Provider remains unknown | Follow approved bounded recovery decision | Do not invent universal timeout or silent release |

Provider queries run outside inventory locks. The commit step rechecks current state to avoid capture/expiry/promotion races. Refund requested and refund completed are distinct; failed recovery must be visible.

## 7 · Exclusive waitlist promotion

```text
Inventory safely released
  → Lock table / serialize promotion
  → Read FIFO queue in server order, stable tie-break
  → Skip ineligible entries with bounded checks and audit reason
  → Create ONE exclusive offer + OFFER_HELD allocation + outbox
  → Notify best effort
      → Customer accepts before expiry → approved free/deposit booking path
      → Decline / safe offer expiry → release and promote next
      → No eligible entries → public availability
```

Only the authenticated customer who owns the offer can accept. Restaurant staff cannot accept or charge on their behalf. The MVP queue is table-specific; compatible alternatives are later policy work. A delayed push never extends the offer deadline. Two promoters must not create two exclusive offers.

## 8 · Status and realtime delivery

Staff updates READY → API verifies membership and allowed transition → atomic booking/allocation status + history sequence + outbox → worker broadcasts privately → client validates event/version and fetches REST snapshot.

Crash after commit leaves a durable event; crash after delivery may create a duplicate. Delivery is at least once with deduplication. On launch/reconnect REST restores truth even if every intermediate realtime hint was missed.

## 9 · Risk-driven incremental SDLC

Define small scope → identify highest correctness/security risk → implement vertical slice → test unit + real DB + integration → demo/review evidence → update ADR/policy/backlog → next increment.

Do not use Waterfall as the primary cycle or formal Spiral ceremony for its own sake. Use Spiral-inspired risk review inside Agile iterative/incremental delivery and DevSecOps checks. One/two developers: Kanban plus weekly demo. Three–seven developers: one/two-week Scrum-style increments. Timelines are not estimated by this dashboard.

## 10 · Dependency-ordered release path

Definition → foundation/auth → restaurant/floor inventory → interval availability → atomic holds → lifecycle → test-mode payments and recovery → exclusive waitlist → private events/reconnect → restaurant dry-run → release verification.

Realtime can be implemented alongside payment/waitlist after lifecycle; audit/reliability are continuous. Packages/reviews are named operations-stage work with incomplete detailed contracts; include them in a pilot only after their own decisions are resolved. Future joined tables/POS/pricing/analytics remain separate.
