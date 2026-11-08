---
id: "decisions"
title: "V2 scope, decisions and release acceptance"
---
# V2 scope, decisions and release acceptance

Sources: finalized user decisions, PRD §2/3/15–21, SQL §3–6 and realtime supplement §8–12. Source header/version differences are recorded in SOURCE-REGISTER.md. Backend planning is updated; application runtime/migrations were not changed by this task.

## Fixed versus open

| Topic | Finalized / open boundary |
| --- | --- |
| Selection | Fixed: manual + automatic using one atomic engine |
| Payment mode | Fixed: restaurant FREE or configured DEPOSIT, never customer bypass |
| Truth | Fixed: PostgreSQL inventory ownership; Redis/socket is not authority |
| Architecture | Fixed: NestJS modular monolith; React Native TypeScript clients later |
| Realtime | Fixed: authorized Socket.IO rooms plus durable outbox/database recovery |
| Initial expiry | Fixed baseline: 120 seconds; configurable 30–900 in supplied SQL; no implicit payment extension |
| One table | Current design supports one table; multi-table requires a new decision/contract |
| Cancellation/refunds/no-show | Windows, penalties, grace, escalation and settlement terms require approved policy |
| OTP/session provider | Phone OTP required; provider, session rotation/revocation implementation to select |
| Migration/compatibility | Reuse existing data; choose one history; document old routes and new /api/v1 contract |
| Scoring | Deterministic normalized components; supplied weights are initial assumptions |
| Financial state mapping | Preserve REFUND_FAILED from PRD and PARTIALLY_REFUNDED from SQL through explicit mapping |
| Recovery cursor | Envelope/version required; replay endpoint, retention and snapshot ordering need exact contract |
| Operational entries | Staff records walk-ins/phone/external reservations; design guest privacy/user binding |

## Scope classification

Must: OTP/session security, restaurant/staff access, listings, floor/table inventory, interval availability, atomic holds/expiry, manual + automatic selection, free and deposit confirmation, reconciliation, realtime recovery, staff operations, audit, operational reliability and real concurrency tests.

Should: optional push/reminders (018), waitlist (022), product analytics/commercial validation tooling (023). They do not block core v2 acceptance unless pilot scope explicitly selects them. Previous mandatory waitlist/OFFER_HELD semantics are not silently carried into the new four-state claim model.

Future: multi-table, joined/split seating, POS, dynamic pricing, loyalty, subscription billing, occupancy forecasting, AI optimization and a separately designed payment-processing lease. Frontend coding remains deferred; full customer/staff UAT still requires later client integration.

Packages, menus, eligible reviews and preference management were broader old-blueprint modules, not required standalone v2 epics. Preferences used as recommendation input may need a bounded contract in 011. Preserve existing implementation as legacy/reuse candidate without asserting all these modules are now Must scope.

## Canonical staff permission intent

| Actor | Allowed intent | Denied boundary |
| --- | --- | --- |
| Customer | OTP login, discovery, own hold/booking/payment, eligible cancel | Other guest data, staff configuration, self-declared capture |
| Restaurant staff | Own venue reservations, arrival, seating, completion, no-show and allowed blocks | Foreign venue and unauthorized policy/staff access |
| Restaurant manager | Source §3.3 adds profile, layout, hours, duration/buffer, deposit/cancellation and staff permissions | Foreign venue/platform privilege escalation |
| Platform admin | Restaurant onboarding, payment disputes, failures/log/policy review | Unlogged changes and inventory constraint bypass |

Exact role/resource/action resolver and tenant list/export scoping must be tested on direct backend calls and room joins. A UI hiding controls is not authorization.

## Mandatory concurrency and failure acceptance

