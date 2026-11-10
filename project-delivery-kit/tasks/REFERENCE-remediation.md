---
id: "remediation"
title: "Audit gaps and remediation roadmap"
---
# Audit gaps and remediation roadmap

EPIC-001–024 completion records remain preserved. Audit remediation is tracked separately; completed planning/unit work does not imply verified production integrations.

## Root-cause and delivery map

| Epic | Gap / next outcome | Closure evidence |
| --- | --- | --- |
| [EPIC-025](EPIC-025-reliable-test-execution.md) | Reliable test execution and fail-closed CI | See executable acceptance checklist in epic |
| [EPIC-026](EPIC-026-runtime-boot-and-configuration.md) | Runtime boot dependencies and production configuration | See executable acceptance checklist in epic |
| [EPIC-027](EPIC-027-canonical-http-contracts.md) | Canonical HTTP contracts and request validation | See executable acceptance checklist in epic |
| [EPIC-028](EPIC-028-persistent-inventory-and-concurrency.md) | One persistent inventory engine and real PostgreSQL concurrency | See executable acceptance checklist in epic |
| [EPIC-029](EPIC-029-razorpay-test-mode-integration.md) | Actual Razorpay Test Mode orders and checkout adapter | See executable acceptance checklist in epic |
| [EPIC-030](EPIC-030-webhook-and-late-payment-correctness.md) | Durable webhook inbox and safe late-payment confirmation | See executable acceptance checklist in epic |
| [EPIC-031](EPIC-031-refund-ledger-and-reconciliation.md) | Refund ledger, reconciliation and financial truth | See executable acceptance checklist in epic |
| [EPIC-032](EPIC-032-financial-tenant-authorization.md) | Tenant and support authorization across financial operations | See executable acceptance checklist in epic |
| [EPIC-033](EPIC-033-durable-otp-and-sessions.md) | Durable phone OTP delivery and revocable sessions | See executable acceptance checklist in epic |
| [EPIC-034](EPIC-034-real-socketio-transport.md) | Real Socket.IO transport and authorized recovery | See executable acceptance checklist in epic |
| [EPIC-035](EPIC-035-real-bullmq-and-outbox-recovery.md) | Real BullMQ workers, Redis and durable outbox recovery | See executable acceptance checklist in epic |
| [EPIC-036](EPIC-036-evidence-backed-release-readiness.md) | Evidence-backed release gates, performance and pilot readiness | See executable acceptance checklist in epic |

## Previously failing test matrix

All 20 failures had the same reporting/execution-mode mismatch, rather than 20 demonstrated business-logic failures. Exact nested pass-count assertions are retained using anchored TAP summaries and the shared runner; missing tests still fail.

| Python wrapper | Required nested passes | Fix owner |
| --- | --- | --- |
| test_identity_node_unit_suite | 15 | EPIC-025 |
| test_floor_plans_node_unit_suite | 17 | EPIC-025 |
| test_availability_node_unit_suite | 26 | EPIC-025 |
| test_atomic_holds_node_unit_suite | 19 | EPIC-025 |
| test_reservation_lifecycle_node_unit_suite | 21 | EPIC-025 |
| test_payment_orders_and_webhooks_node_unit_suite | 18 | EPIC-025 |
| test_payment_reconciliation_node_unit_suite | 17 | EPIC-025 |
| test_waitlist_node_unit_suite | 29 | EPIC-025 |
| test_notifications_and_realtime_node_unit_suite | 38 | EPIC-025 |
| test_owner_operations_node_unit_suite | 21 | EPIC-025 |
| test_packages_node_unit_suite | 23 | EPIC-025 |
| test_engagement_node_unit_suite | 24 | EPIC-025 |
| test_audit_support_node_unit_suite | 12 | EPIC-025 |
| test_observability_and_recovery_node_unit_suite | 12 | EPIC-025 |
| test_release_verification_node_unit_suite | 10 | EPIC-025 |
| test_future_extensions_node_unit_suite | 11 | EPIC-025 |
| test_v2_compatibility_node_unit_suite | 14 | EPIC-025 |
| test_phone_otp_node_unit_suite | 13 | EPIC-025 |
| test_recommendations_node_unit_suite | 15 | EPIC-025 |
| test_socketio_bullmq_node_unit_suite | 24 | EPIC-025 |

## Recommended sequence

1. EPIC-025–027: reliable checks, runtime boot, real HTTP contracts.
2. EPIC-028 and 032: database authority and resource authorization before accepting payments.
3. EPIC-029–031: actual sandbox orders, safe webhook confirmation and refunds.
4. EPIC-033–035: durable OTP, real Socket.IO and BullMQ recovery.
5. EPIC-036: measured staging release, policy decisions, frontend handoff and controlled pilot.

## Financial acceptance matrix

Cover free confirmation; valid captured deposit; failed payment; unknown timeout; duplicate webhook; reordered events; expiry during checkout; late capture after replacement claim; missing webhook recovered by fetch; partial/full refund and concurrent over-refund; worker crash/restart. These remain NOT RUN against the actual provider/DB until attached evidence proves otherwise.

Detailed local rerun results are in TEST-EVIDENCE.md. Historical dashboard verification is not current production readiness.
