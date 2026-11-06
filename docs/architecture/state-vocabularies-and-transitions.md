# Canonical State Vocabularies, Transition Matrices, and Scenario Walkthroughs

## Purpose
This document defines the canonical state vocabularies and strict state transition rules across three distinct lifecycle domains in Dine:
1. **Booking State**: Customer-facing reservation entity.
2. **Table Allocation State**: Physical table inventory protection interval.
3. **Payment Attempt State**: Financial transaction and gateway reconciliation.

This fulfills **Task T03** and **Required Verification** of **EPIC-001** and Blueprint §5, §7, §8, §9, §10, and §11.

---

## 1. Domain State Vocabularies

### 1.1 Booking State (`bookings.status`)
The booking entity tracks the customer's intent and reservation progress.

| State | Description | Protected Inventory? |
| :--- | :--- | :--- |
| `HOLD_ACTIVE` | Pre-payment hold or pending confirmation; countdown active on server. | Yes |
| `PAYMENT_PENDING` | Gateway order created; awaiting customer payment and webhook verification. | Yes |
| `PAYMENT_REVIEW` | Expiry deadline reached while gateway status is ambiguous (e.g. UPI late capture). | Yes |
| `CONFIRMED` | Fully verified booking (free or deposit paid). Guaranteed reservation. | Yes |
| `READY` | Restaurant host flagged table as prepared and guest arrival expected. | Yes |
| `SEATED` | Guest arrived and seated at the physical table. | Yes |
| `COMPLETED` | Dining experience finished; table cleared. | No (historical) |
| `CANCELLED` | Booking cancelled by customer or restaurant staff. | No |
| `NO_SHOW` | Guest failed to arrive within grace period; recorded by staff. | No |
| `EXPIRED` | Hold expired without payment or confirmation; safely released. | No |
| `PAYMENT_FAILED` | Explicit payment failure reported by gateway. | No |

---

### 1.2 Table Allocation State (`table_allocations.status`)
The table allocation entity locks physical table time ranges (`tstzrange`) in the database.

> [!IMPORTANT]
> The PostgreSQL GiST exclusion constraint (`no_protected_table_overlap`) actively blocks overlapping ranges for all statuses in:
> `('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED', 'COMPLETED')`
> Only transitioning to `RELEASED` or `CANCELLED` frees the table for competing bookings.

| State | Description | Exclusion Active? |
| :--- | :--- | :--- |
| `HELD` | Initial hold acquired by a customer during checkout. | **YES** |
| `OFFER_HELD` | Exclusive hold reserved for a promoted waitlist guest. | **YES** |
| `PAYMENT_PENDING` | Active payment order in flight. | **YES** |
| `PAYMENT_REVIEW` | Ambiguous payment outcome under reconciliation; preserves table. | **YES** |
| `CONFIRMED` | Confirmed reservation holds table. | **YES** |
| `READY` | Host prep state; holds table. | **YES** |
| `SEATED` | Guest currently dining; holds table. | **YES** |
| `COMPLETED` | Dining concluded. (Note: once dining period ends, exclusion naturally lapses). | Inactive for future ranges |
| `RELEASED` | Hold or offer safely expired without confirmation; inventory unlocked. | **NO** |
| `CANCELLED` | Allocation cancelled; inventory unlocked. | **NO** |

---

### 1.3 Payment Attempt State (`payment_attempts.status`)
Tracks interaction with external payment gateway (Razorpay).

| State | Description |
| :--- | :--- |
| `INITIATED` | Gateway order created via `/v1/payments/orders`. |
| `PENDING_REVIEW` | Awaiting gateway webhook / reconciliation confirmation. |
| `CAPTURED` | Gateway verified payment signature and confirmed funds capture. |
| `FAILED` | Gateway reported payment failure or customer aborted payment. |
| `REFUNDED` | Deposit refunded in full or part back to customer payment method. |

---

## 2. State Transition Matrix & Ownership

