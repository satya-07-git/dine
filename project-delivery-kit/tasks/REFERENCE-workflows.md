---
id: "workflows"
title: "Finalized state machines and recovery workflows"
---
# Finalized booking and recovery workflows

Sources: PRD §5–7/10/12/13; SQL supplement §3–5; realtime supplement §7–10; Diagrams 2/4. All flows describe target behavior, not tests executed in this planning task.

## 1 · Manual and automatic selection converge

```text
Restaurant + startsAt + party size
  → Manual: customer chooses compatible physical table
  → Automatic: backend ranks eligible tables deterministically
      ↓ same engine
  Atomic hold transaction
      ├─ conflict → 409, no allocation
      └─ valid hold → FREE or DEPOSIT policy branch
```

Manual choice is exact; do not silently substitute another table. Automatic recommendation is advisory until a claim commits; bounded retry may try the next eligible candidate under an explicit automatic-selection contract.

## 2 · Deterministic recommendation

S = 0.40C + 0.25P + 0.20L + 0.15O, each component normalized 0–100.

C = capacity fit; P = preference match; L = seating location suitability; O = restaurant operational efficiency. Filter mandatory capacity/hours/active-claim/block eligibility before scoring. Define component formulas, missing-input defaults, tie-break and retry budget. Weights are initial assumptions, not validated conversion or optimization results. No ML is required.

## 3 · Atomic hold and expiry protocol

```text
BEGIN
  Resolve actor + idempotency operation/key/hash
  SELECT matching active physical table FOR UPDATE
  Confirm row exists and belongs to requested restaurant
  Capture fixed database clock_timestamp() AFTER lock acquisition
  Transition expired HELD claims → RELEASED
  Transition associated active holds → EXPIRED
  Revalidate policy, capacity, operating calendar, blocks and overlap
  Insert inventory_claim HELD with effective [start, diningEnd+buffer)
  Insert reservation_hold ACTIVE with configured expiry (initial 120s)
  Persist original replay result + audit + outbox
COMMIT
Return holdId, expiresAt, serverTime and server-owned payment policy
```

Keep transaction short. PostgreSQL exclusion is the last guard, including every block and staff writer. Cron improves freshness; request-time serialized cleanup means correctness does not depend on an exact worker tick. SQLSTATE 23P01 maps to conflict. No external provider HTTP call holds the table lock.

## 4 · Separate state machines

| Domain | State vocabulary / examples |
| --- | --- |
| Claim | HELD → RESERVED or RELEASED; BLOCKED → RELEASED |
| Hold | ACTIVE → CONSUMED, EXPIRED or RELEASED |
| Reservation | PENDING_PAYMENT → CONFIRMED → CHECKED_IN → SEATED → COMPLETED; eligible CANCELLED/NO_SHOW/EXPIRED paths |
| Payment | CREATED/PENDING → verified SUCCEEDED or FAILED; refund workflow remains separate |
| Financial recovery | Durable unresolved/retrying/escalated/terminal work; exact contract to design, not PAYMENT_REVIEW inventory ownership |

PRD includes REFUND_FAILED and supplied SQL includes PARTIALLY_REFUNDED. Implement an explicit combined mapping and legal transitions; do not drop failed or partial monetary outcomes. Full no-show/cancellation/completion release/remaining-buffer rules still need policy definition.

## 5 · Free reservation

```text
Own ACTIVE hold + restaurant FREE policy snapshot
  → acquire same physical table lock
  → verify hold/claim/owner/expiry and no state mismatch
  → claim HELD → RESERVED
  → hold ACTIVE → CONSUMED
  → one reservation CONFIRMED + unique booking_reference
  → history + audit + version + outbox in same commit
```

Repeated free confirmation returns the same logical reservation. DEPOSIT venues cannot use this path to bypass payment. Expired holds are not eligible for normal confirmation.

## 6 · Deposit reservation and verified outcome

```text
Own valid hold + server snapshot DEPOSIT/amount/currency
  → persist payment/order operation identity
  → call Razorpay outside inventory lock; recover unknown order creation
  → verified raw-body inbox and/or server gateway verification
      ├─ verified success + current valid owned claim
      │    → short table-lock transaction → confirm once
      ├─ verified failure → safe release/expiry state updates
      └─ pending/unknown → durable financial reconciliation
```

A payment attempt never silently extends the initial 120-second hold. Client redirect is not proof. Verified money and reservation confirmation are separate states. Compare order association, amount, currency, payment status and applicable capture state before finalization.

## 7 · Hold expiry during payment and late capture

| Scenario | Inventory | Financial state / action |
| --- | --- | --- |
| Hold deadline passes | Serialized HELD → RELEASED and hold → EXPIRED | Unknown payment remains unresolved, not automatically failed |
| Another customer B acquires same interval | B keeps sole valid claim | A continues reconciliation |
| Capture for A arrives after expiry/reallocation | Do not normally confirm expired hold or reclaim B | Record verified capture; refund or explicitly authorized alternative |
| Server crashes after capture before confirm | Recheck persisted claim/hold/version at recovery | Confirm only if still valid, otherwise recovery/refund |
| Provider stays unknown through retry budget | No implicit indefinite inventory lease | Visible escalation; every money operation remains tracked to terminal resolution |

A future controlled payment-processing lease must be designed explicitly with duration and gateway timeout/expiry policy. It is not part of the current implicit hold behavior.

## 8 · Durable outbox to authorized Socket.IO

```text
Committed reservation/claim transition + event/version + outbox
  → recoverable outbox worker / BullMQ
  → Socket.IO gateway
      restaurant:{id}  = authorized availability audience, no private PII
      booking:{id}     = authorized owner/staff booking state
  → eventId, eventType, entityId, version, timestamp, payload
```

Available source event names: table.availability.changed, hold.created, hold.expired, booking.confirmed, booking.cancelled, booking.checked_in, booking.seated, booking.completed. Read private subscription authorization from verified identity and resource ownership, not a client-provided room string.

## 9 · Reconnect and database-backed recovery

Authenticate socket → authorize room join → fetch canonical REST snapshot → optionally recover retained events/cursor → deduplicate event IDs and ignore versions older than the snapshot → detect gaps and resync. The exact snapshot/subscription/replay ordering must avoid missing an update during reconnect. If cursor is outside retained history, require a full snapshot. Room/fan-out delivery is not guaranteed and never grants ownership.

## 10 · Restaurant operations and external booking boundary

Staff lists arrivals and records CHECKED_IN → SEATED → COMPLETED through authorized state transitions. A maintenance block creates a BLOCKED claim under the same lock/exclusion, so an existing overlapping reservation causes conflict or explicit audited resolution. Walk-ins/phone/external reservations require recording through Dine; disconnected external systems are not automatically covered. No silent customer cancellation to fit a staff block.

## 11 · Risk-driven execution and time guidance

First implementation milestone: authoritative migrations + transactional inventory service + hold API + real PostgreSQL concurrency test. Do not begin with payments or mobile floor-plan animation.

Source delivery estimate is 8–12 weeks for one experienced focused full-stack developer, controlled pilot and limited design changes. It is not a commitment or measured schedule. Phase guidance: week 1 foundation/DB; week 2 venue/floor; weeks 3–4 claims/holds/free booking; weeks 5–6 money/recovery; week 7 realtime/operations; weeks 8–9 future client integration; weeks 10–12 hardening/pilot. Backend work and frontend integration are explicitly separated in this request.
