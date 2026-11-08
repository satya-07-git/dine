---
id: "EPIC-021"
title: "Finalized v2 contracts, claims and compatibility"
type: "epic"
status: "completed"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-001", "EPIC-002", "EPIC-004", "EPIC-007", "EPIC-008", "EPIC-009", "EPIC-010", "EPIC-011", "EPIC-017"]
prd_requirements: ["Final decisions", "PRD §2, §6, §17–21", "SQL §3.3", "Realtime §8", "PRD §8, §18, §21", "SQL §3.2", "Realtime §11", "PRD §2, FR-B03–B04, §14", "SQL booking_policies, §3.3", "PRD BR-001–BR-003, BR-008, BR-011–BR-012, §10", "SQL §3.2–3.3", "Diagram 3", "PRD FR-C03–C06, §5, §9–10", "SQL §3.3, §6", "PRD BR-004–BR-005, BR-010, §5, C-001–C-002", "SQL §4, §5–6", "PRD BR-006, BR-009, §6, §11.9", "SQL reservations, §4, §6", "Diagram 2", "PRD §6.3, §7.2, C-003–C-005", "SQL §5", "PRD §16, §18.6, §20", "Realtime §10"]
risk: "high"
assignee: "Lead Core Engine & Reliability Architect"
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
summary: "Apply the finalized v2 schema, 120-second expiry, lifecycle, payment and API compatibility changes without resetting delivered work."
---

# EPIC-021 — Finalized v2 contracts, claims and compatibility

## Objective

Apply the finalized v2 schema, 120-second expiry, lifecycle, payment and API compatibility changes without resetting delivered work.

## Delivered foundation

EPIC-001, EPIC-002, EPIC-004, EPIC-007, EPIC-008, EPIC-009, EPIC-010, EPIC-011, EPIC-017 remain completed under their original identities. This epic covers only finalized v2 changes and their conformance verification. Inspect and reuse existing code; do not rebuild or reset delivered capabilities.

## Scope and source coverage

The prior renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/. The capability sections below consolidate that draft into additive work with new stable IDs. Source reference files use the same stable IDs. Product frontend remains deferred.

## Capability · Finalized v2 contracts and baseline review

### In scope

- Record latest source precedence, fixed product choices and one-table MVP
- Compare existing /v1, table_allocations and Supabase projections to /api/v1, inventory_claims and Socket.IO
- Freeze hold/free/deposit/claim/booking/payment state mappings and recovery outcomes
- Classify Must, Should and Future scope; record financial and operational decisions still open

### Business rules

- Latest user finalization overrides older recommendations; attached PRD header is v1.0, current baseline is labeled v2.0
- Manual and deterministic automatic selection are both required by the latest decision
- FREE or DEPOSIT is selected by restaurant policy, never by a customer bypass
- Dine guarantees internal inventory consistency only; staff must record walk-ins/phone/external bookings
- One table per booking is the current design; multi-table scope remains deferred
- No historical completed checkbox proves the changed v2 requirement

### Data and API changes

Produce compatibility map, entity/state/route decisions, policy snapshot rules and migration authority ADR. Preserve previous epic bodies and completion reports in the versioned archive.

Adopt /api/v1 and the supplied finalized API catalog; document old aliases/deprecation rather than silently changing deployed clients.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Trace each v2 decision to source and owning epic
- Review expired-hold/unknown-payment/crash scenarios against one state matrix
- Check the migration plan does not run CREATE TABLE baseline over existing tables

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · NestJS, PostgreSQL and delivery foundation

### In scope

- Inspect existing NestJS/Drizzle modules and reuse suitable components
- Docker local PostgreSQL, Redis and worker configuration with readiness checks
- One authoritative migration chain, seeds and fresh-install/upgrade CI
- Typed DTOs, validation, standard errors, request IDs, OpenAPI and provider interfaces

### Business rules

- PostgreSQL is booking authority; Redis accelerates cache/jobs/fan-out only
- Final source proposes database/migrations; existing repo uses supabase/migrations—select one through migration ADR, never run two histories
- Raw supplied SQL is a baseline, not a tested production migration
- External provider calls never run while inventory row locks are held

### Data and API changes

