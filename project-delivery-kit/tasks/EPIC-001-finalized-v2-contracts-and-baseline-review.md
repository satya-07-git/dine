---
id: "EPIC-001"
title: "Finalized v2 contracts and baseline review"
type: "epic"
status: "completed"
phase: "A · Architecture"
depends_on: []
prd_requirements: ["Final decisions", "PRD §2, §6, §17–21", "SQL §3.3", "Realtime §8"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Adopt the finalized decisions, preserve prior delivery evidence and define the v2 compatibility/revalidation plan."
---

# EPIC-001 — Finalized v2 contracts and baseline review

## Objective

Adopt the finalized decisions, preserve prior delivery evidence and define the v2 compatibility/revalidation plan.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: Final decisions; PRD §2, §6, §17–21; SQL §3.3; Realtime §8.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · A · Architecture. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Record latest source precedence, fixed product choices and one-table MVP
- Compare existing /v1, table_allocations and Supabase projections to /api/v1, inventory_claims and Socket.IO
- Freeze hold/free/deposit/claim/booking/payment state mappings and recovery outcomes
- Classify Must, Should and Future scope; record financial and operational decisions still open

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Latest user finalization overrides older recommendations; attached PRD header is v1.0, current baseline is labeled v2.0
- Manual and deterministic automatic selection are both required by the latest decision
- FREE or DEPOSIT is selected by restaurant policy, never by a customer bypass
- Dine guarantees internal inventory consistency only; staff must record walk-ins/phone/external bookings
- One table per booking is the current design; multi-table scope remains deferred
- No historical completed checkbox proves the changed v2 requirement

## Data and API changes

Produce compatibility map, entity/state/route decisions, policy snapshot rules and migration authority ADR. Preserve previous epic bodies and completion reports in the versioned archive.

Adopt /api/v1 and the supplied finalized API catalog; document old aliases/deprecation rather than silently changing deployed clients.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [x] T01 Index the three text sources and four diagrams with SHA-256 provenance
- [x] T02 Record fixed choices, source conflicts and missing production controls
- [x] T03 Map existing modules/migrations/contracts to v2 capabilities
- [x] T04 Define canonical state matrix and source route aliases
- [x] T05 Agree first database-hold-concurrency milestone and v2 completion evidence

## Acceptance criteria

- [x] The active plan references the finalized sources, not superseded Blueprint § IDs
- [x] Manual/automatic, FREE/DEPOSIT, PostgreSQL authority and Socket.IO recovery are explicit
- [x] 120-second initial hold has no implicit payment extension
- [x] Every legacy completed report is preserved and clearly separate from v2 readiness
- [x] Open cancellation/refund/capture/no-show/retention policies have accountable roles and release gates

## Required verification

- Trace each v2 decision to source and owning epic
- Review expired-hold/unknown-payment/crash scenarios against one state matrix
- Check the migration plan does not run CREATE TABLE baseline over existing tables

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

No prerequisite epic.

V2 contracts reviewed; unresolved financial policies block their own implementation/release paths.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

Completed. Completion confirmed by the user in this chat; status corrected on 08 November 2026.

The prior v2 rebaseline incorrectly reset this completed architecture/contracts epic to backlog. Its implementation-task and acceptance checklists now reflect the user's completion confirmation. Supporting planning artifacts include SOURCE-REGISTER.md, the finalized architecture/database/API/workflow references and the archived prior completion evidence.

This status correction does not claim that additional backend runtime, database concurrency, payment or production verification was performed in this turn. Other epic statuses are unchanged.
