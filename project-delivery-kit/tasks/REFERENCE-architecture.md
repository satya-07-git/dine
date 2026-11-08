---
id: "architecture"
title: "Finalized v2 architecture and module ownership"
---
# Finalized v2 backend architecture

Sources: latest finalized user decisions; PRD §8/21; supplied SQL baseline §3–6; realtime supplement §7–12; Diagram 1. Version precedence and untouched source copies are listed in SOURCE-REGISTER.md. This view is the target design; current runtime conformance is not established by this planning task.

## Fixed product and architecture decisions

| Decision | Final specification | Epic |
| --- | --- | --- |
| Table selection | Manual floor plan + deterministic best-available recommendation | 006, 007–023 |
| Payment | FREE or restaurant-configured DEPOSIT | 004, 009–011 |
| Inventory authority | Dine PostgreSQL; never Redis or WebSocket delivery | 008–008 |
| Backend | NestJS + TypeScript modular monolith | 021–002 |
| Client | React Native + TypeScript, implementation deferred | 020 handoff |
| Realtime | Socket.IO/WebSockets + database-backed event recovery | 013–024 |

## Context and infrastructure

Customer app, restaurant dashboard and platform admin call one canonical REST API. They are future/backend consumers here, not product UIs built in this request.

NestJS verifies sessions/RBAC, evaluates policy, coordinates claims/holds/reservations/payments and commits truth in PostgreSQL. Razorpay processes money; Dine verifies evidence before booking confirmation. Outbox records survive server crashes and feed workers. BullMQ and Redis provide scheduling, cache and fan-out, never exclusive reservation ownership. S3-compatible storage is the selected storage category; provider choice remains open.

## Stack and responsibilities

| Layer | Finalized selection / constraint |
| --- | --- |
| API | NestJS + TypeScript, REST /api/v1, OpenAPI/Swagger |
| Database | PostgreSQL 16+ baseline; pgcrypto, btree_gist and range exclusion |
| Data access | Explicit transactions/raw SQL for inventory; existing Drizzle is a reuse candidate; no unnecessary ORM replacement |
| Authentication | Phone OTP; provider/session design must implement revocation/rotation as applicable |
| Cache and fan-out | Redis; data can be rebuilt from durable truth |
| Jobs | BullMQ with DB-backed recoverable pending work |
| Realtime | Authorized Socket.IO restaurant:{id} and booking:{id} rooms |
| Payments | Razorpay adapter; raw-body webhook signature and financial recovery |
| Storage | S3-compatible adapter; do not assume Supabase Storage is required |
| Validation/tests | DTO validation; Jest/Vitest/Supertest or existing compatible tooling; real PostgreSQL; k6 load |
| Delivery | Docker, one migration history, structured logging, metrics and backups |

## Module ownership

| Target module | Owns / boundary | Epic |
| --- | --- | --- |
| auth / users | Phone OTP, identity, sessions/revocation | 022 |
| restaurant staff / RBAC | Onboarding, membership, manager/staff scope | 003 |
| restaurants / policies | Calendar, duration, buffer, FREE/DEPOSIT snapshot | 004 |
| floor-plans / tables | Stable physical table identity and versioned geometry | 006 |
| discovery | Bounded public search and advisory availability filters | 005 |
| inventory | Exclusive HELD/RESERVED/BLOCKED claims and consistency | 008 |
| availability | Restaurant-local intervals and capacity/range eligibility | 007 |
| holds / idempotency | Atomic acquire/release/expiry and original-result replay | 008 |
| recommendations | Deterministic ranking and bounded automatic fallback | 023 |
| reservations | Free confirmation and separate booking lifecycle | 009 |
| payments | Server orders, verification and gateway inbox | 010 |
| refunds / reconciliation | Unknown/late money and idempotent compensation | 011 |
| restaurant-operations | Check-in, seating, completion, no-show, blocks, manual entries | 014 |
| events / outbox | Same-transaction history, version and recoverable dispatch | 013 |
| realtime | Authenticated rooms, private payloads, resync/replay | 024 |
| notifications | Optional push and reminders behind adapters | 013 |
| admin / audit | Controlled support and immutable evidence | 017 |
| workers / observability | BullMQ, Redis loss recovery, monitoring, restore | 024 |
| verification | Database races, security, financial faults and pilot gates | 019 |
| optional extensions | Waitlist and product analytics | 012–020 |

## Internal layering

```text
HTTP controller + verified actor + DTO validation
  → Application service and cross-module orchestration
    → Domain policy / state machine
      → Repository + short PostgreSQL transaction
        → Claim / hold / reservation / audit / event / outbox
COMMIT
  → Outbox dispatcher / BullMQ workers
    → Socket.IO gateway / notification / payment adapter
```

No unrestricted writes into another module's owned tables. Do external provider calls outside locks, then reacquire/revalidate current state for the final commit. Protect all writers: hold, free confirm, payment finalization, cancellations, walk-ins and operational blocks.

## Internal guarantee and restaurant adoption

Dine prevents conflicts among operations recorded through its inventory engine. A phone reservation, walk-in or external platform booking that staff do not enter in Dine is outside that internal guarantee. Restaurant onboarding and pilot UAT must verify the recording workflow, not promise automatic control over disconnected external systems.

## Existing repository transition

Existing code contains NestJS/Drizzle, supabase/migrations, /v1 routes, table_allocations, Supabase Broadcast contracts and historical completion reports. This task preserves those files and archives the old task dashboard before publishing this v2 target plan. It does not execute migrations or refactor runtime code.

The target source tree proposes apps/api, packages/shared-types + api-contracts + validation, database/migrations + seeds + tests, infrastructure/docker + monitoring, and architecture/API/runbook docs. Select exactly one migration authority during EPIC-002 and map existing data incrementally. Do not start a second competing history or blindly replay CREATE TABLE statements.