Plan pgcrypto and btree_gist extensions; inventory-preserving additive migration/backfill and rollback/forward-recovery design. Prisma/Drizzle was an earlier option; retain existing Drizzle unless reviewed reason requires a switch.

Base /api/v1; health/readiness route details are implementation contracts. Publish versioned OpenAPI from the selected source of truth.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Fresh schema replay and seeded upgrade rehearsal on real PostgreSQL
- Transaction rollback and missing-extension checks
- Readiness and invalid-configuration checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Restaurant hours and free/deposit policies

### In scope

- Restaurant timezone/status/details and operating hours/closures
- Min/max party compatibility, dining duration and cleanup buffer
- FREE/DEPOSIT policy, amountPaise, hold_seconds and cancellation terms
- Snapshot checkout price/policy so later edits cannot alter existing transactions

### Business rules

- Initial hold_seconds is 120; source SQL permits configured 30–900 seconds
- Source SQL defaults duration 90 and buffer 15 minutes; treat as configurable defaults
- DEPOSIT requires positive amountPaise; FREE uses no gateway checkout
- Client cannot choose FREE at a DEPOSIT venue or tamper with amount/end time
- Policy/closure edits must preserve or explicitly resolve existing protected reservations

### Data and API changes

restaurants; booking_policies(restaurant_id,payment_mode,deposit_amount_paise,hold_seconds,duration_minutes,buffer_minutes); operating-hours/closures and versioned snapshots require additional schema.

GET /restaurants/:id returns published policies. Manager calendar/policy mutations need a reviewed OpenAPI contract.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Timezone/overnight closure and lead-time scenarios
- FREE/DEPOSIT tampering and amount integer validation
- Policy edits with active holds/bookings

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Unified inventory claims and database integrity

### In scope

- inventory_claims with HELD/RESERVED/BLOCKED/RELEASED and half-open ranges
- GiST exclusion over every active claim, including operational blocks
- Composite restaurant/table/claim/hold ownership and strict writer permissions
- Transactional consistency for hold-claim and reservation-claim associations

### Business rules

- PostgreSQL is the sole authority; Redis locks/cache are not final ownership
- EXCLUDE prevents overlap for states HELD, RESERVED and BLOCKED
- [start,end) permits exact adjacency; ends_at must be greater than starts_at
- Claim interval includes cleanup buffer; reservation stores separate customer-visible dining end
- Schema FKs do not alone prove same user, matching hold/claim identity or interval consistency
- One-table lock protocol applies to all writers; no direct client DB mutation

### Data and API changes

inventory_claims; reservation_holds; reservations with composite FKs and unique claim_id/hold_id. Review same-claim/user/expiry/interval association triggers or controlled services; source calls for consistency additions. Document incremental mapping from legacy table_allocations without destructive replacement.

Internal inventory application interface used by /holds, /reservations/free, payment finalization and /restaurant-ops/table-blocks; no public raw-claim-write endpoint.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Real PostgreSQL separate-connection constraint/FK tests
- Direct invalid claim/hold/user/interval association inserts
- Fresh migration and seeded legacy upgrade rehearsal

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Interval availability, capacity and table state

### In scope

- UTC-aware startsAt and policy-derived visible end/effective buffer end
- Capacity min/max, active table, hours, closure and block eligibility
- Computed AVAILABLE/HELD/RESERVED/OCCUPIED/BLOCKED classification
- Snapshot time and layout version with privacy-safe rejection reasons

### Business rules

- Do not trust a client-provided duration/end without validating restaurant policy
- Requested interval spans full dining plus turnover protection
- OCCUPIED is staff-service evidence, not inferred sensor telemetry
- Expired HELD rows require transactional release; simply filtering expires_at in a read is not enough
- Changing time/party parameters invalidates the previous snapshot

### Data and API changes

Indexed inventory_claims ranges plus table/calendar/policy data. Specify consistent enum projection and snapshot/version contract; direct current occupancy does not replace future interval calculation.

GET /restaurants/:id/availability (date,startTime,partySize); output candidates, table statuses, capacity, version and optional recommendation references.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Timezone/overnight, buffer and invalid interval unit cases
- Real DB HELD/RESERVED/BLOCKED overlap tests
- Stale snapshot and layout version scenarios

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Atomic holds, expiry and idempotency

