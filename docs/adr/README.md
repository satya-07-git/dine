# Architecture Decision Records (ADRs)

This directory documents the foundational architecture decisions for the Dine backend platform, as established in the Dine Technical Design Specification v1.0 (06 November 2026).

## ADR Index

| ADR ID | Title | Status | Blueprint Sections | Owning Epic |
| :--- | :--- | :--- | :--- | :--- |
| [ADR-001](ADR-001-modular-monolith-architecture.md) | Modular Monolith Chosen Over Microservices | Approved | §1.2, §2.1, §2.2, §19.3 | EPIC-001, EPIC-002 |
| [ADR-002](ADR-002-postgresql-as-booking-system-of-record.md) | PostgreSQL as Booking System of Record | Approved | §2.3, §5.1–5.4, §7, §19.3 | EPIC-001, EPIC-002 |
| [ADR-003](ADR-003-one-table-per-reservation-mvp.md) | One Physical Table per Reservation MVP | Approved | §1.3, §5.2, §6.2, §19.3 | EPIC-001, EPIC-006 |
| [ADR-004](ADR-004-deposit-policy-restaurant-configurable.md) | Restaurant-Configurable Deposit Policy | Approved | §1.3, §9.1, §19.1, §19.3 | EPIC-001, EPIC-004, EPIC-010 |
| [ADR-005](ADR-005-waitlist-exclusive-priority-offers.md) | Waitlist Exclusive Priority Offers Without Auto-Charge | Approved | §1.2, §9.4, §10.1–10.3, §19.3 | EPIC-001, EPIC-012 |
| [ADR-006](ADR-006-realtime-status-projection-and-reconciliation.md) | Realtime Status as Projection Reconciled Against Database/REST | Approved | §1.2, §2.3, §3.3, §11.1–11.2, §19.3 | EPIC-001, EPIC-013 |
| [ADR-007](ADR-007-agile-incremental-sdlc-with-risk-reviews.md) | Agile Incremental SDLC with Risk Reviews | Approved | §15.1–15.3, §16.1–16.3, §17, §19.3 | EPIC-001, EPIC-019 |

## Decision Process & Governance
1. **Creation**: New architectural decisions must be drafted using MADR format and linked to relevant epic and blueprint requirements.
2. **Review**: Reviewed jointly by Lead Backend Architect and Product Owner.
3. **Approval**: Status transitions from `Draft` -> `Approved` upon sign-off.
4. **Immutability**: Once approved and referenced by database migrations or API contracts, decisions are superseded rather than mutated in-place.
