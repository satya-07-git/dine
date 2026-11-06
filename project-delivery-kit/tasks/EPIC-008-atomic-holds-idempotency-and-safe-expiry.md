---
id: "EPIC-008"
title: "Atomic holds, idempotency and safe expiry"
type: "epic"
status: "backlog"
phase: "D · Booking core"
depends_on: ["EPIC-002", "EPIC-003", "EPIC-007"]
prd_requirements: ["Blueprint §1.2", "Blueprint §5.3", "Blueprint §5.4", "Blueprint §7", "Blueprint §9.4", "Blueprint §16.3", "Blueprint §17.1"]
risk: "high"
assignee: "Unassigned"
summary: "Guarantee at most one protected allocation for a table and overlapping interval under concurrent requests."
---

# EPIC-008 — Atomic holds, idempotency and safe expiry

## Objective

Guarantee at most one protected allocation for a table and overlapping interval under concurrent requests.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 5.3, 5.4, 7, 9.4, 16.3, 17.1. Delivery stage: D · Booking core. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Short PostgreSQL transaction with SELECT table row FOR UPDATE
- Eligibility recheck, safe-expiry resolution and allocation overlap checks
- GiST exclusion over table_id equality and dining_period overlap for protected states
- Caller+endpoint+key idempotency with payload hash and original result replay
- Server-controlled hold expiry, cancellation and same-commit outbox event

## Out of scope

Gateway HTTP calls inside DB locks, multi-table reservations and unconditional time-based inventory release.

## Business rules

- Protected allocation states: HELD, OFFER_HELD, PAYMENT_PENDING, PAYMENT_REVIEW, CONFIRMED, READY, SEATED, COMPLETED per source schematic SQL
- expires_at passing does not remove a row from the exclusion constraint
- Transition only conclusively releasable allocations out of protected states
- All writers, including walk-ins and offers, obey the same invariant
- Same key/body returns the original result; same key/different body is a deterministic conflict
- COMPLETED keeps historical range protection; early release would need a separate approved rule

## Data and API changes

bookings; table_allocations with tstzrange CHECKs and GiST exclusion using btree_gist; idempotency_records unique by principal/endpoint/key; outbox_events. Map booking HOLD_ACTIVE to allocation HELD explicitly.

POST /booking-holds (Idempotency-Key); GET /booking-holds/:id; DELETE /booking-holds/:id. 201 returns hold_id, status, expires_at, server_time and deposit; competing overlap returns 409 TABLE_UNAVAILABLE; expired action uses 410 where appropriate.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Only authenticated owner can fetch/cancel own hold. Never trust user_id, amount, expiry or derived end time from client input. Rate-limit and cap abuse according to agreed policy.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Implement authoritative migration with protected-range exclusion
- [ ] T02 Implement row lock and transactional hold orchestration
- [ ] T03 Implement request hash and atomic idempotency response persistence
- [ ] T04 Integrate safe-expiry handling and rollback paths
- [ ] T05 Emit outbox/audit records in the inventory transaction
- [ ] T06 Build two-customer first vertical slice before any gateway or queue

## Acceptance criteria

- [ ] 100 simultaneous same-table overlapping attempts yield at most one protected allocation
- [ ] Two eligible nonoverlapping intervals can both succeed
- [ ] Same idempotency key/body gives one booking and identical original response
- [ ] Different body with same key fails without mutation
- [ ] Crash/rollback leaves neither orphan allocation nor incomplete idempotency result
- [ ] Delayed sweep cannot create a second protected allocation

## Required verification

- Run real PostgreSQL concurrency tests with separate connections and synchronized starts
- Attempt a direct overlapping DB insert to prove exclusion safety net
- Test idempotency races, rollback and key/body mismatch
- Test safe expired HELD vs unresolved PAYMENT_PENDING/PAYMENT_REVIEW outcomes

## Dependencies and execution gate

Prerequisites: EPIC-002, EPIC-003, EPIC-007.

Two authenticated users compete for the same real DB table: one hold wins, the other gets 409. Repeat with 100 clients.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Double allocation is critical
- Using now() in a partial-index predicate is not automatic expiry
- An unknown payment outcome must remain protected or use the approved safe-release/compensation path

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
