# Dine Commercial Policy Register & Governance Checklist

## Purpose
This document establishes the official policy decision register, assigned product and engineering ownership, policy versioning model, and explicit unresolved release gates for commercial operations in Dine.

As mandated by **EPIC-001** and Blueprint §1.3, §9.4, and §19.1, no commercial payment feature or booking mutation may go live with implicit or guessed policy defaults. Every policy is categorized as either **Approved** (with version, accountable owner, and testable contract) or **Explicitly Unresolved** (acting as a blocking gate for live payment/release).

---

## 1. Governance & Versioning Model

### Snapshotting at Booking Time
1. Policies are defined per restaurant or globally, and given a monotonic version identifier (e.g. `policy_version: 1`).
2. When an atomic hold is acquired, the server resolves the effective restaurant policy and records an immutable **policy snapshot reference** (`policy_snapshot_id` or JSON snapshot) inside the booking record.
3. Subsequent changes to restaurant policies do not retroactively alter the terms of active holds, confirmed bookings, or pending refunds.
4. Product Owners sign off on commercial terms; Engineering leads verify transactional safety and database integrity. Restaurant staff cannot override kernel invariants via policy configuration.

---

## 2. Policy Decision Checklist

| Policy ID | Domain | Policy Description | Prototype Default / Rule | Status | Accountable Product Owner | Accountable Engineering Lead | Release Gate Impact |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **POL-001** | Booking Model | Mode: `FREE_RESERVATION` vs `DEPOSIT_REQUIRED` | Configurable per restaurant profile | **Approved (v1.0)** | Head of Product | Backend Architect | Required before Phase 1 (EPIC-004) |
| **POL-002** | Inventory | Dining duration & cleaning turnaround buffer | Per restaurant / table category: Default 90m duration + 15m cleaning buffer | **Approved (v1.0)** | Restaurant Ops Lead | Core Engine Lead | Required before Availability (EPIC-007) |
| **POL-003** | Hold Engine | Pre-payment hold expiration window | 5 minutes (300 seconds); timer runs strictly on server clock | **Approved (v1.0)** | Product Manager (Booking) | Concurrency Architect | Required before Holds (EPIC-008) |
| **POL-004** | Waitlist | Exclusive priority offer acceptance window | 60 seconds; exclusive reservation of table during countdown | **Approved (v1.0)** | Product Manager (Waitlist) | Realtime Engineer | Required before Waitlist (EPIC-012) |
| **POL-005** | Waitlist | Queue priority & sorting semantics | FIFO ordering strictly among eligible parties (matching party size <= capacity, interval within range) | **Approved (v1.0)** | Product Manager (Waitlist) | Backend Architect | Required before Waitlist (EPIC-012) |
| **POL-006** | Payments | Pending payment review bounded window | 15 minutes bounded window for webhook delivery / UPI async capture before automated reconciliation | **Approved (v1.0)** | Payments PM | Payment Engine Lead | Required before Webhook Inbox (EPIC-010) |
| **POL-007** | Payments | Gateway sandbox testing vs live money | Razorpay Test Mode mandatory for all Phase 1–9 increments; live money blocked until exit audit | **Approved (v1.0)** | VP Finance / Legal | Security & Compliance Lead | **Blocks Live Payments Release** |
| **POL-008** | Operations | Lateness grace period & auto-release | 15 minutes grace period from `requested_start`; staff may mark `NO_SHOW` after 15m | **Approved (v1.0)** | Operations Lead | Backend Architect | Required before Operations (EPIC-014) |
| **POL-009** | Operations | Walk-in reservations | Walk-in creates immediate `CONFIRMED` booking via same allocation core; respects exclusion locks | **Approved (v1.0)** | Operations Lead | Core Engine Lead | Required before Operations (EPIC-014) |
| **POL-010** | Operations | Floor layout updates & table retirement | Existing bookings retain historic table snapshot; retired tables hidden from future ranges | **Approved (v1.0)** | Restaurant Ops Lead | Core Engine Lead | Required before Floor Plans (EPIC-006) |
| **POL-011** | Dining Experiences | Package party capacity, server duration, & deposit calculation | min_party_size <= party_size <= max_party_size; duration and deposit strictly server-derived from package terms | **Approved (v1.0)** | Head of Hospitality | Backend Architect | Required before Packages (EPIC-015) |
| **GATE-001** | Refunds | Cancellation cutoff & refund deduction schedule | **UNRESOLVED**: Tiered refund policy (e.g. 100% refund > 24h, 50% 12-24h, 0% < 12h) vs flat cancellation fee | **UNRESOLVED (GATE)** | Product Owner (Unassigned) | Payments Engineer | **BLOCKS Live Payment Release** |
| **GATE-002** | Finance | Merchant settlement fee deduction on cancellation | **UNRESOLVED**: Who absorbs payment gateway processing fees (2% + GST) on refund (Dine, Restaurant, or Guest) | **UNRESOLVED (GATE)** | Finance Controller | Payment Engine Lead | **BLOCKS Live Payment Release** |
| **GATE-003** | Dispute | Manual review SLA for late UPI capture disputes | **UNRESOLVED**: Max time window for operational review of double-allocated or orphaned captures (24h target) | **UNRESOLVED (GATE)** | Customer Support Lead | Platform Ops Lead | **BLOCKS Live Payment Release** |
| **GATE-004** | Packages | Dynamic pricing, multi-table joined parties, & split package billing | **UNRESOLVED**: Advanced event commerce, dynamic pricing, and multi-table package allocation | **UNRESOLVED (GATE)** | Product Owner (Unassigned) | Core Engine Lead | **BLOCKS Live Package Commerce** |