| Current State | Next State | Trigger / Endpoint | Authorized Actor | Preconditions | Postconditions & Side Effects |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`[None]`** | `HOLD_ACTIVE` | `POST /v1/holds` | Authenticated Customer | Table available for range; capacity matches; within operating hours; idempotency valid. | Allocation created as `HELD`; table locked; timer set for 5 min. |
| **`HOLD_ACTIVE`** | `CONFIRMED` | `POST /v1/bookings/:id/confirm` | Authenticated Customer | Restaurant policy is `FREE_RESERVATION`; hold not expired (`expires_at > NOW()`). | Booking `CONFIRMED`; allocation `CONFIRMED`; outbox event published. |
| **`HOLD_ACTIVE`** | `PAYMENT_PENDING` | `POST /v1/payments/orders` | Backend Gateway Service | Restaurant policy is `DEPOSIT_REQUIRED`; hold not expired (`expires_at > NOW()`). | Gateway order mapped; allocation `PAYMENT_PENDING`; payment attempt `INITIATED`. |
| **`HOLD_ACTIVE`** | `EXPIRED` | Expiry Worker / Sweep | System Background Job | `expires_at <= NOW()`; no in-flight payment order. | Booking `EXPIRED`; allocation `RELEASED`; waitlist promotion triggered. |
| **`PAYMENT_PENDING`** | `CONFIRMED` | Webhook / Reconciliation | Verified Gateway Webhook | Valid HMAC SHA256 signature; order matches; payment `CAPTURED`. | Booking `CONFIRMED`; allocation `CONFIRMED`; receipt stored; outbox event dispatched. |
| **`PAYMENT_PENDING`** | `PAYMENT_REVIEW` | Expiry Sweep Worker | System Background Job | `expires_at <= NOW()`; gateway order status indeterminate (e.g. pending bank auth). | Booking `PAYMENT_REVIEW`; allocation `PAYMENT_REVIEW`; scheduled for fast-poll recon. |
| **`PAYMENT_PENDING`** | `PAYMENT_FAILED` | Webhook / Reconciler | Verified Gateway Webhook | Explicit payment failure payload; signature verified. | Booking `PAYMENT_FAILED`; allocation `RELEASED`; table unlocked for waitlist. |
| **`PAYMENT_REVIEW`** | `CONFIRMED` | Reconciliation Worker | Payment Reconciler | Gateway verifies capture; allocation remained safely protected in `PAYMENT_REVIEW`. | Booking `CONFIRMED`; allocation `CONFIRMED`; confirmation SMS/push dispatched. |
| **`PAYMENT_REVIEW`** | `EXPIRED` / `REFUNDED` | Reconciliation Worker | Payment Reconciler | Gateway confirms failure OR capture confirmed but inventory was unrecoverable -> auto-refund. | Booking `EXPIRED`; allocation `RELEASED`; refund attempt queued; audit log emitted. |
| **`CONFIRMED`** | `READY` | `POST /v1/owner/bookings/:id/status` | Restaurant Host / Manager | Booking belongs to staff's restaurant; current time near `requested_start`. | Booking `READY`; allocation `READY`; guest receives "Table Ready" push. |
| **`READY`** | `SEATED` | `POST /v1/owner/bookings/:id/status` | Restaurant Host / Manager | Booking belongs to staff's restaurant; guest physically present. | Booking `SEATED`; allocation `SEATED`; check-in timestamp recorded. |
| **`SEATED`** | `COMPLETED` | `POST /v1/owner/bookings/:id/status` | Restaurant Host / Manager | Guest departs; table reset by staff. | Booking `COMPLETED`; allocation `COMPLETED`; table immediately freed for cleaning. |
| **`CONFIRMED`** | `CANCELLED` | `POST /v1/bookings/:id/cancel` | Customer or Host / Manager | Policy cancellation window satisfied; within lead time limits. | Booking `CANCELLED`; allocation `CANCELLED`; refund calculated per policy; waitlist notified. |
| **`CONFIRMED`** | `NO_SHOW` | `POST /v1/owner/bookings/:id/status` | Restaurant Host / Manager | Guest failed to arrive; grace period (15m) elapsed; restaurant staff trigger. | Booking `NO_SHOW`; allocation `RELEASED`; deposit forfeited per policy; audit log emitted. |

---

## 3. Worked Scenario Walkthroughs

### Scenario 1: Free Reservation Lifecycle
1. **Search**: Customer Alice queries `/v1/restaurants/r1/availability?party_size=2&date=2026-11-10`.
2. **Hold**: Alice requests `/v1/holds` for Table T04 at 19:00 (derived interval 19:00–20:45).
   - Server takes `FOR UPDATE` lock on table T04 row.
   - Evaluates GiST exclusion. No overlap exists.
   - Inserts booking in `HOLD_ACTIVE` and allocation in `HELD`, with `expires_at = NOW() + 5 minutes`.
   - Returns `201 Created` with hold ID and countdown.
3. **Confirm**: Restaurant `r1` has `policy: FREE_RESERVATION`.
   - Alice sends `POST /v1/bookings/:id/confirm` with `Idempotency-Key: k1`.
   - Server validates `expires_at > NOW()`.
   - Transitions booking to `CONFIRMED` and allocation to `CONFIRMED`.
   - Emits outbox event `booking.confirmed`. Alice receives immediate confirmation.
