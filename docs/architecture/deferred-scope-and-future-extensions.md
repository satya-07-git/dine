# Deferred Scope Register & Future Extensions Architecture Specification

## Purpose
This document establishes the official **Deferred Scope Register**, architectural criteria, prerequisite boundaries, risk taxonomy, and governance gates for candidate future extensions beyond the Dine exact-table backend Minimum Viable Product (MVP).

Fulfills **Tasks T01, T02, and T03** and **Acceptance Criteria 1, 2, 3, and 4** of **EPIC-020** (Blueprint §1.3, Blueprint §2.1, Blueprint §19.1, and Blueprint §20.3).

---

## 1. Architectural Context & Invariant Governance

### 1.1 The Exact-Table MVP Boundary
The core Dine architecture is explicitly defined as a **modular monolith** running against a single PostgreSQL/PostGIS database instance (ADR-001, ADR-002). To maintain absolute transactional integrity, the system guarantees:
- **One Table per Reservation (ADR-003)**: A booking reserves exactly one physical table UUID.
- **GiST Exclusion Constraint**: The `no_protected_table_overlap` constraint strictly eliminates double-bookings on identical physical tables for overlapping continuous half-open intervals `[start, end)`.
- **Tenant Isolation**: Restaurant ownership and staff roles are checked server-side for every mutation.
- **Trusted Authorization**: Only authenticated and authorized server controllers can mutate table inventory, status, or emit financial transactions.

### 1.2 Extension Governance Principles
1. **Deferred Capabilities are Not First-Release Work**: Features listed in this document are candidate extensions. None are enabled in the production MVP.
2. **First Release Independence**: No first-release core epic (EPIC-001 through EPIC-019) has any runtime, dependency, or compilation prerequisite on candidate extensions.
3. **Speculative Production Schemas are Prohibited**: No unapproved database tables, columns, or speculative API endpoints may be introduced into the repository.
4. **Prerequisites, Threat Reviews & ADRs Required**: Any future candidate extension must have a finalized product specification, STRIDE threat model, database migration design, and an approved Architecture Decision Record (ADR) prior to implementation scheduling.

---

## 2. Deferred Scope Register (Task T01 & AC 1)

The following candidate extensions are tracked with designated decision owners, architectural rationale, status, missing requirements, and risk ratings:

| Extension ID | Extension Name | Status | Accountable Decision Owner | Architectural Rationale & Missing Requirements | Risk Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **EXT-001** | **Joined Tables & Split Table Allocations** | `DEFERRED` | Lead Core Engine Architect | Combining multiple tables (e.g. T01 + T02) for large parties requires a new allocation contract, multi-table GiST lock semantics, and deterministic ascending table UUID locking to eliminate deadlock. Missing party split criteria and floor geometry proximity validation. | High |
| **EXT-002** | **Variable Seating & Dynamic Layouts** | `DEFERRED` | Restaurant Operations Lead | Dynamically reconfiguring movable walls or converting dining areas into banquet modes requires versioned multi-mode floor layouts. Missing physical turn-time transition models and staff layout sign-off workflow. | Medium |
| **EXT-003** | **Third-Party POS Integration** | `DEFERRED` | POS Integration Product Lead | Ingesting real-time orders and table status from external POS systems (Petpooja, Micros, POSist, Toast). POS events cannot bypass trusted inventory or status authorization; missing bi-directional webhook deduplication and offline terminal sync contracts. | High |
| **EXT-004** | **Dynamic Demand Pricing & Table Premiums** | `DEFERRED` | VP Revenue & Growth | Algorithmic deposit adjustments and peak-hour premiums based on demand forecasting. Missing legal price gouging compliance review, customer transparent pricing disclosures, and surge capping models. | Medium |
| **EXT-005** | **Multi-Location Chain Analytics** | `DEFERRED` | Enterprise Platform Architect | Cross-restaurant analytics, chain-wide customer loyalty, and multi-tenant reporting rollups. Missing cross-tenant data aggregation consent, privacy-preserving rollups, and tenant partition guarantees. | Low |
| **EXT-006** | **Microservice & Event-Driven Decomposition** | `DEFERRED` | Principal Distributed Systems Architect | Decomposing modular monolith into independent microservices. Prohibited under ADR-001 until measurable proof and scale triggers are exceeded. Missing distributed transaction saga orchestrator and independent team staffing. | High |

> [!IMPORTANT]
> In accordance with Acceptance Criterion 2 of EPIC-020:
> **No unresolved extension in the register is marked as `READY` or `COMPLETED`. All candidate extensions remain `DEFERRED`, `CANDIDATE_UNDER_REVIEW`, or `BLOCKED_ON_REQUIREMENTS`.**

---

## 3. Extension Prerequisites & Risk Criteria (Task T02 & AC 2)

### 3.1 Joined Tables (EXT-001)
- **Prerequisites**:
  - Formal multi-table allocation ADR defining table combination adjacency rules.
  - Deterministic ascending UUID table sorting algorithm implemented prior to `SELECT FOR UPDATE` to guarantee deadlock-free locking across concurrent multi-table transactions.
  - Update to table allocation status model to atomic multi-unit commits (all requested tables locked or none).
- **Risk Taxonomy**:
  - *Deadlock Risk (High)*: Two concurrent requests attempting to hold `[T01, T02]` and `[T02, T01]` in reverse order will deadlock without deterministic sorting.
  - *Inventory Invariant Leak (High)*: Partial failure where one table is allocated but the other conflicts could leak orphan allocations.

