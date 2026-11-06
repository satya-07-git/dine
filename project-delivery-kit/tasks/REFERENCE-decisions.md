---
id: "decisions"
title: "Scope decisions, risks and release gates"
---
# Scope decisions, risks and release gates

Source: Blueprint §1.3, §9.4, §14–20. The Dine document controls content. The Clinify files supply appearance and epic structure only.

## MVP and deferred scope

MVP: one physical table per reservation, one restaurant floor-plan selection, configurable duration and cleanup buffer, test-mode deposits, table-specific eligible FIFO waitlist and staff-managed service lifecycle. Product frontend is deferred in this delivery.

Later: joined tables, variable seating, POS integration, advanced pricing, demand optimization and multi-location analytics. EPIC-020 remains blocked for definition. Microservices require proven scale and a new architecture decision. No clinical, hospital, prescription, subscription or healthcare AI module is part of Dine.

## Unresolved product/implementation decisions

| Decision | Source starting point | Owner to assign | Required before |
| --- | --- | --- | --- |
| Deposit mode | Owner-configurable FREE / DEPOSIT_REQUIRED | Product + restaurant pilot | Booking policy implementation |
| Dining duration and buffer | Per restaurant/table category | Restaurant + product | Availability/holds |
| Hold expiry | 5-minute prototype value | Product + engineering | Pilot configuration |
| Waitlist offer | 60-second prototype value | Product + restaurant | Waitlist pilot |
| Pending review window | Bounded, gateway-specific | Payments engineering + operations | Recovery/release decisions |
| Waitlist fairness | FIFO among eligible entries per interval | Product | Queue contract |
| Cancellation/refund windows | Explicit restaurant policy + gateway constraints | Product + restaurant + payments | Cancellation/live money |
| Walk-ins and no-show | Shared inventory; authorized audited transitions | Restaurant + product | Owner dry-run |
| Floor edits | Versioned layout, safe retirement | Engineering + restaurant | Inventory writes |
| Capture/settlement | Verified gateway/merchant contract | Payments + merchant operations | Real-money release |
| Free reservation confirm route | Hold or direct confirm after checks | Product + backend | Lifecycle implementation |
| QR token/replay contract | Scoped validated check-in proof | Backend/security | Check-in implementation |
| Packages/reviews | Named modules, details incomplete | Product + restaurant | Those pilot capabilities |
| Privacy retention/deletion | Minimum necessary data; no source duration | Product + operations | Production |
| Deployment/SLO capacity | No host or measured results specified | Engineering/operations | Staging/release |

These are open decisions, not automatic implementation readiness. EPIC-001 can proceed with definition work; a capability cannot pass its exit gate until its required rules are approved.

## Role matrix

| Role | Allowed intent | Boundary |
| --- | --- | --- |
| Customer | Public discovery, own bookings/offers/preferences, eligible actions | No foreign customer mutation or self-declared capture |
| Host | Authorized arrival/check-in/ready/seated operations | No ownership/payout credential changes |
| Manager | Permitted restaurant booking/block/staff operations | No foreign restaurant data |
| Owner | Own restaurant policy, layout and staff management | No cross-restaurant override |
| Platform support/admin | Controlled incident support | No unlogged changes or shared client secrets |

## Risk register

| Risk | Impact | Required control / epic |
| --- | --- | --- |
| Double allocation | Critical: two customers, one table | Row lock + GiST exclusion + all writers + concurrency QA; 008/019 |
| Paid without reservation | Critical charge/recovery incident | Review, reconciliation, idempotent refund and audit; 010/011 |
| Tenant leakage / owner misuse | High privacy/operational incident | JWT + membership/RBAC + RLS + direct IDOR tests; 003/017 |
| Reservation hoarding | Lost inventory | Rate limits, short approved holds, abuse controls; 003/008/018 |
| Stale status | Misleading customer updates | Sequenced private events + canonical refetch; 009/013 |
| Premature microservices | Delivery/operations overhead | Keep modular core; evidence before split; 001/020 |
| Undefined policy | Wrong charge/cancellation promise | Explicit decisions and source gaps; 001/011/015/016 |

## Critical acceptance matrix

