# Dine finalized PRD v2.0 backend delivery plan

[Completed baseline: all 20 epics](dashboard.html) · [Open finalized v2 plan](dashboard-v2.html) · [Source register](SOURCE-REGISTER.md) · [Previous baseline snapshot](../archive/pre-prd-v2-2026-11-08/README.md)

The dashboard retains the requested Clinify dark/lime design and epic-only delivery structure. This update decomposes the latest finalized Dine PRD, supplied PostgreSQL baseline and Socket.IO/recommendation notes. It changes planning artifacts only; product frontend and backend runtime changes are not implemented by this request.

## Deliverables

- 24 v2 epic Markdown files: 20 Must, 3 Should and 1 Future.
- 122 implementation tasks and 132 unchecked acceptance criteria.
- All-epic cards, status board, phase/dependency overview, full-text search, scope/status/phase/epic filters.
- Final architecture, SQL integrity map, 23 canonical REST routes (22 supplement + PRD logout), state/recovery flows and release gates.
- Four supplied diagrams with fit/zoom controls and offline embedded images.
- Original source copies and archived pre-v2 completion evidence.

The base pasted PRD header says v1.0; your latest finalized message is v2.0. [Source register](SOURCE-REGISTER.md) explains precedence, source conflicts and compatibility decisions. Epic IDs are delivery planning IDs; FR/BR/C IDs remain those of the source.

## Epic breakdown

| V2 epic | Outcome | Scope | Stage | Prerequisites |
| --- | --- | --- | --- | --- |
| [EPIC-001](EPIC-001-finalized-v2-contracts-and-baseline-review.md) | Finalized v2 contracts and baseline review | Must | A · Architecture |  |
| [EPIC-002](EPIC-002-nestjs-postgresql-and-delivery-foundation.md) | NestJS, PostgreSQL and delivery foundation | Must | B · Foundation | 001 |
| [EPIC-003](EPIC-003-phone-otp-authentication-and-session-security.md) | Phone OTP authentication and session security | Must | B · Foundation | 002 |
| [EPIC-004](EPIC-004-restaurant-onboarding-staff-and-tenant-rbac.md) | Restaurant onboarding, staff and tenant RBAC | Must | B · Foundation | 003 |
| [EPIC-005](EPIC-005-restaurant-hours-and-free-deposit-policies.md) | Restaurant hours and free/deposit policies | Must | C · Venue inventory | 004 |
| [EPIC-006](EPIC-006-versioned-floor-plans-and-physical-tables.md) | Versioned floor plans and physical tables | Must | C · Venue inventory | 005 |
| [EPIC-007](EPIC-007-restaurant-discovery-and-availability-filters.md) | Restaurant discovery and availability filters | Must | C · Venue inventory | 005, 006 |
| [EPIC-008](EPIC-008-unified-inventory-claims-and-database-integrity.md) | Unified inventory claims and database integrity | Must | D · Reservation engine | 002, 005, 006 |
| [EPIC-009](EPIC-009-interval-availability-capacity-and-table-state.md) | Interval availability, capacity and table state | Must | D · Reservation engine | 008 |
| [EPIC-010](EPIC-010-atomic-holds-expiry-and-idempotency.md) | Atomic holds, expiry and idempotency | Must | D · Reservation engine | 003, 004, 009 |
| [EPIC-011](EPIC-011-deterministic-best-available-table-recommendations.md) | Deterministic best-available table recommendations | Must | D · Reservation engine | 009, 010 |
| [EPIC-012](EPIC-012-free-confirmation-and-reservation-state-machine.md) | Free confirmation and reservation state machine | Must | D · Reservation engine | 010 |
| [EPIC-013](EPIC-013-razorpay-orders-verification-and-webhook-inbox.md) | Razorpay orders, verification and webhook inbox | Must | E · Payments | 012 |
| [EPIC-014](EPIC-014-late-payments-reconciliation-and-refunds.md) | Late payments, reconciliation and refunds | Must | E · Payments | 013 |
| [EPIC-015](EPIC-015-staff-check-in-walk-ins-and-operational-blocks.md) | Staff check-in, walk-ins and operational blocks | Must | F · Operations | 004, 012 |
| [EPIC-016](EPIC-016-durable-reservation-events-and-transactional-outbox.md) | Durable reservation events and transactional outbox | Must | F · Operations | 012 |
| [EPIC-017](EPIC-017-socketio-authorized-rooms-and-reconnect-recovery.md) | Socket.IO authorized rooms and reconnect recovery | Must | F · Operations | 004, 016 |
| [EPIC-018](EPIC-018-push-notifications-and-booking-reminders.md) | Push notifications and booking reminders | Should | Should · Extensions | 016, 017 |
| [EPIC-019](EPIC-019-platform-support-audit-and-privacy.md) | Platform support, audit and privacy | Must | B onward · Cross-cutting | 004 |
| [EPIC-020](EPIC-020-redis-bullmq-observability-and-recovery.md) | Redis, BullMQ, observability and recovery | Must | B onward · Cross-cutting | 002, 019 |
| [EPIC-021](EPIC-021-backend-acceptance-concurrency-and-pilot-gates.md) | Backend acceptance, concurrency and pilot gates | Must | G · Hardening & pilot | 007, 011, 014, 015, 017, 019, 020 |
| [EPIC-022](EPIC-022-optional-waitlist-and-exclusive-offers.md) | Optional waitlist and exclusive offers | Should | Should · Extensions | 010, 012, 014, 016 |
| [EPIC-023](EPIC-023-optional-analytics-and-commercial-validation.md) | Optional analytics and commercial validation | Should | Should · Extensions | 015, 019, 020 |
| [EPIC-024](EPIC-024-future-scope-and-frontend-handoff-boundaries.md) | Future scope and frontend handoff boundaries | Future | Later · Definition only | 001 |

