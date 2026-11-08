---
id: "EPIC-002"
title: "NestJS, PostgreSQL and delivery foundation"
type: "epic"
status: "backlog"
phase: "B · Foundation"
depends_on: ["EPIC-001"]
prd_requirements: ["PRD §8, §18, §21", "SQL §3.2", "Realtime §11"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Prepare the modular monolith and repeatable PostgreSQL 16+ delivery foundation while preserving existing backend data."
---

# EPIC-002 — NestJS, PostgreSQL and delivery foundation

## Objective

Prepare the modular monolith and repeatable PostgreSQL 16+ delivery foundation while preserving existing backend data.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §8, §18, §21; SQL §3.2; Realtime §11.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · B · Foundation. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Inspect existing NestJS/Drizzle modules and reuse suitable components
- Docker local PostgreSQL, Redis and worker configuration with readiness checks
- One authoritative migration chain, seeds and fresh-install/upgrade CI
- Typed DTOs, validation, standard errors, request IDs, OpenAPI and provider interfaces

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- PostgreSQL is booking authority; Redis accelerates cache/jobs/fan-out only
- Final source proposes database/migrations; existing repo uses supabase/migrations—select one through migration ADR, never run two histories
- Raw supplied SQL is a baseline, not a tested production migration
- External provider calls never run while inventory row locks are held

## Data and API changes

Plan pgcrypto and btree_gist extensions; inventory-preserving additive migration/backfill and rollback/forward-recovery design. Prisma/Drizzle was an earlier option; retain existing Drizzle unless reviewed reason requires a switch.

Base /api/v1; health/readiness route details are implementation contracts. Publish versioned OpenAPI from the selected source of truth.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Inventory module and migration dependencies
- [ ] T02 Configure Docker/local services and validated secret-free env example
- [ ] T03 Choose the sole migration history and design upgrade mapping
- [ ] T04 Add DTO/error/OpenAPI/request correlation boundaries
- [ ] T05 Wire fresh and existing-database migration CI

## Acceptance criteria

- [ ] Fresh environment boots with documented commands
- [ ] Upgrade preserves existing bookings, allocations and payment evidence
- [ ] Exactly one schema migration authority is documented
- [ ] Missing dependencies affect readiness without leaking secrets
- [ ] Type/build/database CI evidence is recorded

## Required verification

- Fresh schema replay and seeded upgrade rehearsal on real PostgreSQL
- Transaction rollback and missing-extension checks
- Readiness and invalid-configuration checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-001.

Fresh install and upgrade plan verified before any v2 inventory migration.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
