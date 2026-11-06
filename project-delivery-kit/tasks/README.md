# Dine backend epic delivery plan

Open [dashboard.html](dashboard.html) in a browser. It is a standalone, offline HTML/CSS/JavaScript console using the supplied Clinify dashboard design. This deliverable is a detailed backend plan, not the product frontend or implemented NestJS backend.

## Sources and scope

Scope authority: `/home/sarthaktripathy/Downloads/Dine_Backend_Architecture_System_Design_SDLC.docx`, Technical Design Specification v1.0, 06 November 2026. Section references use the blueprint heading numbers, not guessed document page numbers.

Design/structure reference: `/home/sarthaktripathy/Documents/clinify/clinify/project-delivery-kit/tasks/dashboard-template.html`, its `build_dashboard.py`, README and example epic Markdown files. Only their appearance and epic organization are reused. Clinify domain requirements, existing completion claims and assignees are not Dine requirements. Files in the reference project are unchanged.

Epic IDs, dependency edges, grouped phases and implementation task IDs are planning decisions derived from the source, not formal source requirement IDs. Future timing estimates are intentionally absent because team capacity and detailed contracts are not fixed.

## Contents

- 20 backend epics: 19 backlog, 1 blocked future-definition epic.
- 99 implementation tasks and 101 unchecked acceptance criteria.
- All epics, five-column status board, dependency overview and source decisions.
- Architecture/module map, database/integrity catalog, all 29 source routes, critical workflows and release/risk gates.
- Search across full epic text; filter by stage, epic or status; open linked dependencies and Markdown source.

## Execution and source coverage

| Epic | Outcome | Stage | Blueprint sections |
| --- | --- | --- | --- |
| [EPIC-001](EPIC-001-product-policies-and-architecture-contracts.md) | Product policies and architecture contracts | A · Definition | 1, 2, 9.4, 15, 16.2, 19 |
| [EPIC-002](EPIC-002-repository-database-and-delivery-foundation.md) | Repository, database and delivery foundation | B · Foundation | 2.3, 3, 4.1, 5, 16.2, 18 |
| [EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md) | Identity, memberships and tenant authorization | B · Foundation | 4, 5.2, 12.1, 13 |
| [EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md) | Restaurant profiles, hours and policies | C · Inventory | 1.3, 4, 5.2, 6.2, 9.1, 12.2, 12.4, 19.1 |
| [EPIC-005](EPIC-005-discovery-menus-and-public-media.md) | Discovery, menus and public media | C · Inventory | 1.1, 2.3, 3.1, 4, 5.2, 12.2 |
| [EPIC-006](EPIC-006-versioned-floor-plans-and-table-inventory.md) | Versioned floor plans and table inventory | C · Inventory | 4, 5.2, 6.1, 6.4, 12.2, 12.4, 14.4, 19.1 |
| [EPIC-007](EPIC-007-time-range-availability-and-policy-engine.md) | Time-range availability and policy engine | D · Booking core | 5.3, 5.4, 6, 12.2, 17.1 |
| [EPIC-008](EPIC-008-atomic-holds-idempotency-and-safe-expiry.md) | Atomic holds, idempotency and safe expiry | D · Booking core | 1.2, 5.3, 5.4, 7, 9.4, 16.3, 17.1 |
| [EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md) | Reservation lifecycle and service status | D · Booking core | 1.2, 8, 9.1, 11.1, 12.3, 12.4, 17.1 |
| [EPIC-010](EPIC-010-payment-orders-and-verified-webhook-inbox.md) | Payment orders and verified webhook inbox | E · Payments | 2.3, 7.3, 9.1, 9.2, 12.3, 13.3, 17 |
| [EPIC-011](EPIC-011-payment-review-reconciliation-and-refunds.md) | Payment review, reconciliation and refunds | E · Payments | 1.2, 9.3, 9.4, 10.3, 14.2, 17, 19.1 |
| [EPIC-012](EPIC-012-eligible-waitlist-and-exclusive-priority-offers.md) | Eligible waitlist and exclusive priority offers | F · Waitlist & events | 1.2, 4, 9.4, 10, 12.3, 17.1, 19.1 |
| [EPIC-013](EPIC-013-transactional-events-private-realtime-and-notifications.md) | Transactional events, private realtime and notifications | F · Waitlist & events | 3.3, 4, 11, 14.1, 14.2, 17.1 |
| [EPIC-014](EPIC-014-owner-operations-check-in-and-walk-ins.md) | Owner operations, check-in and walk-ins | G · Restaurant operations | 1.1, 4, 8.2, 12.4, 13.2, 14.4, 16.2, 19.1 |
| [EPIC-015](EPIC-015-dining-experiences-and-package-contracts.md) | Dining experiences and package contracts | G · Restaurant operations | 1.1, 4, 12.2, 16.2 |
| [EPIC-016](EPIC-016-favorites-reviews-and-customer-preferences.md) | Favorites, reviews and customer preferences | G · Restaurant operations | 1.1, 4, 16.2 |
| [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) | Audit, support and privacy controls | B onward · Cross-cutting | 1.2, 4, 5.2, 9, 13.3, 14.2, 19.2 |
| [EPIC-018](EPIC-018-background-jobs-observability-and-recovery.md) | Background jobs, observability and recovery | B onward · Cross-cutting | 2.3, 14, 16.2, 18.3, 19.2 |
| [EPIC-019](EPIC-019-backend-verification-staging-and-release-gates.md) | Backend verification, staging and release gates | H · Release | 14.3, 15, 16, 17, 18.3, 19 |
| [EPIC-020](EPIC-020-future-extensions-and-unresolved-scope-definition.md) | Future extensions and unresolved scope definition | Later · Needs definition | 1.3, 2.1, 19.1, 20.3 |