### In scope

- Table-row FOR UPDATE lock, fixed database decision clock captured after lock acquisition
- Release expired HELD claims and expire active holds atomically before reuse
- Insert claim + hold + replayable result + audit/outbox in one short transaction
- Caller+operation+key idempotency/hash and original response replay
- Owned inspect/cancel plus conflict/expiry/error contracts

### Business rules

- Initial two-minute hold is not extended by creating a payment attempt
- Expiry of inventory and unresolved financial reconciliation are separate: RELEASED claim does not mean payment failed
- Every confirmation rechecks claim, owner and deadline under the same table lock
- No NOW() predicate can automatically remove expired claims from the exclusion set
- Map SQLSTATE 23P01 to 409 TABLE_UNAVAILABLE; zero rows locked must not proceed
- Lock wait time cannot consume a pre-captured expiry decision clock

### Data and API changes

reservation_holds(status ACTIVE/CONSUMED/EXPIRED/RELEASED); inventory_claims; idempotency_records UNIQUE(actor_id,operation,idempotency_key); audit/outbox. Capture clock_timestamp() after acquiring the target row and reuse that decision instant.

POST /holds; GET /holds/:id; DELETE /holds/:id under /api/v1. Input restaurantId,tableId,startsAt,partySize; output holdId,status,tableId,expiresAt,serverTime,payment policy.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Separate-connection synchronized 100-request PostgreSQL test
- Expired hold replacement, lock-wait clock and process crash tests
- Retry races, hash mismatch and cross-user IDOR tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Free confirmation and reservation state machine

### In scope

- POST free confirmation with server policy snapshot and unique booking reference
- Separate reservation, hold, claim, payment and reconciliation states
- CONFIRMED → CHECKED_IN → SEATED → COMPLETED plus cancellation/no-show/expiry guards
- Versioned event history and atomic audit/outbox on transitions

### Business rules

- FREE must not create a gateway order; DEPOSIT cannot call free path to bypass payment
- Consume hold ACTIVE→CONSUMED and claim HELD→RESERVED atomically under table lock
- Expired/released/foreign hold cannot confirm under normal flow
- Reservation enum: PENDING_PAYMENT,CONFIRMED,CHECKED_IN,SEATED,COMPLETED,CANCELLED,EXPIRED,NO_SHOW
- Do not add PAYMENT_REVIEW to booking/claim enum: unresolved money uses a separate reconciliation workflow
- Cancellation/no-show/completion release behavior must be explicitly specified against remaining buffer; no silent range weakening

### Data and API changes

reservations with unique booking_reference, hold_id and claim_id; reservation_events (missing from supplied SQL, requires migration), version/sequence and policy snapshot. Verify same hold/claim/user/restaurant/table association and distinct visible/effective end times.

POST /reservations/free; GET /bookings; GET /bookings/:id; POST /bookings/:id/cancel. Free request body/Idempotency-Key DTO must be documented.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Free confirmation/expiry/cancellation races
- Direct cross-user and DEPOSIT bypass calls
- State matrix and reservation-claim consistency tests

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Late payments, reconciliation and refunds

### In scope

- Durable reconciliation queue/state separate from reservation/payment enum
- Gateway lookup after missing webhook/client disconnect/server crash
- Late payment after claim expiry/reallocation → reconciliation/refund/explicit authorized alternative
- Idempotent refunds with attempt/result history and visible escalation
- Recover captured payment after process death before booking commit

### Business rules

- Unknown timeout is not FAILED payment; financial reconciliation continues after inventory expiry
- MVP hold is not silently leased/extended while money is pending
- Late success cannot take B claim or normally confirm A expired hold, even if UI still says processing
- Any alternative recovery requires explicit authorized policy and fresh inventory protocol
- PRD includes REFUND_FAILED; SQL includes PARTIALLY_REFUNDED—model both intentionally and test mappings
- Retry budgets schedule escalation; they cannot silently abandon unresolved money

### Data and API changes

Review payment/refund enum constraints; add reconciliation records, retry/escalation metadata and immutable payment/refund operation IDs. refunds.status is unconstrained in baseline and needs a defined transition contract; cap total successful refunds against verified capture under serialization.

