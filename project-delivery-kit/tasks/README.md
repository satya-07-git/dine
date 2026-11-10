# Dine backend delivery guide

[Dashboard](dashboard.html) · [Same dataset at v2 URL](dashboard-v2.html) · [Audit remediation map](REFERENCE-remediation.md) · [Test evidence](TEST-EVIDENCE.md)

EPIC-001–024 retain their completed status, identity, assignee and completion report. EPIC-025–036 are additive audit remediation. Historical completion reflects the delivered scope; production integration readiness is governed by the new executable acceptance criteria.

Both dashboards are generated from the same Markdown source, with no browser-local status override. Rebuild with `python3 project-delivery-kit/tasks/build_dashboard.py`. Use Audit remediation in the sidebar for the gap matrix and failure causes; use phase/status filters for execution work.

## Active epic index

| Epic | Outcome | Status | Dependencies |
| --- | --- | --- | --- |
| [EPIC-001](EPIC-001-product-policies-and-architecture-contracts.md) | Product policies and architecture contracts | completed | None |
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
| [EPIC-021](EPIC-021-finalized-v2-contracts-claims-and-compatibility.md) | Finalized v2 contracts, claims and compatibility | completed | EPIC-001, EPIC-002, EPIC-004, EPIC-007, EPIC-008, EPIC-009, EPIC-010, EPIC-011, EPIC-017 |
| [EPIC-022](EPIC-022-phone-otp-sessions-and-manager-permission-upgrade.md) | Phone OTP, sessions and manager permission upgrade | completed | EPIC-002, EPIC-003, EPIC-017 |
| [EPIC-023](EPIC-023-automatic-table-recommendation-upgrade.md) | Automatic table recommendation upgrade | completed | EPIC-007, EPIC-008, EPIC-021, EPIC-022 |
| [EPIC-024](EPIC-024-socketio-bullmq-and-database-event-recovery-upgrade.md) | Socket.IO, BullMQ and database event recovery upgrade | completed | EPIC-013, EPIC-018, EPIC-021, EPIC-022 |
| [EPIC-025](EPIC-025-reliable-test-execution.md) | Reliable test execution and fail-closed CI | completed | EPIC-019 |
| [EPIC-026](EPIC-026-runtime-boot-and-configuration.md) | Runtime boot dependencies and production configuration | in_progress | EPIC-025 |
| [EPIC-027](EPIC-027-canonical-http-contracts.md) | Canonical HTTP contracts and request validation | backlog | EPIC-026 |
| [EPIC-028](EPIC-028-persistent-inventory-and-concurrency.md) | One persistent inventory engine and real PostgreSQL concurrency | backlog | EPIC-026, EPIC-027 |
| [EPIC-029](EPIC-029-razorpay-test-mode-integration.md) | Actual Razorpay Test Mode orders and checkout adapter | backlog | EPIC-027, EPIC-028, EPIC-032 |
| [EPIC-030](EPIC-030-webhook-and-late-payment-correctness.md) | Durable webhook inbox and safe late-payment confirmation | backlog | EPIC-028, EPIC-029 |
| [EPIC-031](EPIC-031-refund-ledger-and-reconciliation.md) | Refund ledger, reconciliation and financial truth | backlog | EPIC-029, EPIC-030 |
| [EPIC-032](EPIC-032-financial-tenant-authorization.md) | Tenant and support authorization across financial operations | backlog | EPIC-027 |
| [EPIC-033](EPIC-033-durable-otp-and-sessions.md) | Durable phone OTP delivery and revocable sessions | backlog | EPIC-026, EPIC-032 |
| [EPIC-034](EPIC-034-real-socketio-transport.md) | Real Socket.IO transport and authorized recovery | backlog | EPIC-028, EPIC-032, EPIC-033 |
| [EPIC-035](EPIC-035-real-bullmq-and-outbox-recovery.md) | Real BullMQ workers, Redis and durable outbox recovery | backlog | EPIC-026, EPIC-028 |
| [EPIC-036](EPIC-036-evidence-backed-release-readiness.md) | Evidence-backed release gates, performance and pilot readiness | backlog | EPIC-025, EPIC-026, EPIC-027, EPIC-028, EPIC-029, EPIC-030, EPIC-031, EPIC-032, EPIC-033, EPIC-034, EPIC-035 |

## Verification scope

`npm test` runs the build, full Node suite and full Python suite in sequence. `npm run ci` also checks dashboard generation, JavaScript syntax, migration/seed file structure, OpenAPI export and documentation links. None of these file/unit gates alone proves real PostgreSQL concurrency, provider payments, SMS delivery, socket networking, Redis workers or backup restoration. Those checks remain separately tracked in EPIC-026–036.

Product frontend remains deferred. Actual Razorpay Test Mode integration comes after persistent inventory and financial authorization; live collection is a separate approved release step. See [source register](SOURCE-REGISTER.md) for supplied PRD provenance.