| ID / scenario | Required outcome | Epic |
| --- | --- | --- |
| C-001: 100 valid conflicting hold requests | Exactly one active claim succeeds; others conflict/controlled non-success; no duplicate confirmation | 008/010/021 |
| C-002: two nonoverlapping eligible ranges | Both may succeed; effective cleanup buffers respected | 009/010 |
| C-003: capture after expiry and B claim | No invalid A confirmation or B claim theft; financial recovery | 014 |
| C-004: duplicated gateway events | One logical payment update; no duplicate booking/refund | 013/014 |
| C-005: crash after verified payment before confirmation | Durable recovery or refund without duplicate booking | 013/014 |
| C-006: two staff + customer conflicting operations | Same lock/exclusion; at most one conflicting operation succeeds | 008/015 |
| Manual vs automatic selection race | Same database constraints and one claim | 010/011 |
| Free confirm twice | Original logical booking/reference once | 012 |
| Staff block overlaps confirmed booking | Reject or explicit audited resolution; no silent cancellation | 015 |
| Customer disconnects / misses version | Authorized API/database history restores state | 016/017 |
| Foreign tenant REST/room access | Denied server-side | 004/017 |
| Hold expires during gateway uncertainty | Release inventory per serialized expiry; continue money reconciliation | 010/014 |
| Redis queue lost/server restarted | Reconstruct pending work from durable PostgreSQL | 016/020 |

“At most one” is the safety invariant, but the healthy seeded C-001 acceptance must also prove progress: exactly one success rather than all requests failing. An in-memory lock demo cannot prove the real PostgreSQL constraint path.

## Acceptance targets, not current metrics

| Metric | Source target |
| --- | --- |
| Double-booking incidents | 0 under defined tests and controlled operation |
| Hold creation p95 | Under 500 ms at defined MVP load |
| Availability query p95 | Under 300 ms at defined MVP load |
| Booking event delivery p95 | Under 2 seconds during normal connectivity |
| Payment recovery | Every unresolved payment tracked to terminal resolution |
| Critical authorization checks | 100% passing defined suite |

Record load, pool, dataset, machine/deployment, cold/warm state, errors and timing distributions. Dashboard checks are not backend performance results.

## Observability and failure playbook

Collect attempt rate, hold success/conflict/expiry rates, payment success, payment-to-booking recovery failures, confirmation latency, socket reconnects, API errors and DB contention. Monitor oldest unresolved money/outbox work and operational dead letters.

| Failure | Required behavior |
| --- | --- |
| Gateway timeout | Persist unknown operation, reconcile; do not auto-fail money or extend hold |
| DB lock contention | Short transactions, post-lock decision clock, bounded retry/conflict reporting |
| Delayed expiry job | Request-time serialized cleanup still releases eligible expired HELD rows |
| Redis loss | No ownership change; reconstruct recoverable work from DB |
| Outbox worker crash | Committed event retained; at-least-once retry and version/dedup |
| Socket disconnect | Snapshot/replay/gap refresh restores truth |
| Late capture | Preserve new claimant; refund/authorized recovery for prior payer |
| Staff external booking not entered | Consistency cannot be promised for unrecorded booking; staff workflow must record it |

## Backend and full-pilot release checklist

- [ ] Source/state/route compatibility and one migration authority reviewed.
- [ ] Fresh DB and existing-data upgrade migrations tested without losing current claims/history.
- [ ] Real PostgreSQL exclusion/FK and 100-client concurrency tests pass.
- [ ] OTP/session/rate limits, REST RBAC/tenant/customer ownership and room authorization pass.
- [ ] Manual and automatic allocation share engine; deterministic scoring and bounded fallback pass.
- [ ] FREE retries and DEPOSIT bypass prevention pass.
- [ ] Raw-body webhook trust, duplicate/out-of-order processing and order timeout recovery pass.
- [ ] Expired/late/unknown money, crash-before-confirm and idempotent refund cases pass.
- [ ] Staff check-in/seat/complete/no-show and operational block conflicts pass.
- [ ] Durable outbox, database recovery, Redis loss reconstruction and reconnect convergence pass.
- [ ] Metrics, latency targets, backup restore and incident escalation have actual evidence.
- [ ] Cancellation, no-show, refunds/capture/settlement and data-retention policies approved.
- [ ] Before full pilot: React Native/staff client journey and controlled restaurant UAT complete.
- [ ] Before real money: current gateway/merchant and explicit operational approval gates satisfied.

## Commercial validation

Source estimate of 8–12 weeks assumes one experienced focused developer, limited changes and a controlled pilot; it is not a delivery promise. Validate with 3–5 restaurants whether exact-table choice is useful, whether they can maintain floor plans and record walk-ins/phone bookings, and whether they would pay. Commission/SaaS/hybrid pricing remains a hypothesis. Deposit collection is not the same as a chosen platform revenue model.
