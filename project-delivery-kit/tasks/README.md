# Dine backend delivery — stable epic identities

[Open dashboard](dashboard.html) · [V2 dashboard alias](dashboard-v2.html) · [Source register](SOURCE-REGISTER.md)

Both dashboard filenames are generated from the **same active Markdown records**. Current status: **20 completed original epics, 4 pending v2 upgrades**. The completed baseline is no longer hidden in an archive or replaced with a different set of similarly numbered backlog items.

## Status and identity rule

EPIC-001–020 preserve their original names, completed statuses, checklists, assignees and completion reports. A new PRD does not reset delivered work. Finalized-v2 changes have new, additive IDs:

- EPIC-021: finalized contracts, inventory claims, 120-second expiry, lifecycle/payment/API compatibility and v2 acceptance deltas.
- EPIC-022: phone OTP, revocable sessions and finalized manager-permission upgrades.
- EPIC-023: deterministic automatic recommendation through shared atomic inventory.
- EPIC-024: Socket.IO, BullMQ/Redis and database-backed event recovery upgrade.

Completion of the original work does not claim these additional provider/schema/contract changes were already implemented. Their four checklists remain pending. Existing backend code and migrations were not changed by this planning/status fix.

## Active epics

| Epic | Outcome | Status | Dependencies |
| --- | --- | --- | --- |
| [EPIC-001](EPIC-001-product-policies-and-architecture-contracts.md) | Product policies and architecture contracts | completed |  |
| [EPIC-002](EPIC-002-repository-database-and-delivery-foundation.md) | Repository, database and delivery foundation | completed | EPIC-001 |
| [EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md) | Identity, memberships and tenant authorization | completed | EPIC-002 |
| [EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md) | Restaurant profiles, hours and policies | completed | EPIC-003 |
| [EPIC-005](EPIC-005-discovery-menus-and-public-media.md) | Discovery, menus and public media | completed | EPIC-004 |
| [EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md) | Versioned floor plans and table inventory | completed | EPIC-004 |
| [EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md) | Time-range availability and policy engine | completed | EPIC-006 |
| [EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md) | Atomic holds, idempotency and safe expiry | completed | EPIC-002, EPIC-003, EPIC-007 |
| [EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md) | Reservation lifecycle and service status | completed | EPIC-008 |
| [EPIC-010](EPIC-010-payment-orders-and-verified-webhook-inbox.md) | Payment orders and verified webhook inbox | completed | EPIC-009 |
| [EPIC-011](EPIC-011-payment-review-reconciliation-and-refunds.md) | Payment review, reconciliation and refunds | completed | EPIC-010 |
| [EPIC-012](EPIC-012-eligible-waitlist-and-exclusive-priority-offers.md) | Eligible waitlist and exclusive priority offers | completed | EPIC-009, EPIC-011 |
| [EPIC-013](EPIC-013-transactional-events-private-realtime-and-notifications.md) | Transactional events, private realtime and notifications | completed | EPIC-003, EPIC-009 |
| [EPIC-014](EPIC-014-owner-operations-check-in-and-walk-ins.md) | Owner operations, check-in and walk-ins | completed | EPIC-006, EPIC-009, EPIC-012, EPIC-013 |
| [EPIC-015](EPIC-015-dining-experiences-and-package-contracts.md) | Dining experiences and package contracts | completed | EPIC-004, EPIC-009 |
| [EPIC-016](EPIC-016-favorites-reviews-and-customer-preferences.md) | Favorites, reviews and customer preferences | completed | EPIC-003, EPIC-004, EPIC-009 |
| [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) | Audit, support and privacy controls | completed | EPIC-003 |
| [EPIC-018](EPIC-018-background-jobs-observability-and-recovery.md) | Background jobs, observability and recovery | completed | EPIC-002, EPIC-017 |
| [EPIC-019](EPIC-019-backend-verification-staging-and-release-gates.md) | Backend verification, staging and release gates | completed | EPIC-005, EPIC-008, EPIC-011, EPIC-012, EPIC-013, EPIC-014, EPIC-017, EPIC-018 |
| [EPIC-020](EPIC-020-future-extensions-and-unresolved-scope-definition.md) | Future extensions and unresolved scope definition | completed | EPIC-001 |
| [EPIC-021](EPIC-021-finalized-v2-contracts-claims-and-compatibility.md) | Finalized v2 contracts, claims and compatibility | backlog | EPIC-001, EPIC-002, EPIC-004, EPIC-007, EPIC-008, EPIC-009, EPIC-010, EPIC-011, EPIC-017 |
| [EPIC-022](EPIC-022-phone-otp-sessions-and-manager-permission-upgrade.md) | Phone OTP, sessions and manager permission upgrade | backlog | EPIC-002, EPIC-003, EPIC-017 |
| [EPIC-023](EPIC-023-automatic-table-recommendation-upgrade.md) | Automatic table recommendation upgrade | backlog | EPIC-007, EPIC-008, EPIC-021, EPIC-022 |
| [EPIC-024](EPIC-024-socketio-bullmq-and-database-event-recovery-upgrade.md) | Socket.IO, BullMQ and database event recovery upgrade | backlog | EPIC-013, EPIC-018, EPIC-021, EPIC-022 |

## Finalized target and source coverage

The technical reference views retain the latest supplied PRD/SQL/Socket.IO design, including manual + automatic selection, FREE/DEPOSIT policies, PostgreSQL claim authority, authorized realtime recovery, API compatibility, late-payment reconciliation and operational recording of off-platform reservations.

| Source area | Delivered foundation | New finalized-v2 delta |
| --- | --- | --- |
| Architecture and contracts | 001–002 | 021 |
| Phone auth/session, membership and manager permissions | 003 | 022 |
| Restaurant policy, discovery and floor geometry | 004–006 | 021 where contracts differ |
| Availability, atomic holds and claims | 007–008 | 021 |
| Lifecycle and free booking | 009 | 021 |
| Payment verification/reconciliation/refunds | 010–011 | 021 |
| Deterministic automatic recommendation | Shared 007–008 engine | 023 |
| Outbox and private status delivery | 013 | 024 |
| Staff check-in/blocks/walk-ins | 014 | 021/022 where finalized contracts differ |
| Audit, reliability and release verification | 017–019 | 021/024 changed-path evidence |
| Optional waitlist and prior broader modules | 012, 015–016; already delivered | No status reset or new mandatory scope |
| Deferred feature definition | 020; definition already completed | New implementation requires a separate approved epic |

Four supplied diagrams remain embedded with fit/pan/zoom, along with architecture/database/API/workflow references. The API catalog covers the 22 finalized supplement routes plus PRD logout. The base source header says v1.0; latest user finalization is v2.0. SOURCE-REGISTER.md preserves provenance and precedence.

## Build once, update both URLs

```bash
python3 project-delivery-kit/tasks/build_dashboard.py
```

The builder reads only active EPIC-*.md files for status and creates byte-identical dashboard.html and dashboard-v2.html. It does not substitute archived data, reset metadata, or infer completion from new requirement numbering. Both work offline, with no package install, API key or backend call. Refresh the open browser page after a rebuild.

Edit an epic's frontmatter/checklists/completion report together when work actually changes. Do not renumber existing IDs to introduce a new work item. Original historical snapshots and the discarded v2 renumbering draft remain under ../archive/ for traceability only; neither is a separate live status source.

## Verification

The regression checks cover original identity/status preservation, active-source links, equal data across both output filenames and rebuild stability. These are dashboard checks; database concurrency/payment/production claims require their own runtime evidence.
