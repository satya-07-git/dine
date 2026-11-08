---
id: "EPIC-021"
title: "Backend acceptance, concurrency and pilot gates"
type: "epic"
status: "backlog"
phase: "G · Hardening & pilot"
depends_on: ["EPIC-007", "EPIC-011", "EPIC-014", "EPIC-015", "EPIC-017", "EPIC-019", "EPIC-020"]
prd_requirements: ["PRD §16, §18.6, §20", "Realtime §10"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Validate the complete finalized backend with real PostgreSQL races, financial failure recovery and controlled restaurant UAT."
---

# EPIC-021 — Backend acceptance, concurrency and pilot gates

## Objective

Validate the complete finalized backend with real PostgreSQL races, financial failure recovery and controlled restaurant UAT.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §16, §18.6, §20; Realtime §10.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · G · Hardening & pilot. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- PRD C-001–C-006 plus manual/automatic race and idempotent free confirmation
- NestJS/real DB/provider-adapter/worker/Socket.IO integration verification
- k6 load with environment-specific latency/availability/event measurements
- Authorization/security/backup/chaos checks and recorded go/no-go
- Frontend integration and two-mobile-session customer journey remains a later required product-pilot gate

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Exactly one conflicting active claim must succeed for 100 valid simultaneous requests, not merely at most one if all fail
- An in-memory mutex or mock repository cannot establish PostgreSQL concurrency correctness
- Never use plan metadata or old completed reports as fresh v2 test evidence
- No real-money pilot before provider/merchant, refund and policy gates are approved
- Backend-only completion does not claim React Native/staff UI/UAT has passed

## Data and API changes

Synthetic multi-tenant fixtures including active/expired claims, blocks, unknown/late payments and captured-before-crash operations. Test fresh and existing-data upgrade paths.

Exercise canonical /api/v1 catalog and Socket.IO joins/recovery directly. Preserve old API compatibility tests if aliases are supported.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Create source-to-test acceptance matrix
- [ ] T02 Run 100-client hold and manual/auto/staff/block races
- [ ] T03 Replay payment duplicates/late/unknown/crash/refund cases
- [ ] T04 Verify scope, OTP/session abuse and room access matrix
- [ ] T05 Measure SLOs and rehearse DB/Redis/worker recovery
- [ ] T06 Record backend staging gate and future client/pilot handoff

## Acceptance criteria

- [ ] C-001–C-006 pass with real database constraints and separate connections
- [ ] 100 valid conflicting attempts give exactly one winner and no duplicate active reservation
- [ ] Adjacent ranges and buffer blocking produce expected results
- [ ] Free confirmation retries and duplicate gateway events are repeat-safe
- [ ] Crash after capture resolves without duplicate booking or lost money tracking
- [ ] Cross-tenant operations/room joins fail
- [ ] Disconnected client restores authoritative booking state
- [ ] Latency targets and restore results have environment/command/evidence
- [ ] Frontend-dependent UAT and commercial gates remain visible until actually verified

## Required verification

- Unit policy/scoring/state suites plus database FK/exclusion suite
- Supertest REST + Socket.IO integration and signed webhook tests
- k6 contention/SLO and deterministic crash/recovery scenarios
- Restaurant operational acceptance run with synthetic users and controlled pilot data

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-007, EPIC-011, EPIC-014, EPIC-015, EPIC-017, EPIC-019, EPIC-020.

Backend evidence passes; full pilot still requires client integration/UAT and explicit real-money operational approval.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
