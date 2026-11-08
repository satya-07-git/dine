# Finalized V2 Contracts, Claims and Compatibility

**Document Version:** 2.0  
**Status:** Approved & Verified Architecture Specification  
**Baseline Date:** 08 November 2026  
**Owning Epic:** [EPIC-021](../../project-delivery-kit/tasks/EPIC-021-finalized-v2-contracts-claims-and-compatibility.md)  
**Dependencies:** EPIC-001, EPIC-002, EPIC-004, EPIC-007, EPIC-008, EPIC-009, EPIC-010, EPIC-011, EPIC-017  

---

## 1. Executive Summary & Source Precedence

This specification establishes the authoritative contracts, concurrency controls, claim-based database rules, REST catalog, and financial reconciliation workflows for the Dine Backend Platform under the user-finalized **v2.0** architecture baseline.

### 1.1 Source Hierarchy and Precedence Rules
1. **Current User Finalization (v2.0)**: Manual + automatic selection both active, FREE and configured DEPOSIT modes, PostgreSQL authoritative inventory ownership, 120-second default hold expiry, NestJS modular monolith, Socket.IO authorized rooms with database-backed recovery, and internal inventory guarantees.
2. **Finalized Technical Supplements**: `finalized-sql-and-api.txt` and `finalized-realtime-and-delivery.txt`.
3. **Pasted Base PRD**: Preserved in `sources/PRD-as-supplied-v1.md`; header reads v1.0, and retain original FR/BR/C IDs unless superseded.
4. **Historical 06 November Blueprints & Completion Reports**: Maintained under `project-delivery-kit/archive/pre-prd-v2-2026-11-08/` for audit and provenance without resetting completed milestones.

### 1.2 Cryptographic Source Provenance (SHA-256)
Every foundational text source and architectural diagram is indexed with SHA-256 hashes to guarantee provenance:

| Artifact | Relative Path | SHA-256 Digest | Role |
| :--- | :--- | :--- | :--- |
| **PRD Base v1** | `sources/PRD-as-supplied-v1.md` | `52b59f12d923ee4cafc26fb8fb821957f210c36af1274754903362cfef9f224a` | Functional requirements |
| **Realtime Spec** | `sources/finalized-realtime-and-delivery.txt` | `329d712d5d482163b2dfccd62bd6e184480a87cb12e9ecf2193fd0f37dfe5288` | Socket.IO & event delivery |
| **SQL & API Spec**| `sources/finalized-sql-and-api.txt` | `7f9aaac565a0d77a80daca0868e645b6af5ee4262daeae2a6a7ea9eac4bdbf87` | Schema, locks, REST catalog |
| **Diagram 1** | `assets/production-architecture.png` | `513a594cfefe6fae80e536d91830d5d9c9e69bfc887a9b303fd4498834c4f4b3` | System topology |
| **Diagram 2** | `assets/reservation-lifecycle.png` | `fabb3a9eee063de34e6563a47b2ee85b95e2e06e421b088d70ad7ac6613e0b21` | Lifecycle state convergence |
| **Diagram 3** | `assets/production-erd.png` | `edbc00eb6d9a61ca174529ab430a48815d84eb51311e1319d05357b7e2493319` | Entity-relationship model |
| **Diagram 4** | `assets/realtime-sequence.png` | `08b21948bb474d36104cb3cc76d5ef1860d4cd8a18281db06050fc44e4af5b73` | Outbox & client recovery |

---

## 2. Canonical REST API Catalog & Compatibility Mapping

The finalized API catalog standardizes all routes under `/api/v1`. Legacy `/v1` endpoints are mapped as backward-compatible aliases with deprecation notices.

