---
id: "EPIC-024"
title: "Future scope and frontend handoff boundaries"
type: "epic"
status: "blocked"
phase: "Later · Definition only"
depends_on: ["EPIC-001"]
prd_requirements: ["PRD §17 Future, §18.5", "Realtime §11–12", "Final one-table decision"]
risk: "high"
assignee: "Unassigned"
priority: "Future"
baseline: "PRD v2.0"
summary: "Keep frontend integration and future capabilities visible while this request remains backend epic planning."
---

# EPIC-024 — Future scope and frontend handoff boundaries

## Objective

Keep frontend integration and future capabilities visible while this request remains backend epic planning.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §17 Future, §18.5; Realtime §11–12; Final one-table decision.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Future · Later · Definition only. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Document React Native TypeScript customer app and staff/admin client handoff contracts
- Record multi-table/join/split/POS/dynamic-pricing/loyalty/subscription/forecasting/AI as Future
- Preserve one-table-per-booking constraints until new product contract
- Define explicit future review gates for payment-processing leases and external inventory integrations

## Out of scope

All future-feature implementation and product frontend coding.

## Business rules

- No app/staff UI code is implemented in this dashboard task
- Source roadmap weeks 8–9 client integration is a later phase, not completed backend work
- A future payment lease requires explicit duration, gateway-timeout and expiry policy
- Multi-table acquisition needs deterministic lock order and atomic multi-claim capacity rules
- External reservations are protected only when recorded or integrated into Dine

## Data and API changes

No new speculative production tables/routes. Future designs require source requirements, ownership, migration and invariants review.

Provide typed DTOs, enum/version meanings, countdown serverTime, conflict/expiry/recovery errors and event reconnect behavior to future clients.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Maintain future capability register and frontend handoff checklist
- [ ] T02 Describe multi-table and payment-lease prerequisite decisions
- [ ] T03 Define review criteria for POS/external booking integration
- [ ] T04 Record client end-to-end/UAT gate without scheduling UI implementation here

## Acceptance criteria

- [ ] Future work is not a mandatory dependency of core release
- [ ] Frontend handoff includes manual/auto, FREE/DEPOSIT, conflict/expiry and reconnect semantics
- [ ] No UI implementation or production result is falsely claimed
- [ ] Multi-table/POS/billing/AI stays blocked pending new requirements

## Required verification

- Check dependency graph for future-only prerequisites
- Review handoff against canonical API/state/event references
- Review proposed future changes against inventory/payment/tenant invariants

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-001.

Blocked for future scope definition; React Native implementation remains deferred by user scope.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is blocked.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