4. **Service**:
   - At 18:55, host marks `READY`. Alice receives push notification.
   - At 19:02, host marks `SEATED`.
   - At 20:30, host marks `COMPLETED`. Allocation is archived; table ready for next slot.

---

### Scenario 2: Deposit Reservation Lifecycle
1. **Hold**: Customer Bob requests `/v1/holds` for Table T01 at 20:00 at fine-dining restaurant `r2` (`policy: DEPOSIT_REQUIRED`, INR 500 deposit).
   - System commits `HOLD_ACTIVE` and `HELD` allocation.
2. **Order Creation**: Bob's client calls `POST /v1/payments/orders` with `Idempotency-Key: k2`.
   - Server validates hold is active, calls Razorpay API to generate order ID `order_xyz`.
   - Inserts `payment_attempts(status: 'INITIATED')`.
   - Transitions booking to `PAYMENT_PENDING` and allocation to `PAYMENT_PENDING`.
3. **Gateway Webhook**:
   - Bob approves UPI prompt on PhonePe. Razorpay sends `payment.captured` webhook.
   - Server receives webhook on `/v1/payments/webhook`, verifies HMAC SHA256 signature against webhook secret.
   - Matches order `order_xyz` in `payment_attempts`. Updates payment to `CAPTURED`.
   - Inside transaction: transitions booking to `CONFIRMED` and allocation to `CONFIRMED`.
   - Emits outbox notification to Bob.

---

### Scenario 3: Customer Cancellation with Refund Logic
1. Bob has a `CONFIRMED` booking at `r2` for tomorrow 20:00 (24h+ in advance).
2. Bob calls `POST /v1/bookings/:id/cancel` with `Idempotency-Key: k3`.
3. Server loads immutable policy snapshot from booking:
   - Cancellation window is >= 24h: 100% deposit eligible for refund.
4. Server transitions booking to `CANCELLED`, allocation to `CANCELLED` (releasing GiST lock).
5. Triggers async refund via payment service (`POST /v1/payments/refunds`), logging `audit_logs` record.
6. System immediately checks waitlist for Table T01 and dispatches exclusive offer to next eligible guest.

---

### Scenario 4: Late UPI Capture at Hold Expiry Boundary
1. **Boundary Condition**: Customer Charlie initiates UPI payment for Table T02 at 19:55. Hold expires at 20:00.
2. At 20:00, the background expiry worker sweeps:
   - Finds booking in `PAYMENT_PENDING` with an active payment order.
   - **Crucial Rule**: Because payment outcome is ambiguous, worker does NOT blindly release table. Instead, it transitions booking and allocation to `PAYMENT_REVIEW`.
   - GiST exclusion constraint remains active; no competing customer can seize the table.
3. At 20:01, Razorpay webhook delivers `payment.captured` (UPI completed late by bank):
   - Webhook processor finds booking in `PAYMENT_REVIEW`.
   - Because allocation was preserved in `PAYMENT_REVIEW`, table is still intact!
   - Booking successfully transitions to `CONFIRMED`. Charlie receives valid booking confirmation.
4. **Alternative Branch (Table Lost)**: If gateway reports payment failure or review window (15m) times out without confirmation, worker marks booking `EXPIRED`, releases allocation to `RELEASED`. If webhook arrives *after* release and table was taken by waitlist, system issues automatic `REFUND` to prevent "paid-without-table" scenario.

---

### Scenario 5: Waitlist Queue Promotion (Exclusive Offer Without Auto-Charge)
1. Table T03 at 19:00 becomes free due to cancellation.
2. Waitlist engine queries `waitlist_entries` for `restaurant_id = r1`, `party_size <= capacity`, `requested_time = 19:00`, `status = 'WAITING'`, ordered by `created_at ASC` (strict FIFO).
3. Selects guest Dana (first in queue).
4. Creates `waitlist_offers` record with `expires_at = NOW() + 60 seconds`.
5. Transitions table allocation to `OFFER_HELD` (locking table exclusively for Dana).
6. Dispatches high-priority push notification and realtime socket hint to Dana's device.
7. Dana opens app and clicks "Accept Table" (`POST /v1/waitlist/offers/:id/accept`).
8. **No Auto-Charge**: System initiates standard confirmation/deposit flow with Dana's explicit consent.
9. If Dana fails to respond within 60s, expiry worker marks offer `EXPIRED`, allocation released from Dana, and creates new offer for the next candidate in line.
