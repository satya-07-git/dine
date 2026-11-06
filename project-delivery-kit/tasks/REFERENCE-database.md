---
id: "database"
title: "Database and integrity map"
---
# Database and integrity map

Source: Blueprint §5–7, §10–11 and §18. These are conceptual fields and implementation requirements, not applied SQL migrations.

## Core relationships

```text
Supabase auth.users → profiles → bookings
profiles → restaurant_memberships ← restaurants
restaurants → floors → floor_plan_versions
floors → restaurant_tables → table_allocations ← bookings
restaurants → opening_hours / special_closures / table_blocks
bookings → payment_attempts → payment_events / refunds
bookings → booking_status_events / outbox_events
profiles + restaurant/table + interval → waitlist_entries → waitlist_offers
waitlist_offers → exclusive OFFER_HELD allocation
outbox_events → notification_deliveries
critical actions → audit_logs
```

Exact foreign-key shapes for events, blocks and offers must be defined in SQL. Verify restaurant consistency across booking, floor/table and offer; individual foreign keys alone do not automatically prove matching restaurant ownership.

## Source table catalog

| Domain | Tables / intended fields | Integrity and owner |
| --- | --- | --- |
| Identity | profiles(id/auth_uid) | Stable identity; EPIC-003 |
| Access | restaurant_memberships(restaurant_id,user_id,role,status) | Unique membership and restaurant scope; EPIC-003 |
| Restaurant | restaurants(id,location geography(Point,4326),timezone,policy_id) | Valid location/timezone and policy reference; EPIC-004 |
| Calendar | opening_hours; special_closures | Local operating interval and exception rules; EPIC-004 |
| Cuisine | cuisines; restaurant_cuisines | Unique associations/FKs; EPIC-004/005 |
| Floor | floors(id,restaurant_id) | Restaurant ownership; EPIC-006 |
| Layout | floor_plan_versions(id,floor_id,version) | Optimistic version guard; EPIC-006 |
| Physical tables | restaurant_tables(id,floor_id,capacity,zone,x,y,w,h,active) | Positive capacity, geometry checks and safe retirement; EPIC-006 |
| Blocks | table_blocks | Protected maintenance/private event/closure interval; EPIC-007/014 |
| Booking | bookings(id,user_id,restaurant_id,party_size,requested_start,status) | User/restaurant consistency and guarded transitions; EPIC-008/009 |
| Allocation | table_allocations(id,table_id,booking_id,dining_period,status,expires_at) | Nonempty tstzrange and no protected overlap; EPIC-008 |
| Checkout | payment_attempts(id,booking_id,gateway_order_id,amount_minor,currency,status) | Unique gateway order, positive integer minor amount for deposits; EPIC-010 |
| Gateway inbox | payment_events(gateway_event_id,payload,status) | Unique provider event and durable verified receipt; EPIC-010 |
| Refund | refunds | Unique logical/provider mappings and guarded retry states; EPIC-011 |
| Queue | waitlist_entries | Unique active equivalent entry, stable FIFO sequence; EPIC-012 |
| Offer | waitlist_offers | Exclusive active offer + protected allocation + deadline; EPIC-012 |
| Status history | booking_status_events | Append-only events with sequence; EPIC-009/013 |
| Outbox | outbox_events | Same commit as business state, retry/claim metadata; EPIC-013 |
| Notification | notification_deliveries | Event/recipient/channel dedup and attempts; EPIC-013 |
| Retry safety | idempotency_records | Unique principal + endpoint + key and payload hash; EPIC-008 |
| Evidence | audit_logs | Immutable actor, resource, reason and correlation; EPIC-017 |

Menu/media, package, favorites/review/preferences, policy snapshots and check-in token field-level schemas are not specified fully by the source. Their epics explicitly require reviewed contracts before adding migrations.

## Authoritative overlap constraint

The following reproduces the source's schematic constraint. It is not a complete migration: table definitions, enums, foreign keys and extensions must be validated together.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE table_allocations
  ADD CONSTRAINT no_protected_table_overlap
  EXCLUDE USING gist (
    table_id WITH =,
    dining_period WITH &&
  ) WHERE (status IN (
    'HELD', 'OFFER_HELD', 'PAYMENT_PENDING',
    'PAYMENT_REVIEW', 'CONFIRMED', 'READY',
    'SEATED', 'COMPLETED'
  ));
```

COMPLETED remains range-protected in the source schematic. Its historical interval does not block unrelated future ranges. Early release/shortening would require an explicit policy and transactional design; do not silently omit it from the source invariant.

## Expiry is an explicit transition

expires_at passing does not remove a protected row from a GiST exclusion constraint. Do not use now() in a partial-index predicate as pretend automatic expiry. A request/worker must lock inventory, establish that release is safe and transition state in a transaction. PAYMENT_PENDING/PAYMENT_REVIEW cannot be released just because a local countdown finished.

## Interval rules

- PostgreSQL timestamptz stores canonical instants; restaurant timezone interprets local input and hours.
- dining_period includes duration plus cleanup buffer.
- Use an agreed [start,end) contract and test adjacency; zero/negative intervals are invalid.
- Availability must respect table blocks and closures as well as protected allocations.
- One physical table per booking is the initial policy; any future joined-table implementation needs ordered multi-row locking.

## Database enforcement and indexes

- Unique gateway IDs, external order mappings, idempotency scope and memberships.
- Foreign keys for table → floor → restaurant and booking → customer/restaurant.
- CHECK constraints for positive capacities/deposits and nonempty ranges.
- GiST overlap constraint is the final safety net even if application checks appear free.
- Deterministic table-row locking coordinates holds, walk-ins, blocks and offers.
- PostGIS location index, tenant/time booking indexes and bounded pending-worker indexes require query-plan validation.
- RLS protects client-reachable private tables; elevated server credentials still require scoped application authorization.

## Migration rule

supabase/migrations is the single schema evolution authority. Drizzle types/queries must not create a parallel independent migration history. Replay every migration on a clean database in CI; record forward recovery/backfill strategy before production change. No SQL migrations are delivered or claimed applied in this planning kit.
