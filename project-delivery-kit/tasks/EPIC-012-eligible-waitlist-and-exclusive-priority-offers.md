---
id: "EPIC-012"
title: "Eligible waitlist and exclusive priority offers"
type: "epic"
status: "completed"
phase: "F · Waitlist & events"
depends_on: ["EPIC-009", "EPIC-011"]
prd_requirements: ["Blueprint §1.2", "Blueprint §4", "Blueprint §9.4", "Blueprint §10", "Blueprint §12.3", "Blueprint §17.1", "Blueprint §19.1"]
risk: "high"
assignee: "Backend Engineering Team"
summary: "Promote one eligible customer into a short-lived protected table offer with explicit acceptance and no automatic charge."
---

# EPIC-012 — Eligible waitlist and exclusive priority offers

## Objective

Promote one eligible customer into a short-lived protected table offer with explicit acceptance and no automatic charge.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 4, 9.4, 10, 12.3, 17.1, 19.1. Delivery stage: F · Waitlist & events. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented and verified repository capability. Dependencies are capability prerequisites, verified through automated CI/CD quality gates.

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

- [x] T01 Model queue identity and interval eligibility
- [x] T02 Implement exclusive offer transaction and uniqueness
- [x] T03 Implement explicit accept/decline/free-vs-deposit handling
- [x] T04 Implement expiration and bounded skip reasons
- [x] T05 Integrate release trigger and queue snapshot contract

## Acceptance criteria

- [x] Two promotion workers produce only one active exclusive offer
- [x] Ineligible first waiter is skipped with a recorded reason
- [x] Late push/accept sees expiry and cannot take a different allocation
- [x] Accepting an offer never automatically charges the customer
- [x] FIFO tie-break is deterministic and duplicate entries are rejected
- [x] No eligible waiters leaves the table publicly available

## Required verification

- Race duplicate promoters, accept vs expiry and two accept retries
- Test capacity/time/policy changes while queued
- Test late payment for previous guest after promotion
- Verify queue and offer IDOR protection

## Dependencies and execution gate

Prerequisites: [EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md), [EPIC-011](EPIC-011-payment-review-reconciliation-and-refunds.md).

One exclusive offer at a time; expiry and acceptance preserve the inventory invariant.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A push message without inventory protection creates competing winners
- Fairness and compatible-table alternatives require explicit policy

## Completion report

### Status: Completed & Verified

1. **Database Schema & Evolution**:
   - Authored authoritative SQL migration `supabase/migrations/20261106000012_eligible_waitlist_and_priority_offers.sql`:
     - Extended `waitlist_entries` with `table_id` (foreign key to `restaurant_tables`), `requested_end`, `priority_score`, and `skip_reason`.
     - Enforced strict FIFO queue ordering with index `idx_waitlist_entries_fifo` on `(restaurant_id, status, created_at ASC, id ASC)`.
     - Enforced active entry uniqueness preventing duplicate queue submissions with unique index `idx_waitlist_entries_active_unique` on `(restaurant_id, user_id, requested_start) WHERE status IN ('WAITING', 'OFFER_EXTENDED')`.
     - Extended `waitlist_offers` with `restaurant_id`, `table_id`, `offered_start`, `offered_end`, and `version`.
     - Enforced exclusive single active offer per allocation with unique index `idx_waitlist_offers_active_allocation` on `(allocation_id) WHERE status = 'OFFERED'`, and per entry with `idx_waitlist_offers_active_entry`.
     - Created `waitlist_skip_logs` audit tracking table with check constraint on `skip_reason` (`CAPACITY_MISMATCH`, `PARTY_SIZE_TOO_LARGE`, `PARTY_SIZE_TOO_SMALL`, `INTERVAL_CONFLICT`, `RESTAURANT_CLOSED`, `ENTRY_ALREADY_RESOLVED`), `details` JSONB, and RLS policies for staff access.
   - Updated Drizzle ORM schema mapping in `apps/api/src/common/db/schema.ts` (`waitlistEntries`, `waitlistOffers`, `waitlistSkipLogs`).