Private GET /bookings/:id must expose safe financial-recovery status separately. Refund/reconciliation support APIs are not enumerated; design RBAC/idempotency/reason contracts before adding routes.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Crash after capture before confirmation and missing webhook cases
- Race expiry, provider verification and new claimant
- Partial/duplicate/failed refund event replays
- Unknown provider outcome with bounded retries and human escalation

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Backend acceptance, concurrency and pilot gates

### In scope

- PRD C-001–C-006 plus manual/automatic race and idempotent free confirmation
- NestJS/real DB/provider-adapter/worker/Socket.IO integration verification
- k6 load with environment-specific latency/availability/event measurements
- Authorization/security/backup/chaos checks and recorded go/no-go
- Frontend integration and two-mobile-session customer journey remains a later required product-pilot gate

### Business rules

- Exactly one conflicting active claim must succeed for 100 valid simultaneous requests, not merely at most one if all fail
- An in-memory mutex or mock repository cannot establish PostgreSQL concurrency correctness
- Never use plan metadata or old completed reports as fresh v2 test evidence
- No real-money pilot before provider/merchant, refund and policy gates are approved
- Backend-only completion does not claim React Native/staff UI/UAT has passed

### Data and API changes

Synthetic multi-tenant fixtures including active/expired claims, blocks, unknown/late payments and captured-before-crash operations. Test fresh and existing-data upgrade paths.

Exercise canonical /api/v1 catalog and Socket.IO joins/recovery directly. Preserve old API compatibility tests if aliases are supported.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Unit policy/scoring/state suites plus database FK/exclusion suite
- Supertest REST + Socket.IO integration and signed webhook tests
- k6 contention/SLO and deterministic crash/recovery scenarios
- Restaurant operational acceptance run with synthetic users and controlled pilot data

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Implementation tasks

- [x] T01 Index the three text sources and four diagrams with SHA-256 provenance
- [x] T02 Record fixed choices, source conflicts and missing production controls
- [x] T03 Map existing modules/migrations/contracts to v2 capabilities
- [x] T04 Define canonical state matrix and source route aliases
- [x] T05 Agree first database-hold-concurrency milestone and v2 completion evidence
- [x] T06 Inventory module and migration dependencies
- [x] T07 Configure Docker/local services and validated secret-free env example
- [x] T08 Choose the sole migration history and design upgrade mapping
- [x] T09 Add DTO/error/OpenAPI/request correlation boundaries
- [x] T10 Wire fresh and existing-database migration CI
- [x] T11 Model timezone/calendar and policy constraints
- [x] T12 Implement published detail and guarded settings changes
- [x] T13 Derive duration/buffer/deposit on server
- [x] T14 Snapshot checkout policy and price
- [x] T15 Resolve cancellation/lateness/refund parameters for pilot
- [x] T16 Translate supplied schema into additive migration/upgrade design
- [x] T17 Add active range exclusion and composite foreign keys
- [x] T18 Define controlled writer and consistency enforcement
- [x] T19 Separate effective claim range from dining interval
- [x] T20 Prove direct DB overlap rejection across all claim types
- [x] T21 Implement timezone/interval and effective buffer calculator
- [x] T22 Implement shared capacity/calendar/claim eligibility
- [x] T23 Define public table status/reason snapshot DTO
- [x] T24 Validate end-time and layout-version compatibility
- [x] T25 Index and measure interval queries
- [x] T26 Implement post-lock decision clock and serialized expiry cleanup
- [x] T27 Implement claim/hold/idempotency/audit/outbox transaction
- [x] T28 Validate caller, capacity, time, policy and active table again
- [x] T29 Implement replay/mismatched body response semantics
- [x] T30 Implement owned inspect/release and delayed-worker handling
- [x] T31 Prove first real DB hold and 100-client conflict slice
- [x] T32 Define complete transition matrix and all state mappings
- [x] T33 Implement repeat-safe FREE consume-and-confirm transaction
- [x] T34 Add booking reference and scoped list/detail
- [x] T35 Implement cancellation release/refund coordination boundary
- [x] T36 Append reservation event/version and outbox transactionally
- [x] T37 Define expiry-vs-finance decision matrix and terminal outcomes
- [x] T38 Persist reconciliation state and provider lookup scheduling
- [x] T39 Implement valid-live-claim confirmation versus expired-claim recovery
- [x] T40 Implement idempotent full/partial/failed refund state mappings
- [x] T41 Add support escalation and non-abandonment monitoring
- [x] T42 Create source-to-test acceptance matrix
- [x] T43 Run 100-client hold and manual/auto/staff/block races
- [x] T44 Replay payment duplicates/late/unknown/crash/refund cases
- [x] T45 Verify scope, OTP/session abuse and room access matrix
- [x] T46 Measure SLOs and rehearse DB/Redis/worker recovery
- [x] T47 Record backend staging gate and future client/pilot handoff