## Execution order and first milestone

Definition/compatibility (001) → foundation (002), OTP and staff RBAC (003–004) → venue policies/floors (005–006) → claim integrity (008) → interval eligibility (009) → atomic holds/expiry (010). Prove a real PostgreSQL 100-request overlap test with exactly one successful eligible claim before Razorpay.

Then: deterministic recommendations (011) and free/common lifecycle (012) → orders/webhook trust (013) → money recovery/refunds (014) → staff operations (015), event outbox (016), Socket.IO recovery (017) → hardening/backend pilot evidence (021). Discovery (007) is part of pilot, not a prerequisite for proving the isolated hold engine. Audit (019) and infrastructure/recovery (020) are cross-cutting controls from the first relevant write, not postponed cleanup.

Should epics 018/022/023 are not core-release prerequisites. Future definition/handoff 024 remains blocked for feature definition; frontend implementation stays deferred. Packages/reviews/menu systems from the old blueprint are not copied into new Must scope.

## Source roadmap and timing

| Source phase / guidance | Epics / gate |
| --- | --- |
| Phase 0 design | 001; fixed decisions/state/API/inventory failure outcomes |
| Phase 1 backend foundation; weeks 1–2 | 002–008 foundations; fresh/upgrade migrations, auth, venue/table data |
| Phase 2 engine; weeks 3–4 | 009–012; claims/holds/free/recommendations and real concurrency |
| Phase 3 payments; weeks 5–6 | 013–014; duplicate/late/unknown/crash/refund safety |
| Phase 4 realtime/operations; week 7 | 015–017, selected 018; state convergence after disconnect |
| Phase 5 clients; weeks 8–9 | Deferred React Native/staff UI integration, handoff 024 |
| Phase 6 hardening/pilot; weeks 10–12 | 019–021 plus client/UAT gates; recovery, security and measured targets |

The supplied 8–12-week estimate assumes one experienced focused full-stack developer, limited changes and controlled pilot. It is source guidance, not a commitment or a fresh estimate. Do not add these overlapping windows together as independent durations.