## Execution order and MVP boundary

The source roadmap phases 0–10 map to this plan as follows:

| Blueprint increment | Epic capabilities | Exit gate |
| --- | --- | --- |
| 0 Definition | 001 | Policies, ERD, API and risk map agreed |
| 1 Foundation | 002, foundational 017/018 | Fresh migrations, API boot, CI |
| 2 Auth | 003 | Direct cross-tenant access denied |
| 3 Inventory | 004–006 | Real geometry and safe versions |
| 4 Availability | 007 | Correct full-range/timezone/buffer eligibility |
| 5 Atomic holds | 008 | At most one concurrency winner |
| Lifecycle prerequisite | 009 | Guarded free/paid/service transition matrix |
| 6 Payment | 010–011 | Signed inbox plus duplicate/late/review/refund cases |
| 7 Waitlist | 012 | One exclusive eligible offer, no automatic charge |
| 8 Realtime | 013 | Private durable event and reconnect reconciliation |
| 9 Operations | 014–016 as agreed for pilot | Restaurant dry-run; package/review contracts resolved if included |
| 10 Release QA | 019 plus completed 017/018 controls | Staging gates and recoverability verified |
| Explicit later extensions | 020 | New scope approval, not a first-release dependency |

First vertical slice: 001 → 002 → 003 → 004 → 006 → 007 → 008. An authenticated user acquires a real DB hold; a second user requesting the same table/range gets 409. Add payments and waitlist only after this proof. Discovery is part of the pilot but not necessary to prove the concurrency invariant.

The source MVP is one physical table per reservation with restaurant-defined duration/buffer, test deposits, table-specific waitlist and staff-managed service state. Dining experiences and engagement are named modules in the source operations stage, but detailed fields and policies are incomplete; their epics make definition gates explicit. Joined tables, POS, variable seating, advanced pricing, demand optimization and multi-location analytics remain later.

Security, audit, SQL migration replay and safe transaction behavior apply from the first mutation. EPIC-017 and EPIC-018 are cross-cutting; their placement is not permission to delay these controls. Dependency edges describe capability readiness and must not be read as a fixed sprint schedule.

## Full source traceability

| Blueprint section | Dashboard / epics |
| --- | --- |
| 01 Product scope and invariants | 001, 008–014, 020; Architecture / Decisions |
| 02 Architecture alternatives | 001–002; Architecture |
| 03 Context and architecture | 002, 010, 013; Architecture / Workflows |
| 04 Module ownership | 003–018; Architecture module map |
| 05 Database and integrity | 002–013, 017; Database |
| 06 Table selection and availability | 004, 006–008; Database / Workflows |
| 07 Atomic hold engine | 008; Workflows / Database |
| 08 Reservation state machine | 009, 014; Workflows |
| 09 Payments and reconciliation | 001, 010–011; Workflows / Decisions |
| 10 Smart waitlist | 012; Workflows |
| 11 Realtime status | 009, 013; Workflows / Architecture |
| 12 REST API | 003–016; API catalog |
| 13 Identity, tenancy and security | 003, 017, 019; Decisions role matrix |
| 14 Reliability and operations | 018–019; Decisions playbook / gates |
| 15 Development model | 001, 019; Workflows |
| 16 Implementation roadmap | 001–019; this roadmap / Epic overview |
| 17 Testing and acceptance | Every epic verification; 019; Decisions matrix |
| 18 Repository and delivery | 002, 018–019; Architecture / this README |
| 19 Open decisions and risks | 001, 011, 015–020; Decisions |
| 20 References, diagrams and status | Reference links / workflow redraws / honest completion reports |

## Regenerate the dashboard

Run from any working directory:

```bash
python3 /home/sarthaktripathy/Documents/dine/project-delivery-kit/tasks/build_dashboard.py
```

Or from this repository root:

```bash
python3 project-delivery-kit/tasks/build_dashboard.py
```

No package install, Python dependency, server, build tool, CDN or API key is needed. `dashboard.html` embeds the epic and reference contents. Open it directly. Markdown source links point to sibling files, so keep the task folder together. Search/filter/modal behavior works offline.

`dashboard-template.html` owns the HTML, inline CSS and inline JavaScript. `build_dashboard.py` parses JSON-compatible frontmatter and validates metadata/dependencies before embedding content. Edit the Markdown source, then rebuild and refresh. Do not edit generated dashboard data by hand.

Optional local browser preview from the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/project-delivery-kit/tasks/dashboard.html`.

## Status and completion workflow

Statuses: `backlog`, `ready`, `in_progress`, `blocked`, `completed`. All assignees start `Unassigned`. Mark ready only after that capability's prerequisites and required decisions are verified. Update frontmatter and the Completion report together; check acceptance boxes only after real evidence exists. Record changed code/migrations, commands, observed results, environment and remaining limitations.

This is a read-only generated repository snapshot. The status filters/board do not update Markdown, Git or local storage. Refresh reloads the generated HTML; it does not run the Python builder. No NestJS code, production database migration, payment integration or production verification is claimed by this planning deliverable.

Keep all patient/clinical/Convex-specific instructions from the design reference out of Dine implementation. The chosen backend remains NestJS/PostgreSQL as the Dine source specifies.
