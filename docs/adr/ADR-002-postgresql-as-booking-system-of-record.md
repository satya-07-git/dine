# ADR-002: PostgreSQL as Booking System of Record

## Status
**Approved** (06 November 2026)

## Context
Dine requires a single, authoritative persistence engine for restaurant metadata, table geometry, time-range availability, atomic holds, payment audits, and queue state. Mobile clients, push notifications, and background workers must never be treated as authoritative sources of truth for booking or payment status.

## Decision Drivers
- **Non-Overlapping Allocation Invariant**: Physical tables must never be booked concurrently for overlapping time ranges.
- **Temporal & Spatial Queries**: Time-range calculations (`tstzrange`) and geospatial discovery (`geography(Point, 4326)` for nearby restaurants).
- **Auditability & Integrity**: Foreign keys, check constraints, unique constraints, and append-only audit histories.
- **Tooling Consistency**: Drizzle ORM for typed queries and transactions, with raw SQL migrations in `supabase/migrations` as the sole migration authority.

## Decision Outcome
Adopt **PostgreSQL with PostGIS and btree_gist extensions** (hosted via Supabase) as the sole system of record for all booking and transactional data.

### Technical Specifications
1. **Exclusion Constraints**: Use `btree_gist` to enforce `EXCLUDE USING gist (table_id WITH =, dining_period WITH &&)` over protected allocation states (`HELD`, `OFFER_HELD`, `PAYMENT_PENDING`, `PAYMENT_REVIEW`, `CONFIRMED`, `READY`, `SEATED`, `COMPLETED`).
2. **Explicit Table Row Locks**: Execute `SELECT ... FOR UPDATE` on physical table rows inside the hold transaction to serialize concurrent evaluation safely.
3. **UTC Timestamps**: All temporal values stored as `timestamptz` in UTC. Timezone offsets are applied strictly per restaurant for business-hour checks.
4. **Single Migration Authority**: All schema alterations are authored exclusively via versioned SQL scripts in `supabase/migrations`. Drizzle is used for typed query generation and repository mapping only, not schema management.
5. **Server Authoritative**: Client UI state, mobile countdown timers, and gateway redirects are informational only; only committed PostgreSQL rows confirm booking status.

## Consequences
### Positive
- Kernel-level enforcement of concurrency invariants prevents double-booking even under extreme race conditions.
- Native `tstzrange` handles continuous time comparisons including duration and turnover buffer.
- Robust PostGIS spatial index (`ST_DWithin`, spatial GiST index) supports fast location-based search.

### Negative / Tradeoffs
- Requires careful handling of connection pools (e.g. Supavisor/pgBouncer in transaction mode).
- Expired holds must be proactively or reactively updated because passive timestamp expiry does not drop GiST exclusion rows automatically.

## Source Traceability
- Dine Blueprint §2.3 (Stack decisions)
- Dine Blueprint §5.1, §5.2, §5.3, §5.4 (Database and integrity)
- Dine Blueprint §7 (Atomic hold engine)
- Dine Blueprint §19.3 (ADR-002)