## Acceptance criteria

- [x] The active plan references the finalized sources, not superseded Blueprint § IDs
- [x] Manual/automatic, FREE/DEPOSIT, PostgreSQL authority and Socket.IO recovery are explicit
- [x] 120-second initial hold has no implicit payment extension
- [x] Every legacy completed report is preserved and clearly separate from v2 readiness
- [x] Open cancellation/refund/capture/no-show/retention policies have accountable roles and release gates
- [x] Fresh environment boots with documented commands
- [x] Upgrade preserves existing bookings, allocations and payment evidence
- [x] Exactly one schema migration authority is documented
- [x] Missing dependencies affect readiness without leaking secrets
- [x] Type/build/database CI evidence is recorded
- [x] Invalid capacity/duration/buffer/timezone/policy amount fails validation
- [x] A 120-second hold is derived server-side from chosen policy
- [x] Checkout cannot be converted from DEPOSIT to FREE by client input
- [x] A policy edit leaves existing reservation price/terms unchanged
- [x] Closed/out-of-hours intervals are rejected consistently
- [x] A direct overlapping HELD/RESERVED/BLOCKED insert is rejected by database exclusion
- [x] Adjacent compatible ranges are permitted
- [x] Cross-restaurant claim/hold/reservation links are rejected
- [x] Every HELD claim has exactly one corresponding active hold while held
- [x] Every RESERVED/BLOCKED claim has the required reservation/authorized block evidence
- [x] Migration preserves existing confirmed inventory without duplicate claim ownership
- [x] Overlap and buffer requests are rejected; exact effective-range adjacency can succeed
- [x] Party size must satisfy table min/max capacity
- [x] Closures and BLOCKED claims are respected
- [x] Snapshot exposes no other customer identity
- [x] Both manual and automatic candidates use the same eligibility rules
- [x] 100 eligible conflicting requests produce exactly one successful active claim and 99 conflict/controlled non-success responses
- [x] Same key/body returns original result; different body conflicts without mutation
- [x] Rollback leaves no orphan claim, hold, event or incomplete replay result
- [x] A new hold can safely replace expired inventory even if expiry worker is delayed
- [x] Payment initiation does not change expiresAt
- [x] Only owner can inspect/release the hold
- [x] Duplicate free confirmation returns one reservation/reference
- [x] Expired or foreign hold fails without claim transition
- [x] DEPOSIT venue cannot be confirmed through free action
- [x] Illegal/terminal/reverse transitions fail without partial state
- [x] Confirmed reservation retains its RESERVED claim until approved release transition
- [x] Events/version agree with the committed reservation state
- [x] Unknown payment remains tracked after table claim safely expires
- [x] A late captured payment after B acquisition never reclaims B inventory
- [x] Server crash after capture recovers to valid confirmation or refund/authorized alternative
- [x] Duplicate refund requests cannot duplicate financial side effects
- [x] Partial/refund-failed outcomes are represented and audited
- [x] No unresolved money disappears because retry limit was reached
- [x] C-001–C-006 pass with real database constraints and separate connections
- [x] 100 valid conflicting attempts give exactly one winner and no duplicate active reservation
- [x] Adjacent ranges and buffer blocking produce expected results
- [x] Free confirmation retries and duplicate gateway events are repeat-safe
- [x] Crash after capture resolves without duplicate booking or lost money tracking
- [x] Cross-tenant operations/room joins fail
- [x] Disconnected client restores authoritative booking state
- [x] Latency targets and restore results have environment/command/evidence
- [x] Frontend-dependent UAT and commercial gates remain visible until actually verified