### 3.2 Third-Party POS Integration (EXT-003)
- **Prerequisites**:
  - Scoped restaurant API credentials with HMAC-SHA256 request signing and IP allowlisting.
  - Dedicated POS webhook ingress queue ensuring external events never bypass core state machine transitions or PostgreSQL exclusion checks.
  - Non-bypass policy: A POS "table occupied" event cannot overwrite a `CONFIRMED` booking without verified staff membership and explicit reason logging.
- **Risk Taxonomy**:
  - *Authorization Bypass (High)*: Malformed or unverified POS payloads marking reserved tables available.
  - *Network Asynchrony (Medium)*: Dropped POS sync messages leading to state divergence between floor terminals and cloud booking engine.

### 3.3 Dynamic Demand Pricing (EXT-004)
- **Prerequisites**:
  - Bounded deposit multipliers (e.g. max 1.5x standard deposit) approved in Commercial Policy Register.
  - Server-calculated price snapshots frozen at hold creation time; clients cannot pass proposed pricing.
  - Consumer rights review under applicable Indian hospitality consumer protection guidelines.
- **Risk Taxonomy**:
  - *Customer Trust Erosion (High)*: Opaque price spikes causing customer abandonment and negative platform sentiment.
  - *Contract Tampering (Medium)*: Malicious client attempting to spoof base tier pricing during booking hold.

---

## 4. Scale Triggers for Architecture Decomposition (AC 4)

In accordance with **ADR-001 (Modular Monolith Architecture)**, Dine remains a unified deployable modular monolith until empirical, measured evidence justifies microservices decomposition.

### 4.1 Measurable Scale Trigger Thresholds
Decomposition may ONLY be evaluated when at least one of the following scale triggers is breached with continuous 14-day production metrics:

| Metric ID | Scale Metric | Baseline MVP Threshold | Decomposition Evaluation Trigger | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **SCALE-001** | Daily Reservation Volume | Up to 10,000 bookings/day | **> 100,000 confirmed bookings/day** | Automated Daily Ingestion Aggregator |
| **SCALE-002** | Concurrent Active Holds | Up to 500 concurrent holds | **> 5,000 simultaneous active holds** | Real-time Prometheus gauge metric |
| **SCALE-003** | DB Connection Pool Saturation | < 40% pool utilization | **> 85% connection pool saturation** under PgBouncer | Cloud PostgreSQL Connection Metrics |
| **SCALE-004** | Engineering Team Contention | Single co-located team (1–8 devs) | **> 25 backend engineers** across 4+ autonomous teams | Git commit and deployment velocity reports |
| **SCALE-005** | Availability Latency SLA | p95 < 50ms read latency | **p95 > 250ms read latency** due to monolithic locking | APM tracing on `/v1/availability` |

### 4.2 Architectural Decomposition Gate
Any proposal to split the modular monolith into microservices requires:
1. Measured audit logs proving one or more `SCALE-001` through `SCALE-005` triggers have been breached.
2. A formal Architecture Decision Record (e.g. `ADR-008: Bounded Context Decomposition`).
3. An explicit distributed transaction and outbox strategy preserving the GiST zero-overlap guarantee.

---

## 5. Unresolved Operational Contracts Register (Blueprint §19.1)

The following operational contracts are formally registered as pending detailed commercial definition:

1. **No-Show Deposit Forfeiture vs Guest Credit**:
   - Status: Pending legal merchant review.
   - Requirement: Define whether deposit forfeiture is retained 100% by restaurant or converted to guest dining voucher.
2. **Gateway Settlement Fee Allocation**:
   - Status: Blocked on merchant agreement terms (`GATE-002`).
   - Requirement: Define absorption of gateway 2% payment processing fees on refunded cancellations.
3. **Dispute Resolution & Escalation SLAs**:
   - Status: Operational playbook documented (`GATE-003`).
   - Requirement: Tier-1 customer support SLA guarantees automated refund processing within 2 hours of payment review expiration.
4. **Dynamic Experience Packages & Bill Splitting**:
   - Status: Pending commercial pilot (`GATE-004`).
   - Requirement: Define multi-course package add-on billing and individual party member bill splitting.
5. **Algorithmic Review Moderation & Loyalty Points**:
   - Status: Governance review required (`GATE-005`).
   - Requirement: AI sentiment analysis cannot suppress negative customer reviews without human moderator approval.

---

## 6. First-Release Dependency Independence Proof (AC 3)

A topological dependency analysis of the Dine task graph confirms:
- `EPIC-001` through `EPIC-019` form a closed, self-contained acyclic dependency graph.
- No core epic specifies `EPIC-020` in its `depends_on` list.
- Production startup, runtime bootstrapping, and CI test pipelines execute completely without any optional future extension modules.
- All candidate future routes (e.g. `/v1/joined-tables`, `/v1/pos/events`) are strictly guarded and reject execution with `FEATURE_DEFERRED_TO_FUTURE_RELEASE`.

---

## 7. Sign-Off & Ownership

- **Lead Architecture & Governance Architect**: Approved future extensions register and scale triggers.
- **Head of Product**: Validated MVP scope preservation and non-goals.
- **Effective Date**: 08 November 2026