## Requirements coverage

| Source | Main epics |
| --- | --- |
| PRD §1–2 objectives, BR-001–012 | 001, 005, 008–014, 021 |
| PRD §3 roles | 003–004, 015, 019 |
| FR-A01–A05 OTP/session/tenant controls | 003–004 |
| FR-B01–B05 discovery | 005, 007, 009 |
| FR-C01–C06 geometry/compatibility | 006, 009–011 |
| PRD §5 hold engine / §10 claims | 008–010 |
| PRD §6 state machines | 012–015 |
| PRD §7 payment | 013–014 |
| PRD §8 architecture | 001–002, 016–020 |
| PRD §9 schema / SQL §3.2–3.3 | 003–010, 012–016, 019 |
| PRD §11 / SQL §6 API | 003, 005–007, 009–015 |
| PRD §12 / realtime §7 | 016–017 |
| PRD §13 / realtime §8 recommendations | 011 |
| PRD §14 administration | 004–006, 015, 019 |
| PRD §15 NFRs | 003–004, 019–021 |
| PRD §16 C-001–C-006 / realtime §10 | 008–017, 021 |
| PRD §17 Must/Should/Future | All scope metadata; 018, 022–024 distinguish extensions |
| PRD §18 / realtime §9 roadmap | This execution map and 021/024 |
| PRD §19 / realtime §12 commercial limits | 015, 023 |
| PRD §20 DoD / §21 decisions | 001, 021 |
| Diagram 1 architecture | Architecture view, 001–002, 016–020 |
| Diagram 2 lifecycle | Workflow view, 010–015 |
| Diagram 3 ERD | Database view, 005–008, 012–016 |
| Diagram 4 sequence | Workflow/diagram view, 010, 012, 015–017 |

## Build and view offline

```bash
python3 project-delivery-kit/tasks/build_dashboard.py
```

From any directory, use the builder's absolute path. It uses only Python standard library. `dashboard.html` shows the original 20 completed epics with preserved completion reports. `dashboard-v2.html` shows the separate 24-epic finalized v2 decomposition with embedded references and diagrams. Both are standalone. No install, API key, CDN or backend call is needed. Open dashboard.html for completed work, or dashboard-v2.html for the new requirements plan. Keep the folder for linked Markdown and original source files.

`dashboard-template.html` owns HTML, inline CSS and inline JavaScript; `build_dashboard.py` embeds source and validates metadata/dependency cycles. Edit Markdown, rebuild and refresh. Refresh itself reloads HTML; it does not invoke Python or query Git.

## Status and evidence

Initial v2 rebaseline started as 23 backlog and 1 blocked. Current status after user confirmation of EPIC-001: 1 completed, 22 backlog and 1 blocked; assignees remain unchanged. This means changed v2 conformance has not been reverified here, not that prior code disappeared. The complete previous task directory with historical completion reports is preserved in the archive. Numeric IDs now belong to the new v2 decomposition.

Statuses: backlog, ready, in_progress, blocked, completed. Preserve user-confirmed completions during plan updates. Update frontmatter, tasks/acceptance checkboxes and Completion report together, recording whether completion was user-confirmed or independently verified. Record changed files, migrations, commit, environment, test commands/results and limits. A mock/in-memory race cannot prove PostgreSQL safety. A full product pilot also needs deferred frontend integration/UAT and approved commercial/merchant gates.

Runtime Supabase auth/Broadcast, /v1 routes, older booking/allocation states and supabase/migrations remain legacy implementation context. The plan defines how to review/migrate them; this task does not refactor or deploy them. Keep a single migration history when later implementing v2.

## Completion display correction

The default dashboard now preserves all 20 original completed epics. The finalized v2 plan is a separate file linked from that dashboard. Original and v2 IDs refer to different decompositions; do not reset old completion records or copy completion to unrelated new work by numeric ID. Rebuilding preserves both views.