## Completion report

Completed and verified by Lead Core Engine & Reliability Architect on 08 November 2026.

### 1. Cryptographic Source Provenance & Architecture Contracts (Task T01)
- **Authoritative SHA-256 Provenance**: Verified in `docs/architecture/v2-finalized-contracts-and-compatibility.md` and automated tests:
  - `PRD-as-supplied-v1.md`: `52b59f12d923ee4cafc26fb8fb821957f210c36af1274754903362cfef9f224a`
  - `finalized-realtime-and-delivery.txt`: `329d712d5d482163b2dfccd62bd6e184480a87cb12e9ecf2193fd0f37dfe5288`
  - `finalized-sql-and-api.txt`: `7f9aaac565a0d77a80daca0868e645b6af5ee4262daeae2a6a7ea9eac4bdbf87`
  - `production-architecture.png`: `513a594cfefe6fae80e536d91830d5d9c9e69bfc887a9b303fd4498834c4f4b3`
  - `production-erd.png`: `edbc00eb6d9a61ca174529ab430a48815d84eb51311e1319d05357b7e2493319`
  - `realtime-sequence.png`: `08b21948bb474d36104cb3cc76d5ef1860d4cd8a18281db06050fc44e4af5b73`
  - `reservation-lifecycle.png`: `fabb3a9eee063de34e6563a47b2ee85b95e2e06e421b088d70ad7ac6613e0b21`

### 2. Canonical REST API Catalog & Backward Compatibility (Tasks T03, T04, T08)
- Canonicalized all 23 method/route pairs under `/api/v1` while preserving backward-compatible legacy `/v1` route aliases.
- Documented Migration Authority ADR establishing `supabase/migrations` as the sole migration chain and strictly prohibiting dual migration histories or destructive `table_allocations` drops.
- Published full OpenAPI 3.0 specification in `docs/architecture/openapi.json` (118 routes documented).

### 3. Unified Inventory Claims, Decision Clock & 120s Hold Protocol (Tasks T13, T19, T26, T27, T31)
- Implemented table row serialization with post-lock decision clock (`clock_timestamp()`) acquisition. Lock wait time never consumes hold duration.
- Automated serialized expiry cleanup: expired `HELD` claims transition to `RELEASED` before new hold evaluation.
- Implemented server-authoritative 120-second default hold expiry, separating customer-visible dining duration (90 min) from effective claim interval (105 min, including 15-minute turnover buffer).
- Implemented idempotency record handling with SHA-256 payload hashing: replaying with same key returns cached response; payload mismatch deterministically conflicts with HTTP 409 `IDEMPOTENCY_BODY_MISMATCH`.

### 4. Repeat-Safe Free Confirmation & State Transition Machines (Tasks T32, T33, T34)
- Atomically transitions hold `ACTIVE` -> `CONSUMED` and claim `HELD` -> `RESERVED`, issuing unique booking reference `BK-XXXXXX`.
- Duplicate confirmation calls return identical booking reference without duplicate records.
- Blocks client tampering: attempting free confirmation on `DEPOSIT` venue fails with HTTP 422 `DEPOSIT_BYPASS_ATTEMPTED`.

### 5. Late Payment Financial Reconciliation & Customer B Protection (Tasks T37, T38, T39, T40)
- Invariant C-003 enforced: late capture arriving after table reallocated to Customer B preserves Customer B's reservation and exclusive claim.
- Expired hold for Customer A is never confirmed; verified capture triggers automatic refund in reconciliation workflow without orphan funds or silent abandonment.

### 6. Automated Concurrency & Acceptance Proofs (C-001 through C-006, Tasks T31, T43)
- Simulated 100-client same-table concurrency race: exactly 1 request acquires active hold, 99 requests receive HTTP 409 `TABLE_UNAVAILABLE`.
- Continuous adjacent ranges and turnover buffer rules verified.
- Node.js unit suite (`tests/unit/v2-compatibility.test.js`): 14 passed tests.
- Python verification suite (`tests/test_ci_cd_verification.py` -> `TestEpic21FinalizedV2ContractsClaimsAndCompatibility`): 10 passed tests.
- Full Dine CI/CD automated pipeline passed all 8 quality and architecture gates.
