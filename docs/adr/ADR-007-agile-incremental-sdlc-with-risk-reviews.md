# ADR-007: Agile Incremental SDLC with Risk Reviews

## Status
**Approved** (06 November 2026)

## Context
Developing a high-concurrency reservation platform involving financial transactions, real-time inventory locking, and multi-tenant security requires rapid iteration while safeguarding against catastrophic concurrency failures (e.g. double booking, lost payments, unauthorized cross-tenant data exposure).

We compared delivery methodologies:
- Waterfall: Clear upfront specs, but concurrency and payment edge cases discovered too late.
- Formal Spiral Model: Strong risk evaluation, but excessive ceremony and documentation overhead for a small team.
- Standard Agile Scrum: Predictable cadence, but fixed 2-week sprints can artificially delay critical risk proofs or burden 1–2 developers.
- Pure Prototype-First: Fast UI feedback, but frontend mockups dangerously mask transaction anomalies.

## Decision Drivers
- **Risk-First Verification**: Prove core concurrency and transactional integrity (first vertical slice) before investing in secondary features.
- **Team Velocity & Size Adaptability**: Provide a streamlined workflow for 1–2 core backend developers while scaling seamlessly to 3–7 engineers.
- **Continuous Quality Gates**: Enforce automated CI/CD checks, SQL migration replay, OpenAPI schema contracts, and tenant boundary tests on every commit.

## Decision Outcome
Adopt a **Risk-Driven Agile Incremental SDLC**, combining Agile iterative delivery with Spiral-inspired risk reduction loops:
1. **Iterative Increments**:
   - For 1–2 engineers: Continuous Kanban flow with explicit milestone exit gates and weekly demonstration slices.
   - For 3–7 engineers: 1- to 2-week Scrum-style increments with backlog refinement and sprint review.
2. **First Vertical Slice Gate**:
   - Implement and prove Phase 0 (Definition: EPIC-001) -> Phase 1 (Foundation: EPIC-002) -> Phase 2 (Auth: EPIC-003) -> Phase 3 (Inventory: EPIC-004, EPIC-006) -> Phase 4 (Availability: EPIC-007) -> Phase 5 (Atomic Holds: EPIC-008).
   - Require real PostgreSQL concurrent hold test (two customers competing for Table T04 at 19:00 -> exactly one wins with 201 Created, other receives 409 Conflict) before integrating external payment gateways or waitlist mechanics.
3. **Continuous Automated Quality Gates**:
   - Every PR must pass automated CI: linting, type-checking, fresh SQL migration replay on clean database, unit tests, and integration test suite.
   - Zero unhandled commercial or financial risks promoted to production.

## Consequences
### Positive
- Identifies locking bottlenecks and concurrency bugs early in the development lifecycle.
- Eliminates rework by freezing architecture contracts and database constraints before building dependent modules.
- Balances engineering rigor with rapid product delivery.

### Negative / Tradeoffs
- Requires discipline to resist building superficial frontend mockups before backend invariants are formally proven.

## Source Traceability
- Dine Blueprint §15.1, §15.2, §15.3 (Development model / SDLC)
- Dine Blueprint §16.1, §16.2, §16.3 (Implementation roadmap & first vertical slice)
- Dine Blueprint §17 (Testing & acceptance gates)
- Dine Blueprint §19.3 (ADR-007)
