---
id: "database"
title: "PostgreSQL claim model and schema review"
---
# PostgreSQL claim model and schema review

Sources: PRD §9–10, supplied SQL §3.2–5 and Diagram 3. The original SQL is preserved unchanged in sources/finalized-sql-and-api.txt. It is a migration baseline and transaction skeleton, not proof of an applied production schema.

## Separate four concepts

- Physical table: durable restaurant asset with stable identity and capacity.
- Hold: customer checkout opportunity with an explicit expiry and owner.
- Reservation: customer booking/service transaction with unique booking reference.
- Inventory claim: exclusive physical table/time right. Both manual and automatic selection, holds, reservations and operational blocks use it.

## ERD relationships

```text
users → restaurant_staff ← restaurants
restaurants → floor_plans → restaurant_tables
restaurants → booking_policies
restaurant_tables → inventory_claims
users → reservation_holds → inventory_claims
users → reservations → inventory_claims
reservation_holds → reservations
reservations → payments → payment_events / refunds
reservations → reservation_events
restaurants / aggregate → outbox_events
restaurant_tables → table_blocks → BLOCKED inventory claim
```

Some relationships above appear in PRD/ERD but are missing from the pasted SQL table definitions. They are explicitly tracked as additions, not claimed enforced by the supplied script.

## Supplied SQL table inventory

| Table | Fields / constraints provided | Delivery owner |
| --- | --- | --- |
| users | UUID, unique nonnull phone, name, created_at | 022 |
| restaurants | UUID, name, timezone default Asia/Kolkata, ACTIVE/SUSPENDED | 003–004 |
| floor_plans | restaurant FK, version, name, is_active; UNIQUE(id,restaurant_id); one active plan per restaurant | 006 |
| restaurant_tables | restaurant, composite floor FK, unique restaurant label, min/max capacity, x/y, ACTIVE/INACTIVE | 006 |
| booking_policies | restaurant PK, FREE/DEPOSIT, amount_paise, hold_seconds default 120 / range 30–900, duration 90, buffer 15 | 004 |
| inventory_claims | restaurant/table composite FK, starts_at/ends_at, HELD/RESERVED/BLOCKED/RELEASED, expiry required for HELD | 008 |
| reservation_holds | unique claim_id, composite claim FK, user, party size, expiry, ACTIVE/CONSUMED/EXPIRED/RELEASED | 008 |
| reservations | unique booking_reference/hold_id/claim_id, composite table/hold/claim FKs, user, visible starts_at/ends_at, status, policy mode/amount | 009 |
| payments | reservation FK, unique gateway order/payment IDs, positive amount_paise, currency and payment status | 010–011 |
| payment_events | unique gateway_event_id, optional payment FK, type, payload, processed_at, received_at | 010 |
| refunds | payment FK, unique gateway refund ID, positive amount_paise, status | 011 |
| idempotency_records | actor, operation, key, request hash, response, status; UNIQUE(actor,operation,key) | 008 |
| outbox_events | restaurant/aggregate/event type/payload/timestamps; unpublished index | 013 |

## Active claim exclusion

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE inventory_claims
ADD CONSTRAINT no_overlapping_active_claims
EXCLUDE USING gist (
  table_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (state IN ('HELD','RESERVED','BLOCKED'));
```

The inactive state is RELEASED. Expiry timestamps do not automatically remove HELD rows from this constraint. Use a serialized transaction to update expired claim/hold states before reuse. No moving NOW() condition belongs in the exclusion predicate.

## Time and lifecycle mapping

| Record | State / time meaning |
| --- | --- |
| inventory_claims | HELD → RESERVED or RELEASED; BLOCKED → RELEASED; protects effective range including buffer |
| reservation_holds | ACTIVE → CONSUMED, EXPIRED or RELEASED; initial expiry after configured 120 seconds |
| reservations | PENDING_PAYMENT, CONFIRMED, CHECKED_IN, SEATED, COMPLETED, CANCELLED, EXPIRED, NO_SHOW; customer-visible dining times |
| payments | CREATED/PENDING/SUCCEEDED/FAILED plus refund states; separate from booking truth |
| reconciliation | Explicit durable recovery state/work item; not an invented PAYMENT_REVIEW booking/claim enum |

Capture a fixed database clock_timestamp() after acquiring the physical table lock; use it consistently for that transaction's expiry decision. Store timezone-aware canonical instants; interpret local scheduling with restaurant timezone. A customer's duration/end input cannot override policy.

## Controls still required before production

| Gap / source inconsistency | Required handling | Epic |
| --- | --- | --- |
| restaurant_staff, table_blocks, reservation_events appear in PRD/ERD but not supplied CREATE TABLE list | Add explicit schema/permissions and associations | 003, 014–013 |
| A hold can reference one claim while reservation.claim_id could otherwise point to another | Enforce same claim/hold/table/restaurant/user relationship transactionally and/or with reviewed constraints/triggers | 008, 009 |
| Claim effective interval differs from visible reservation end | Validate exact start and policy-derived buffer/end mapping, not naive equality of all end times | 008–007 |
| Hold and claim expiry duplicated | Maintain expiry/owner/state consistency through controlled writers | 008–008 |
| HELD one-to-one active hold / RESERVED reservation / BLOCKED authorized block | Define all association/state invariants, including transition/release semantics | 008, 009, 014 |
| Refund failure missing in SQL but named in PRD; partial refund named only in SQL | Adopt explicit compatible state mapping and migrations; do not lose either financial outcome | 011 |
| refunds.status unconstrained / aggregate refund amount bounds absent | Define legal states, idempotency and no over-refund invariant | 011 |
| Auth sessions, audit, calendars and full policy history absent | Separate production migrations; do not treat core SQL as complete app schema | 022, 004, 017 |
| outbox has no version/claim lease/retry/replay retention | Add dispatch coordination and durable recovery contract | 013, 024 |
| Existing tables/migrations use older model | Additive mapping/backfill and invariant verification; one migration authority | 021–002, 008 |

Inventory-critical tables must be writable only through controlled application services/least-privilege roles. The supplied baseline does not implement all those permissions/triggers by itself.

## Expiry and unresolved payment

The finalized MVP does not silently extend a two-minute hold during payment. Expired HELD inventory is released transactionally even when financial status remains unknown. This does not classify the money as failed: reconciliation persists until verified outcome. Late capture after release cannot confirm the expired hold or reclaim a new guest claim. Any future payment-processing lease needs a new explicit bounded policy.
