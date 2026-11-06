---
id: "EPIC-012"
title: "Eligible waitlist and exclusive priority offers"
type: "epic"
status: "backlog"
phase: "F · Waitlist & events"
depends_on: ["EPIC-009", "EPIC-011"]
prd_requirements: ["Blueprint §1.2", "Blueprint §4", "Blueprint §9.4", "Blueprint §10", "Blueprint §12.3", "Blueprint §17.1", "Blueprint §19.1"]
risk: "high"
assignee: "Unassigned"
summary: "Promote one eligible customer into a short-lived protected table offer with explicit acceptance and no automatic charge."
---

# EPIC-012 — Eligible waitlist and exclusive priority offers

## Objective

Promote one eligible customer into a short-lived protected table offer with explicit acceptance and no automatic charge.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 4, 9.4, 10, 12.3, 17.1, 19.1. Delivery stage: F · Waitlist & events. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Table-specific MVP queue for party size and dining interval
- FIFO server ordering with stable tie-break and duplicate active-entry prevention
- Promotion on safely released inventory with exclusive OFFER_HELD allocation
- Explicit accept/decline and expiration → next eligible waiter
- Queue status/offer reads plus best-effort notification events

## Out of scope

Automatic charging, push-only reservations, unreviewed fairness scoring and broad alternative-table matching in MVP.

## Business rules

- Ordering is FIFO among eligible entries, not first notification delivered
- Promotion uses the same row lock/exclusion discipline as normal holds
- A 60-second offer is a prototype configurable value, not settled policy
- Accept validates caller, deadline and protected allocation before entering the approved free/deposit path
- Expired/declined offers release safely and promotion is deterministic
- If no eligible waiter remains, inventory returns to public availability

## Data and API changes

waitlist_entries; waitlist_offers; table_allocations OFFER_HELD; outbox_events; audit_logs. Define unique active equivalent entry and active offer constraints plus stable queue sequence.

POST /waitlist; GET /waitlist/:id; POST /waitlist-offers/:id/accept; POST /waitlist-offers/:id/decline. Own offer snapshot endpoint and leave-queue action are contract gaps to resolve, not source-defined routes. Offer creation is internal and idempotent.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Only authenticated entry/offer owner can read/accept/decline; restaurant-scoped operators cannot expose other guests through public queue projections.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Model queue identity and interval eligibility
- [ ] T02 Implement exclusive offer transaction and uniqueness
- [ ] T03 Implement explicit accept/decline/free-vs-deposit handling
- [ ] T04 Implement expiration and bounded skip reasons
- [ ] T05 Integrate release trigger and queue snapshot contract

## Acceptance criteria

- [ ] Two promotion workers produce only one active exclusive offer
- [ ] Ineligible first waiter is skipped with a recorded reason
- [ ] Late push/accept sees expiry and cannot take a different allocation
- [ ] Accepting an offer never automatically charges the customer
- [ ] FIFO tie-break is deterministic and duplicate entries are rejected
- [ ] No eligible waiters leaves the table publicly available

## Required verification

- Race duplicate promoters, accept vs expiry and two accept retries
- Test capacity/time/policy changes while queued
- Test late payment for previous guest after promotion
- Verify queue and offer IDOR protection

## Dependencies and execution gate

Prerequisites: EPIC-009, EPIC-011.

One exclusive offer at a time; expiry and acceptance preserve the inventory invariant.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A push message without inventory protection creates competing winners
- Fairness and compatible-table alternatives require explicit policy

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