| Scenario | Expected result | Epic |
| --- | --- | --- |
| 100 concurrent overlapping T04 requests | At most one protected allocation | 008/019 |
| Two nonoverlapping eligible ranges | Both may succeed | 007/008 |
| 19:00–20:30 plus 15-minute buffer vs 20:00 start | Reject overlap | 007/008 |
| Same idempotency key and body retried | Original result, no duplicate | 008/010 |
| Same key, changed body | Deterministic conflict | 008/010 |
| Webhook repeated 3 times and out of order | One transition, no capture downgrade | 010/011 |
| Capture after table released to B | Keep B, recover/refund A | 011/012 |
| Two queue promoters | One exclusive offer | 012 |
| Host A requests B booking | Denied direct API call | 003/014 |
| Owner edits booked table layout | Version conflict or safe compatible edit | 006/014 |
| Lost realtime then reconnect | REST state matches DB | 013 |
| Network lost during UPI | Trusted review/reconciliation restores truth | 011 |

## Test pyramid

Unit: eligibility, duration/buffer/timezones, transitions and refund decisions.

Database: foreign keys, CHECKs, RLS, GiST exclusion, separate-connection concurrency and idempotency uniqueness.

Integration: real local PostgreSQL + NestJS + signed synthetic gateway inbox + worker processing.

Backend end-to-end: two authenticated API sessions; hold/conflict; payment success/failure/retry/review; waitlist accept; staff check-in/status. The source also calls for two mobile sessions; that UI check is deferred until the product frontend exists and must remain a later handoff gate.

Non-functional: secrets, rate limits, bad client clock, delayed cron, worker/provider outage, backup restore, load/latency and resume/refetch contracts.

## Pilot performance targets — not measurements

- Availability read p95: 300–500 ms suggested target.
- Uncontended hold p95: 500–800 ms suggested target.
- 100-client same-table stress: no double protected allocation.

Record deployment resources, dataset, connection pool, concurrency and observations before judging performance. No backend tests have run as part of this dashboard delivery.

## Failure playbook

| Failure | Backend action | Later client contract |
| --- | --- | --- |
| Realtime disconnected | DB remains truth; scoped REST available | Show last known state; refetch on reconnect |
| Gateway timeout | Reconcile; guard allocation until safe decision | Show verifying rather than invent paid/failed |
| Owner edits held table | Version/conflict guard and history preservation | Actionable layout conflict |
| Cron delayed | Request-time safe expiry checks | No promise based on local timer |
| Duplicate webhook | Unique inbox + transition dedup | No duplicate confirmation/refund |
| Notification poison message | Bounded retry then visible dead letter | Booking remains committed |

## Staging and commercial release gates

- [ ] Fresh install migrates; type/unit/database/integration pipeline passes.
- [ ] Two-customer and 100-client overlap tests pass; all writers use shared invariant.
- [ ] JWT/RBAC/RLS, IDOR and private Broadcast authorization pass.
- [ ] Signed raw-body webhook verification and replay/out-of-order processing pass.
- [ ] Pending/late capture, reconciliation, refund and manual recovery paths pass.
- [ ] Deposit, cancellation, no-show, refund and bounded review policies approved.
- [ ] Waitlist promotion, accept/expiry races and no-auto-charge rule pass.
- [ ] Durable audit, outbox retry, logs, metrics and support escalation verified.
- [ ] Restaurant dry-run, load targets and backup/restore evidence recorded.
- [ ] Migration/deployment rollback or forward-recovery plan and observation owner recorded.
- [ ] Before real money: current gateway/merchant requirements and operational approval obtained.

## Delivery pipeline and completion evidence

Small PR → format/type/unit checks → clean DB migration replay + constraints/RLS → integration + concurrent hold cases → API deployment and controlled migration → staging booking/payment/waitlist/status flow → observed release with lock/review/error metrics.

Update epic frontmatter and completion report together only when evidence exists. Dashboard completion counts are repository metadata, not a live Git connection. Initial Dine epics are backlog; future extensions are blocked. No assignee, finish date or test pass is invented.

## Source reference links

The following URLs are supplied by blueprint §20.1; this planning task has not verified their current contents. Check current official provider documentation during implementation.

- [NestJS Modules](https://docs.nestjs.com/modules)
- [PostgreSQL Range Types](https://www.postgresql.org/docs/current/rangetypes.html)
- [PostgreSQL Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Supabase private Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
- [Supabase Auth JWTs](https://supabase.com/docs/guides/auth/jwts)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Razorpay webhook reference supplied in source](https://razorpay.com/blog/payment-gateway-webhooks-india)

## Original diagram coverage

Source §20.2 lists 10 figures: system context; modular deployment; ER relationships; atomic hold; booking state machine; late-payment race; waitlist promotion; realtime/outbox; hybrid SDLC; development dependencies. Their subjects are covered by Architecture, Database, Critical workflows and Epic overview in this dashboard. These are semantic redraws/textual flows, not claims of reproducing the DOCX artwork.