---

## 3. Explicit Unresolved Release Gates

> [!IMPORTANT]
> In accordance with Acceptance Criterion 3 of EPIC-001 and Blueprint §19.1:
> **No live financial transactions may be processed until GATE-001, GATE-002, GATE-003, and GATE-004 are formally resolved, approved with versioned policy documents, and coded into the refund/reconciliation engine.**

### Gate Detail: GATE-001 (Cancellation & Refund Rules)
- **Current Status**: UNRESOLVED.
- **Problem**: When a guest cancels a paid reservation, what percentage of the deposit is refunded as a function of time remaining until `requested_start`?
- **Options Under Review**:
  - Option A: Full refund if cancelled >= 24 hours prior; zero refund if < 24 hours.
  - Option B: Tiered (100% >= 24h, 50% between 4h and 24h, 0% < 4h).
  - Option C: Restaurant-configurable tiers within platform guardrails.
- **Resolution Requirement**: Legal/compliance and restaurant merchant terms must be finalized before EPIC-011 live testing.

### Gate Detail: GATE-002 (Gateway Fee Allocation on Refund)
- **Current Status**: UNRESOLVED.
- **Problem**: Razorpay retains transaction fees on refunded payments. The business must determine who absorbs the processing fee.
- **Resolution Requirement**: Commercial contract between platform and participating pilot restaurants.

### Gate Detail: GATE-003 (Late UPI Capture Dispute Procedure)
- **Current Status**: UNRESOLVED.
- **Problem**: When a UPI payment is captured after a 5-minute hold expires and the table has already been safely reallocated to another customer or waitlist entry, how is the guest notified and compensated?
- **Resolution Requirement**: Automated refund workflow combined with support operational playbook (SLO <= 2 hours for automated refund issuance).

### Gate Detail: GATE-004 (Dynamic & Multi-Table Package Commerce Gate)
- **Current Status**: UNRESOLVED.
- **Problem**: Does package booking permit dynamic surcharge pricing, multi-table joined event seating, or split bill deposits?
- **Resolution Requirement**: Multi-table inventory and complex event commerce are deferred beyond the one-table MVP architecture (ADR-003). Any attempt to pass client-defined prices or multi-table package requests must remain blocked at the API gateway until formally architected.

---

## 4. Policy Verification Sign-Off

- **Lead Backend Architect**: Approved architecture & transactional invariants.
- **Head of Product**: Signed off on MVP policy checklist and unresolved gates.
- **Version**: 1.0.0
- **Effective Date**: 06 November 2026