### 2.1 Canonical Route Catalog (23 Canonical Endpoints)
| Method | Canonical Route | Responsibility | Owning Epic | Legacy Alias |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/otp/request` | Request phone OTP challenge | EPIC-022 | `/v1/auth/otp/request` |
| `POST` | `/api/v1/auth/otp/verify` | Verify identity & issue session | EPIC-022 | `/v1/auth/otp/verify` |
| `POST` | `/api/v1/auth/logout` | Session revocation & logout | EPIC-022 | `/v1/auth/logout` |
| `GET` | `/api/v1/restaurants` | Bounded restaurant discovery | EPIC-005 | `/v1/restaurants` |
| `GET` | `/api/v1/restaurants/:id` | Published profile & policies | EPIC-004 | `/v1/restaurants/:id` |
| `GET` | `/api/v1/restaurants/:id/floor-plan` | Versioned floor plan & tables | EPIC-006 | `/v1/restaurants/:id/floor-plan` |
| `GET` | `/api/v1/restaurants/:id/availability` | Interval capacity & claims | EPIC-007 | `/v1/availability` |
| `POST` | `/api/v1/recommendations/tables` | Deterministic table ranking | EPIC-023 | `/v1/recommendations` |
| `POST` | `/api/v1/holds` | Acquire exclusive 120s hold | EPIC-008 / 021 | `/v1/booking-holds` |
| `GET` | `/api/v1/holds/:id` | Inspect own hold & expiry | EPIC-008 / 021 | `/v1/booking-holds/:id` |
| `DELETE`| `/api/v1/holds/:id` | Safely release owned hold | EPIC-008 / 021 | `/v1/booking-holds/:id` |
| `POST` | `/api/v1/reservations/free` | Confirm FREE-mode hold | EPIC-009 / 021 | `/v1/bookings/free` |
| `POST` | `/api/v1/payments/orders` | Initiate/reuse Razorpay order | EPIC-010 / 021 | `/v1/payments/orders` |
| `POST` | `/api/v1/payments/verify` | Verify gateway payment | EPIC-010 / 021 | `/v1/payments/verify` |
| `POST` | `/api/v1/webhooks/razorpay` | Raw-body signed webhook inbox | EPIC-010 / 021 | `/v1/webhooks/razorpay` |
| `GET` | `/api/v1/bookings/:id` | Authoritative status & recovery | EPIC-009 / 021 | `/v1/bookings/:id` |
| `GET` | `/api/v1/bookings` | Customer booking history | EPIC-009 / 021 | `/v1/bookings` |
| `POST` | `/api/v1/bookings/:id/cancel` | Policy-checked cancellation | EPIC-009 / 021 | `/v1/bookings/:id/cancel` |
| `GET` | `/api/v1/restaurant-ops/reservations` | Staff reservation list | EPIC-014 | `/v1/owner/reservations` |
| `POST` | `/api/v1/restaurant-ops/bookings/:id/check-in`| Staff arrival recording | EPIC-014 | `/v1/owner/check-in` |
| `POST` | `/api/v1/restaurant-ops/bookings/:id/seat` | Staff seating recording | EPIC-014 | `/v1/owner/seat` |
| `POST` | `/api/v1/restaurant-ops/bookings/:id/complete`| Staff visit completion | EPIC-014 | `/v1/owner/complete` |
| `POST` | `/api/v1/restaurant-ops/table-blocks` | Operational table block | EPIC-014 | `/v1/owner/blocks` |

---

## 3. Single Migration Authority & Additive Schema Upgrade

### 3.1 Migration Authority ADR
- **Sole Migration Authority**: `supabase/migrations/` remains the single authoritative schema evolution history for the Dine repository. Dual migration histories (e.g. running Prisma/Drizzle beside raw migrations) are prohibited.
- **Additive Evolution**: Existing data and verified historical allocations in `table_allocations` are mapped to `inventory_claims` without destructive dropping or resetting.
- **Extensions**: `btree_gist` and `pgcrypto` are mandatory for GiST exclusion constraints and UUID generation.

### 3.2 Four Core Domain Entities & Relationships
1. **Physical Table (`restaurant_tables`)**: Durable restaurant asset with stable UUID, label, and min/max capacity.
2. **Inventory Claim (`inventory_claims`)**: Authoritative exclusive right over `[starts_at, ends_at)` half-open interval. States: `HELD`, `RESERVED`, `BLOCKED`, `RELEASED`.
3. **Reservation Hold (`reservation_holds`)**: Temporary customer checkout hold pointing to a claim with strict 120-second default expiry. States: `ACTIVE`, `CONSUMED`, `EXPIRED`, `RELEASED`.
4. **Reservation (`reservations`)**: Legal dining contract with customer-visible dining interval, unique `booking_reference`, payment mode (`FREE`/`DEPOSIT`), and status history.

### 3.3 Active Claim Exclusion Invariant
```sql
ALTER TABLE inventory_claims
ADD CONSTRAINT no_overlapping_active_claims
EXCLUDE USING gist (
  table_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (state IN ('HELD','RESERVED','BLOCKED'));
```
- Exclusion applies strictly to active states `HELD`, `RESERVED`, and `BLOCKED`.
- `RELEASED` claims are excluded from the constraint, permitting immediately adjacent or newly allocated intervals.
- `starts_at` and `ends_at` in `inventory_claims` represent the **effective interval** (dining duration + restaurant turnover buffer, e.g. 90m + 15m = 105m). The customer-visible reservation time is stored separately in `reservations.ends_at`.

---

## 4. Atomic Locking, Post-Lock Decision Clock & Expiry Protocol

### 4.1 Locking Strategy & Transaction Sequence
1. **Serialize Table**: Acquire row lock via `SELECT id FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2 AND operational_status = 'ACTIVE' FOR UPDATE`.
2. **Post-Lock Decision Clock**: Capture `clock_timestamp()` **after** acquiring the table row lock. Lock wait duration never consumes hold validity or causes stale comparisons.
3. **Serialized Stale Expiry Cleanup**: In the same transaction before evaluating new claims, transition any expired `HELD` claims on that physical table to `RELEASED`, and their corresponding holds to `EXPIRED`.
4. **Validation & Exclusion Check**: Re-evaluate capacity, hours, and remaining claims.
5. **Atomic Claim & Hold Insertion**: Insert `inventory_claims` (`HELD`) and `reservation_holds` (`ACTIVE`).
6. **Audit & Idempotency**: Persist idempotency record (`actor_id`, `operation`, `idempotency_key`, `request_hash`) and outbox event before `COMMIT`.

### 4.2 Idempotency Contract
- **Same Actor + Key + Request Hash**: Returns identical replayed response.
- **Same Actor + Key + Mismatched Payload**: Deterministically rejected with HTTP 409 `IDEMPOTENCY_BODY_MISMATCH`.

---

## 5. State Transition Matrices & Convergence

### 5.1 Domain State Machines
```
[ Claim States ]
  HELD  ───────────────► RESERVED (Free confirm / Deposit captured)
   │                           │
   ▼                           ▼
  RELEASED (Expired/Cancelled) RELEASED (Completed/Cancelled)
  
  BLOCKED ─────────────► RELEASED (Operational block removed)

[ Hold States ]
  ACTIVE ──────────────► CONSUMED (Booking confirmed)
   │
   ├───────────────────► EXPIRED  (120s deadline exceeded)
   ▼
  RELEASED (Customer explicit cancel)

[ Reservation States ]
  PENDING_PAYMENT ─────► CONFIRMED ───► CHECKED_IN ───► SEATED ───► COMPLETED
                             │
                             ├────────► CANCELLED
                             └────────► NO_SHOW
```

### 5.2 Late Payments, Reconciliation and Customer B Protection
When a customer pays via gateway after their 120-second hold has expired and the table has been reallocated to Customer B:
1. **Customer B Protection Invariant**: Customer B retains the exclusive inventory claim and valid confirmation. Under no circumstance is inventory stolen from Customer B.
2. **No Invalid Confirmation**: The expired hold for Customer A is never confirmed.
3. **Financial Reconciliation**: The verified capture for Customer A is persisted in `payment_reconciliations` with full audit logs and triggers an automated refund or authorized commercial alternative.
4. **No Abandonment**: Bounded retries and support escalation ensure zero unresolved customer funds.

---

## 6. Concurrency & Acceptance Matrix (C-001 through C-006)

| Scenario | Condition | Verified Invariant | Result |
| :--- | :--- | :--- | :--- |
| **C-001** | 100 simultaneous requests for same table/time | Exactly 1 winner acquires active claim; 99 receive 409 TABLE_UNAVAILABLE | **PASSED** |
| **C-002** | Two non-overlapping adjacent requests | `[18:00, 19:45)` and `[19:45, 21:30)` both succeed with buffer | **PASSED** |
| **C-003** | Late payment capture after expiry & reallocation | Customer B allocation preserved; Customer A automatically refunded | **PASSED** |
| **C-004** | Triple duplicate webhook delivery | Inbox idempotency ensures exactly 1 confirmation; no duplicate side-effects | **PASSED** |
| **C-005** | Server crash after payment capture before booking | Recovery job detects captured payment, confirms valid hold or refunds | **PASSED** |
| **C-006** | Conflicting staff operational block & customer hold | Handled under same table row lock; exclusion constraint prevents overlap | **PASSED** |
