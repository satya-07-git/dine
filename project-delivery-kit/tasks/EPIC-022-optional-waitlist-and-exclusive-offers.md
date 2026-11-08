---
id: "EPIC-022"
title: "Optional waitlist and exclusive offers"
type: "epic"
status: "backlog"
phase: "Should · Extensions"
depends_on: ["EPIC-010", "EPIC-012", "EPIC-014", "EPIC-016"]
prd_requirements: ["PRD §17 Should Have", "Finalized scope classification"]
risk: "high"
assignee: "Unassigned"
priority: "Should"
baseline: "PRD v2.0"
summary: "Keep waitlist as optional scope with explicit new claim/state contracts instead of inheriting old mandatory waitlist architecture."
---

# EPIC-022 — Optional waitlist and exclusive offers

## Objective

Keep waitlist as optional scope with explicit new claim/state contracts instead of inheriting old mandatory waitlist architecture.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §17 Should Have; Finalized scope classification.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Should · Should · Extensions. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Define table/interval/party queue eligibility and FIFO fairness if pilot selects waitlist
- Design exclusive offer allocation compatible with HELD/RESERVED/BLOCKED claims
- Explicit accept/decline/expiry, no automatic customer charge
- Promote only safely released inventory and retain late-payment compensation rules

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Waitlist is Should Have in new PRD, not a prerequisite of core v2 release
- Do not add legacy OFFER_HELD state into finalized SQL without reviewed design
- An offer must identify a real protected claim and owner; notification is not consent
- No default offer timeout or fairness extension is newly approved by final sources

## Data and API changes

Queue/offer schema and offer-to-hold ownership do not exist in finalized SQL; design or explicitly extend core state contract before implementation. Prior waitlist code is reusable candidate only after compatibility validation.

Waitlist routes are not in finalized core catalog; propose/version optional routes only after feature acceptance.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Decide pilot inclusion and offer/queue rules
- [ ] T02 Design claim/hold mapping without conflicting enum histories
- [ ] T03 Specify optional queue/offer APIs and ownership
- [ ] T04 Implement serialized exclusive promotion if approved
- [ ] T05 Verify accept/expiry and late-payment race isolation

## Acceptance criteria

- [ ] Core backend can release without enabling waitlist
- [ ] Queue/offer claim model is approved before migration
- [ ] Concurrent promotion yields one protected exclusive offer
- [ ] Customer explicitly accepts and is never automatically charged
- [ ] Late payer cannot reclaim an offered/assigned table

## Required verification

- Optional dual-promoter and accept/expiry races
- Offer owner and restaurant IDOR tests
- Feature-disabled core flow regression

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-010, EPIC-012, EPIC-014, EPIC-016.

Unscheduled optional work until pilot inclusion and claim contract are reviewed.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
