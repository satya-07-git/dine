# MVP Scope Boundaries, First Vertical Slice, and Milestone Exit Gates

## Purpose
This document defines the formal boundaries of the Dine Minimum Viable Product (MVP), explicitly lists excluded features, specifies the testable contract for the **First Vertical Slice**, and details the **Milestone Exit Gates (Phases 0 through 10)**.

Fulfills **Tasks T01 and T05** and **Acceptance Criteria 2 and 4** of **EPIC-001** (Blueprint §1.3, §15, §16.2, §16.3, §17).

---

## 1. MVP Scope Boundaries & Explicit Exclusions

### 1.1 In-Scope MVP Capabilities
1. **Single Physical Table**: Exactly one physical table per reservation.
2. **Server-Derived End Time**: Dining end time derived from restaurant-configured duration and turnover cleaning buffer: `[start_time, start_time + duration + buffer)`.
3. **Single Restaurant Floor Selection**: Direct visual table selection on an active floor plan version.
4. **Restaurant-Configurable Deposit Modes**: `FREE_RESERVATION` and `DEPOSIT_REQUIRED` (tested using Razorpay Test Mode).
5. **Table-Specific Waitlist**: FIFO-ordered eligible queue with 60s exclusive priority offers; strictly no auto-charge.
6. **Staff-Managed Service State Machine**: Host/Manager operational transitions (`READY`, `SEATED`, `COMPLETED`, `NO_SHOW`, `CANCELLED`).
7. **Single Monolith Deployable**: NestJS modular core with Supabase PostgreSQL/PostGIS.

### 1.2 Explicit MVP Exclusions (Deferred to Future Epics / EPIC-020)
The following capabilities are explicitly **excluded** from the initial MVP:
- **Joined or Split Tables**: Combining multiple physical tables for large parties.
- **Variable Seating Configurations**: Reconfigurable dining layouts or dynamic table resizing.
- **POS Integration**: Direct integration with restaurant point-of-sale systems (e.g. Petpooja, Micros).
- **Dynamic Demand Pricing**: Algorithmic surge pricing or peak-hour table premiums.
- **Multi-Location Group Analytics**: Cross-restaurant chain analytics or franchisee reporting.
- **Microservice Decomposition**: Splitting bounded contexts into separately deployed network services.
- **Live Financial Transactions**: Real customer credit card or UPI deductions (blocked until Phase 10 compliance exit gate).

---

## 2. First Vertical Slice: Concurrency Integrity Proof

### 2.1 Capability Sequence
To prove backend viability and transactional safety before integrating third-party payment gateways or asynchronous waitlist workers, the development sequence must complete:
```text
EPIC-001 (Definition) 
  → EPIC-002 (Foundation & CI) 
    → EPIC-003 (Auth & Tenant Isolation) 
      → EPIC-004 (Restaurant Profiles & Hours) 
        → EPIC-006 (Floor Plans & Tables) 
          → EPIC-007 (Availability Engine) 
            → EPIC-008 (Atomic Holds Engine)
```

### 2.2 Test Scenario & Written Exit Criteria

```text
CONCURRENCY PROOF TEST:
Two authenticated customers (Customer A and Customer B) concurrently request a hold 
for the identical table (Table T04) for an overlapping dining interval at 19:00.
```

#### Detailed Test Specification:
1. **Initial State**:
   - Restaurant `r1` is configured with active hours 12:00–23:00, default duration 90m, buffer 15m.
   - Table `T04` has capacity 4, status `active = true`.
   - No pre-existing allocations exist for date `2026-11-10`.
2. **Concurrent Request**:
   - Customer A sends `POST /v1/holds` with `{ "table_id": "T04", "requested_start": "2026-11-10T19:00:00Z", "party_size": 2 }` and `Idempotency-Key: key-A`.
   - Customer B concurrently sends `POST /v1/holds` with `{ "table_id": "T04", "requested_start": "2026-11-10T19:30:00Z", "party_size": 4 }` and `Idempotency-Key: key-B`.