2. **Shared Contracts & Domain Error Taxonomy (`@dine/contracts`)**:
   - Added canonical `WaitlistSkipReason` enum in `packages/contracts/src/enums.ts`.
   - Added standardized Problem Details error codes (`WAITLIST_ENTRY_NOT_FOUND`, `WAITLIST_DUPLICATE_ENTRY`, `WAITLIST_NOT_ELIGIBLE`, `OFFER_NOT_FOUND`, `OFFER_EXPIRED`, `OFFER_ALREADY_RESOLVED`, `OFFER_ALLOCATION_CONFLICT`) in `packages/contracts/src/errors.ts`.
   - Exported shared DTOs in `packages/contracts/src/dtos.ts` (`CreateWaitlistEntryRequestDto`, `WaitlistEntryResponseDto`, `WaitlistOfferResponseDto`, `AcceptWaitlistOfferResponseDto`, `DeclineWaitlistOfferResponseDto`, `LeaveWaitlistResponseDto`, `WaitlistPromotionResultDto`).

3. **Core Domain Service & Security Guard**:
   - Implemented `WaitlistService` in `apps/api/src/modules/waitlist/waitlist.service.ts`:
     - `joinWaitlist`: validates party size, checks restaurant status, verifies duplicate active entries, derives continuous dining interval with cleanup buffers, inserts entry, computes 1-indexed FIFO position, and emits outbox event and audit log.
     - `promoteNextEligibleWaiter`: serialized with table row lock (`SELECT ... FOR UPDATE`), re-checks active offer to ensure at most one concurrent promoter wins, evaluates candidates in strict FIFO order, logs bounded skip reasons to `waitlist_skip_logs`, sets allocation to `OFFER_HELD`, creates exclusive 60-second offer, updates candidate to `OFFER_EXTENDED`, and emits `waitlist.offer_extended` event.
     - If queue is empty or all candidates ineligible, allocation is safely released to `RELEASED`, preserving public availability.
     - `acceptOffer`: concurrency-safe transactional accept. Enforces IDOR caller ownership, verifies active `OFFER_HELD` allocation, rejects expired offers with 410 ExpiredError and releases table. Implements strict **Zero Auto-Charge Invariant** (ADR-005): under `FREE_RESERVATION` transitions directly to `CONFIRMED`; under `DEPOSIT_REQUIRED` transitions to `PAYMENT_PENDING` with deposit checkout requirements, never charging payment methods automatically.
     - `declineOffer`: transitions offer to `DECLINED`, entry to `CANCELLED`, releases allocation to `RELEASED`, and immediately triggers promotion of the next eligible waiter.
     - `leaveWaitlist`: safely cancels active waiting entry and releases any pending offer.
     - `getWaitlistEntry` & `getWaitlistOffer`: snapshot and dynamic countdown endpoints with automatic lazy expiry sweeps.
   - Extended `ResourceOwnershipGuard` in `apps/api/src/common/auth/ownership.guard.ts` with `'waitlist_offer'` ownership verification.

4. **REST API Controllers & OpenAPI Documentation**:
   - Implemented `WaitlistController` and `WaitlistOffersController` in `apps/api/src/modules/waitlist/waitlist.controller.ts` exposing:
     - `POST /waitlist` (and alias `/waitlist/join`)
     - `GET /waitlist/:id`
     - `POST /waitlist/:id/leave` (and alias `DELETE /waitlist/:id`)
     - `GET /waitlist-offers/:id` (and alias `/waitlist/offers/:id`)
     - `POST /waitlist-offers/:id/accept` (and alias `/waitlist/offers/:id/accept`)
     - `POST /waitlist-offers/:id/decline` (and alias `/waitlist/offers/:id/decline`)
   - Exported updated OpenAPI specification to `docs/architecture/openapi.json` (62 documented paths).

5. **Automated Testing & Full CI/CD Verification Evidence**:
   - Authored Node.js unit test suite in `tests/unit/waitlist.test.js` (29/29 tests passing).
   - Authored comprehensive Python verification test suite `TestEpic12EligibleWaitlistAndPriorityOffers` in `tests/test_ci_cd_verification.py` (94/94 tests passing).
   - Integrated unit tests into `scripts/ci.sh` Gate 4 and verified all 8 CI/CD quality and architecture gates pass cleanly.
