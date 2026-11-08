---
id: "EPIC-023"
title: "Optional analytics and commercial validation"
type: "epic"
status: "backlog"
phase: "Should · Extensions"
depends_on: ["EPIC-015", "EPIC-019", "EPIC-020"]
prd_requirements: ["PRD §17, §19", "Realtime §12"]
risk: "medium"
assignee: "Unassigned"
priority: "Should"
baseline: "PRD v2.0"
summary: "Validate restaurant adoption and optional operational analytics without presuming a monetization model."
---

# EPIC-023 — Optional analytics and commercial validation

## Objective

Validate restaurant adoption and optional operational analytics without presuming a monetization model.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §17, §19; Realtime §12.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Should · Should · Extensions. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Define daily bookings, no-show, hold conflicts and staff-time measurement from actual events
- Separate product analytics from operational error metrics
- Capture controlled 3–5 restaurant pilot learning and willingness-to-pay questions
- Compare commission, SaaS and hybrid options without implementing unapproved billing

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Architecture suitability does not validate restaurant demand or revenue
- Analytics is Should Have; subscription billing/loyalty are Future
- Dine cannot prevent conflicts from unrecorded off-platform bookings
- Metrics must define grain, timezone, inclusion and privacy; no invented baseline results

## Data and API changes

Define read-only event-based aggregates and minimal consented pilot feedback data. No speculative financial/subscription ledger is authorized.

Analytics endpoints and export permissions are optional design contracts, not finalized core routes.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Agree pilot questions and accountable product owner
- [ ] T02 Define event metric grain and restaurant-local reporting windows
- [ ] T03 Design tenant-scoped optional analytics queries
- [ ] T04 Record willingness-to-pay and external-booking workflow evidence
- [ ] T05 Keep revenue model decision separate from gateway deposit flow

## Acceptance criteria

- [ ] No payment/booking metric is reported without source/definition
- [ ] Restaurant analytics is tenant-scoped and privacy-safe
- [ ] Commission/SaaS/hybrid remains a hypothesis until validated
- [ ] Pilot captures off-platform recording limitations
- [ ] Billing implementation is not implied by choosing deposit mode

## Required verification

- Aggregate reconciliation against synthetic event totals
- Restaurant-local date boundary and export scope checks
- Product review of pilot assumptions and actual feedback

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-015, EPIC-019, EPIC-020.

Optional analytics and commercial assumptions have explicit evidence and decision owners.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
