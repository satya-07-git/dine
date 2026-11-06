---
id: "EPIC-009"
title: "Reservation lifecycle and service status"
type: "epic"
status: "backlog"
phase: "D · Booking core"
depends_on: ["EPIC-008"]
prd_requirements: ["Blueprint §1.2", "Blueprint §8", "Blueprint §9.1", "Blueprint §11.1", "Blueprint §12.3", "Blueprint §12.4", "Blueprint §17.1"]
risk: "high"
assignee: "Unassigned"
summary: "Enforce server-owned reservation transitions and append-only status history for free and paid booking paths."
---

# EPIC-009 — Reservation lifecycle and service status

## Objective

Enforce server-owned reservation transitions and append-only status history for free and paid booking paths.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 8, 9.1, 11.1, 12.3, 12.4, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Explicit booking/allocation/payment state mapping and transition guards
- Free reservation confirmation contract after policy/atomic inventory checks
- Customer booking list/detail/cancellation and event history
- Staff ready, seated and completed transitions with optimistic state/version checks
- Policy-driven cancellation/no-show boundary and inventory release effects

## Out of scope

Client-confirmed payments, sensor-inferred readiness, automatic refunds without policy and app status screens.

## Business rules

- HOLD_ACTIVE → PAYMENT_PENDING only when backend associates gateway order
- PAYMENT_PENDING → CONFIRMED only after verified success and eligible inventory
- PAYMENT_PENDING → PAYMENT_REVIEW on uncertain deadline; HOLD_ACTIVE → EXPIRED only when safe
- CONFIRMED → READY/SEATED and service completion require scoped staff authority
- Booking state, allocation state, status event and outbox update are one transaction
- Full terminal transition/no-show matrix must be finalized; blueprint is not exhaustive executable enum code

## Data and API changes

bookings status/version; table_allocations mapped status; booking_status_events append-only actor/time/reason/sequence; outbox_events. Define immutable policy references and check-in/service timestamps as needed.

GET /bookings; GET /bookings/:id; POST /bookings/:id/cancel; GET /bookings/:id/events; PATCH /owner/bookings/:id/status. Free confirmation route is not listed in the blueprint and must be selected/documented before coding.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Customer only sees/cancels own eligible bookings. Staff transitions verify resource restaurant and role. Every transition records actor, reason, request_id and prior/new state.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Write complete state transition matrix and allocation mapping
- [ ] T02 Implement free booking and canonical customer reads
- [ ] T03 Implement policy-checked cancellation orchestration
- [ ] T04 Implement guarded staff status transitions
- [ ] T05 Append sequenced status history and transactional events

## Acceptance criteria

- [ ] Unauthorized or invalid terminal/stale transitions fail without partial updates
- [ ] Free booking cannot allocate occupied inventory
- [ ] Staff in A cannot advance a booking in B
- [ ] Customer cancellation preserves payment/refund evidence
- [ ] A duplicate logical transition cannot duplicate history or side effects

## Required verification

- Unit-test each allowed/denied matrix edge
- Integration-test free confirmation, cancellation and READY/SEATED/COMPLETED
- Race staff updates, customer cancellation and webhook success using real transactions

## Dependencies and execution gate

Prerequisites: EPIC-008.

Customer and staff lifecycle actions are authorized, repeat-safe and auditable.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Different booking and allocation vocabularies can diverge without mapping
- Cancellation must coordinate policy, payment recovery and waitlist release safely

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
