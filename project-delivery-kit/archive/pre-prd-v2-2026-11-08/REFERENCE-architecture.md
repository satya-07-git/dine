---
id: "architecture"
title: "Architecture and module ownership"
---
# Dine backend architecture

Source: Blueprint §1–4, §15 and §18. This is the planned architecture, not a deployed system. Product frontend is deferred; customer/restaurant clients appear only to explain backend contracts.

## System context

Customer / Restaurant client → NestJS REST /v1 → PostgreSQL system of record.

Supabase Auth → verified JWT → API resource ownership / restaurant membership checks.

Razorpay → signature-validated webhook → durable inbox → payment application service.

Booking transaction → booking + allocation + history + outbox → commit → asynchronous worker → private Supabase Broadcast / configured push and in-app notification adapters.

Clients receiving an event or reconnecting must refetch canonical REST state. Optional maps and notification providers are replaceable adapters. Gateway callbacks cannot independently override inventory.

## Architecture decision

| Option | Benefit | Cost / decision |
| --- | --- | --- |
| Traditional monolith | Fast setup | Weak module boundaries; prototype only |
| Modular monolith | One deployable, clear ownership, same-DB ACID | Selected; enforce interfaces and repository ownership |
| Microservices | Independent deployment/scaling | Distributed failure and consistency overhead; defer |
| Functions only | Bounded infrastructure | Fragments critical booking workflow; integrations only |
| Event-driven microservices | Flexible asynchronous pipelines | Consider only after proven scale |

## Stack from the blueprint

| Layer | Selected technology | Boundary |
| --- | --- | --- |
| API | NestJS + TypeScript + OpenAPI REST | One modular deployable |
| Database | Supabase PostgreSQL + PostGIS | Authoritative inventory and spatial search |
| Data access | Drizzle typed queries + explicit SQL | SQL migrations are the only schema history |
| Identity | Supabase Auth, JWT, RBAC and RLS | Verify JWT plus resource/membership access |
| Payments | Razorpay test mode first | Live money requires separate release gates |
| Realtime | Supabase private Broadcast | Authorized hints; REST remains truth |
| Async | Transactional outbox worker + pg_cron | Bounded retries, reconciliation and safe expiry |
| Monitoring | Structured logs, metrics and Sentry | Correlate customer, hold, order and attempts |
| Future clients | React Native, Expo, TypeScript | Explicitly deferred from this work |

## In-process module ownership

| Source module | Owns | Delivery epic |
| --- | --- | --- |
| Identity & Access | Profiles, role memberships, JWT authorization | EPIC-003 |
| Restaurant | Profiles, hours, policies, closures | EPIC-004 |
| Discovery | Location, cuisine and search | EPIC-005 |
| Floor Plan | Floors, stable tables and versioned geometry | EPIC-006 |
| Availability | Interval eligibility and blocked periods | EPIC-007 |
| Reservation | Holds, confirmation, cancellation, expiry and invariants | EPIC-008, EPIC-009 |
| Payment | Gateway orders, inbox, reconciliation and refunds | EPIC-010, EPIC-011 |
| Waitlist | Eligible FIFO, exclusive offers, expiry/promotion | EPIC-012 |
| Booking Status | Guarded transitions and append-only history | EPIC-009, EPIC-013 |
| Notifications | Outbox, adapters and delivery attempts | EPIC-013 |
| Dining Experiences | Packages, party options and limits | EPIC-015 |
| Customer Engagement | Favorites, eligible reviews and preferences | EPIC-016 |
| Owner Operations | Walk-ins, check-in, closures and layout edits | EPIC-014 |
| Audit & Support | Transition evidence and privileged interventions | EPIC-017 |

## Internal layering

```text
HTTP controller + request DTO validation
  → Application service / use-case orchestration
    → Domain policy + state transition validator
      → Repository + PostgreSQL transaction
        → Booking + allocation + history + audit + outbox
COMMIT
  → Async worker
    → Realtime / notification / integration adapter
```

Modules call published application interfaces. No module casually edits another module's owned tables. Cross-module transactions remain possible within one database through explicit orchestration. Never call external providers while holding inventory row locks.

## Non-negotiable invariants

- A physical table has no two protected allocations with overlapping dining ranges.
- The backend owns booking, payment and hold validity; clients request actions only.
- An uncertain payment outcome must be reconciled before safe reallocation or compensated after an approved safe-release path.
- Waitlist offers protect inventory exclusively and require explicit acceptance; never auto-charge.
- Staff are scoped to assigned restaurants; customers are scoped to their own private resources.
- Staff or trusted integrations produce operational statuses; there are no invented occupancy sensors.
- Critical state changes and interventions leave durable audit evidence.

## ADR register

| ID | Decision |
| --- | --- |
| ADR-001 | Modular monolith over microservices |
| ADR-002 | PostgreSQL is booking system of record |
| ADR-003 | One physical table per reservation in MVP |
| ADR-004 | Restaurant-configurable free/deposit policy |
| ADR-005 | Exclusive waitlist offers, never automatic charge |
| ADR-006 | Realtime projection reconciles against database/REST |
| ADR-007 | Agile iterative/incremental SDLC with Spiral-inspired risk review |

## Repository proposed by the source

```text
dine/
  apps/api/src/
    main.ts
    common/                  # auth, errors, logging, db
    modules/
      identity/ restaurants/ discovery/ floor-plans/
      availability/ reservations/ payments/ waitlist/
      booking-status/ notifications/ owner-operations/
  packages/contracts/        # request/response DTOs and shared types
  supabase/migrations/       # sole SQL schema history
  supabase/seed.sql
  supabase/tests/
  tests/integration/
  tests/concurrency/
  docs/adr/
  project-delivery-kit/tasks/ # this plan and dashboard
```

The application folders above are a proposed implementation layout; this delivery creates the planning kit only. Dining-experience and engagement modules can be added inside the same boundaries when their detailed contracts are agreed. apps/mobile remains deferred.
