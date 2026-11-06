---
id: "EPIC-014"
title: "Owner operations, check-in and walk-ins"
type: "epic"
status: "backlog"
phase: "G · Restaurant operations"
depends_on: ["EPIC-006", "EPIC-009", "EPIC-012", "EPIC-013"]
prd_requirements: ["Blueprint §1.1", "Blueprint §4", "Blueprint §8.2", "Blueprint §12.4", "Blueprint §13.2", "Blueprint §14.4", "Blueprint §16.2", "Blueprint §19.1"]
risk: "high"
assignee: "Unassigned"
summary: "Let authorized restaurant staff operate the same inventory safely for arrivals, walk-ins and service changes."
---

# EPIC-014 — Owner operations, check-in and walk-ins

## Objective

Let authorized restaurant staff operate the same inventory safely for arrivals, walk-ins and service changes.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 4, 8.2, 12.4, 13.2, 14.4, 16.2, 19.1. Delivery stage: G · Restaurant operations. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Restaurant-scoped booking list and guarded service status actions
- QR check-in with verified binding to booking and restaurant
- Walk-ins through the reservation core, never an independent inventory writer
- Authorized closures/blocks and operational no-show flow after policy definition
- Owner floor/policy changes reuse version and history guards

## Out of scope

Restaurant app screens, POS integration, payout administration, sensor status and unsafe support overrides.

## Business rules

- A walk-in competes with customers and offers under the same range exclusion
- Check-in QR must be validated server-side and must not grant cross-restaurant authority
- READY/SEATED/COMPLETED follow EPIC-009 state matrix
- Lateness/no-show release policy is unresolved until explicit approval
- A layout change cannot silently invalidate a held or confirmed booking

## Data and API changes

Reuse bookings, table_allocations, booking_status_events, table_blocks and audit_logs. Check-in token fields/signature/expiry/replay behavior require implementation design; do not expose plain private identifiers as authority.

GET /owner/restaurants/:id/bookings; PATCH /owner/bookings/:id/status; POST /owner/bookings/:id/check-in; PUT floor-plan; POST closures; PATCH policies. Walk-in/block/no-show write route shapes must be finalized in OpenAPI.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Host handles permitted check-in/status actions; manager operational permissions are explicit; owner/layout editor handles authorized configuration. All writes include verified membership and audit reason.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Implement bounded restaurant booking projection
- [ ] T02 Define QR token contract and repeat-safe check-in
- [ ] T03 Route walk-ins through reservation application service
- [ ] T04 Define block/closure-vs-allocation locking contract
- [ ] T05 Implement no-show only after policy matrix is approved
- [ ] T06 Run synthetic restaurant service dry-run

## Acceptance criteria

- [ ] A host from A cannot operate B booking/check-in QR
- [ ] Walk-in vs customer hold race cannot allocate the same overlapping table twice
- [ ] Replayed QR/check-in is safe and does not duplicate arrival events
- [ ] Owner layout conflicts preserve current reservations
- [ ] Readiness/service events come only from trusted authorized actors

## Required verification

- Run host/manager/owner/customer denial matrix
- Race walk-in, table block and hold attempts
- Verify invalid/expired/foreign QR and repeat submission
- Dry-run arrival, ready, seated, complete, cancel and no-show policy paths

## Dependencies and execution gate

Prerequisites: EPIC-006, EPIC-009, EPIC-012, EPIC-013.

Pilot restaurant dry-run completes with shared inventory and tenant checks.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Operational bypasses are a common source of double bookings
- QR proof and staff membership are separate authorization checks

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