3. **Expected Invariant Results**:
   - **Exactly one request succeeds**:
     - Winner receives HTTP `201 Created` with hold details, valid `expires_at` (5 minutes in future), and status `HOLD_ACTIVE`.
     - In PostgreSQL, one row exists in `table_allocations` with status `HELD` and `dining_period = '[2026-11-10 19:00:00+00, 2026-11-10 20:45:00+00)'`.
   - **Competing request is rejected**:
     - Loser receives HTTP `409 Conflict` with `code: "INVENTORY_HOLD_CONFLICT"`.
     - Zero ghost allocations or duplicate booking records created.
   - **Database Exclusion Guarantee**:
     - Attempting to bypass the API and execute a raw SQL insert for an overlapping range triggers PostgreSQL exception `23P01 (exclusion_violation)` on constraint `no_protected_table_overlap`.

---

## 3. Milestone Exit Gates (Phases 0 through 10)

| Phase | Milestone Name | Owning Epics | Required Scope & Artifacts | Exit Gate Criteria (Must be Proven Before Advance) |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 0** | **Definition** | **EPIC-001** | Architecture contracts, 7 ADRs, state machines, API taxonomy, policy register, first slice gates. | **Product Owner & Lead Architect sign-off; all commercial policies categorized as approved or explicit unresolved gates.** |
| **Phase 1** | **Foundation** | EPIC-002, 017, 018 | NestJS modular monolith scaffold, `supabase/migrations`, Drizzle client, OpenAPI, CI pipeline, health routes. | Clean database migrates from scratch; CI passes typecheck, lint, and fresh DB migration. |
| **Phase 2** | **Auth & Tenancy** | EPIC-003, 017 | Supabase JWT verification, role matrix (Customer, Host, Manager, Owner), tenant isolation guards. | IDOR security test confirms cross-tenant access between different restaurants is rejected with 403 Forbidden. |
| **Phase 3** | **Inventory** | EPIC-004, 005, 006 | Restaurant profiles, opening hours, special closures, versioned floor plans, table geometry. | API returns normalized floor geometry and active table layouts; invalid geometry fails validation. |
| **Phase 4** | **Availability** | EPIC-007 | Availability service, interval overlap logic, operating hour constraints, turnaround buffers. | Availability engine correctly flags candidate tables as available/unavailable across arbitrary test intervals. |
| **Phase 5** | **Atomic Holds** | EPIC-008 | Row locking (`FOR UPDATE`), GiST exclusion constraint, 5-minute hold timer, atomic hold endpoint. | **First Vertical Slice Concurrency Proof Passes**: 100 concurrent requests for Table T04 yield exactly 1 winner and 99 conflicts. |
| **Phase 6** | **Payments** | EPIC-010, 011 | Razorpay Test Mode, signed webhook inbox, payment attempts, late UPI capture review, refunds. | Duplicate webhook delivery is idempotent; late payment at hold expiry safely reconciles or refunds without orphan charge. |
| **Phase 7** | **Waitlist** | EPIC-012 | FIFO queue, table matching, 60s exclusive priority offers, offer acceptance/rejection. | Exactly 1 eligible candidate holds exclusive offer; timer expiry cascades to next candidate; zero auto-charges. |
| **Phase 8** | **Realtime** | EPIC-013 | Transactional outbox worker, Supabase Realtime Broadcast, reconnect reconciliation. | Disconnected mobile client recovers exact server booking state upon reconnecting; no state loss. |
| **Phase 9** | **Operations** | EPIC-014, 015, 016 | Staff dashboard, QR check-in, ready/seated/completed transitions, walk-in reservations, dining packages. | End-to-end dry-run at pilot restaurant: table walk-in, online hold, host check-in, and completion work seamlessly. |
| **Phase 10** | **Release QA & Audit**| EPIC-019, 020 | End-to-end stress testing, backup recovery drill, penetration test, legal/compliance sign-off. | Staging release gates passed; GATE-001–003 formally resolved; live financial processing approved. |
