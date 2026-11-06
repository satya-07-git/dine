# ADR-001: Modular Monolith Chosen Over Microservices

## Status
**Approved** (06 November 2026)

## Context
Dine is a restaurant and cafe discovery and reservation platform with a core differentiator: allowing guests to select exact tables on a visual floor plan and reserving them atomically. The system must enforce high-concurrency transactional guarantees (e.g. no two guests can hold or reserve the same physical table for overlapping dining periods) across reservation, table inventory, payment, and waitlist domains.

We evaluated architectural options for the backend system:
1. Traditional Monolith (single layered codebase without strict boundary encapsulation)
2. Modular Monolith (single deployable codebase with strict domain boundaries, explicit module interfaces, and single-database ACID transactions)
3. Microservices (distributed services per domain: identity, restaurant, inventory, booking, payment, waitlist, notifications)
4. Serverless Functions (isolated cloud functions per HTTP endpoint)
5. Event-Driven Microservices (eventually consistent distributed event mesh)

## Decision Drivers
- **Physical Inventory Invariant**: Physical table inventory requires strict serializability and exclusion constraints during holds and booking commits. Distributed transactions across microservices (sagas, two-phase commit) introduce high latency, partial-failure race conditions, and eventual consistency traps.
- **Team Size & Velocity**: Small engineering team (1–7 engineers) needing fast delivery, local testing, and low operational burden.
- **Transactional Integrity**: Single-database ACID guarantees eliminate distributed state reconciliation for core booking flows.
- **Maintainability & Evolution**: Modular boundaries allow future independent deployment if specific bottlenecks emerge after proven scale.

## Decision Outcome
Adopt a **Modular Monolith** architecture built using **NestJS + TypeScript** backed by a single **PostgreSQL/PostGIS** database (via Supabase).

### Key Architectural Rules
1. **Single Deployable Unit**: The entire backend compiles and deploys as one unit.
2. **Strict Module Boundaries**: Features are organized into bounded NestJS feature modules (`identity`, `restaurants`, `floors`, `availability`, `reservations`, `payments`, `waitlist`, `notifications`, `audit`).
3. **Application Interfaces**: Cross-module communication occurs strictly via published Application Services / interfaces, never by direct cross-module table mutations.
4. **Shared Database, Isolated Schemas/Tables**: All tables reside within the same PostgreSQL instance to leverage ACID transactions and GiST exclusion constraints, but each module owns its persistence repository.
5. **No Long-Running Locks Across External Calls**: Never invoke external third-party SDKs (Razorpay, SMS, Push) while holding database row locks.

## Consequences
### Positive
- ACID transactions and GiST exclusion constraints guarantee the "no overlapping allocation" invariant without distributed locking.
- Simplified local development, end-to-end integration testing, and CI/CD pipeline.
- Single database migration history using `supabase/migrations`.
- Elimination of distributed failure modes, network hops, and saga orchestrators.

### Negative / Tradeoffs
- Requires discipline and code review to prevent leakage across module boundaries.
- Database scaling is centralized (mitigated by PostGIS indexing, connection pooling, and read-replica strategies when needed).

## Source Traceability
- Dine Blueprint §1.2 (Core business invariants)
- Dine Blueprint §2.1 (Decision matrix)
- Dine Blueprint §2.2 (Why modular monolith)
- Dine Blueprint §19.3 (ADR-001)
