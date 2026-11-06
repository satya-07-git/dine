---
id: "EPIC-019"
title: "Backend verification, staging and release gates"
type: "epic"
status: "backlog"
phase: "H · Release"
depends_on: ["EPIC-005", "EPIC-008", "EPIC-011", "EPIC-012", "EPIC-013", "EPIC-014", "EPIC-017", "EPIC-018"]
prd_requirements: ["Blueprint §14.3", "Blueprint §15", "Blueprint §16", "Blueprint §17", "Blueprint §18.3", "Blueprint §19"]
risk: "high"
assignee: "Unassigned"
summary: "Prove the complete backend slice and critical invariants on staging before any commercial rollout."
---

# EPIC-019 — Backend verification, staging and release gates

## Objective

Prove the complete backend slice and critical invariants on staging before any commercial rollout.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 14.3, 15, 16, 17, 18.3, 19. Delivery stage: H · Release. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Unit tests for policy/interval/state/refund decisions
- Real PostgreSQL constraints, RLS, idempotency and concurrent transaction suites
- NestJS + gateway inbox + worker integration scenarios
- API-driven multi-session booking, payment recovery, offer and owner dry-run
- Load/security/recovery gates, measured results and release observation

## Out of scope

Claiming dashboard rendering proves backend correctness, frontend implementation and automatic live-money rollout.

## Business rules

- Each epic completion requires actual implementation and command/scenario evidence
- 100-client overlap test must produce at most one protected allocation
- Staging release requires signed webhook verification, replay controls, approved policies, refunds/reconciliation, monitoring and audit
- Real-money processing additionally requires current provider/merchant requirements and operational approval
- Packages/reviews require their pilot scope gates only if included; later extensions are not MVP blockers

## Data and API changes

Use synthetic multi-tenant fixtures with overlapping/adjacent dining ranges, pending/review/captured payments, duplicate events and competing waiters. CI replays fresh SQL migrations.

Exercise actual /v1 routes and private event authorization. API tests substitute for app UI at this backend-only stage; future two-mobile-session QA remains a frontend handoff gate.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Include direct-call IDOR, JWT, staff role, RLS, resource list and private channel checks. Keep test credentials separate and redact evidence.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Create acceptance matrix linked to owning epic and source section
- [ ] T02 Automate DB concurrency and idempotency races
- [ ] T03 Replay payment lateness/duplicate/reorder/network-loss cases
- [ ] T04 Verify two queue promoters and owner/walk-in conflict paths
- [ ] T05 Run secrets/rate-limit/restore/load checks
- [ ] T06 Record staging go/no-go and observation/recovery owner

## Acceptance criteria

- [ ] 100 concurrent overlapping holds yield at most one protected allocation
- [ ] Adjacent intervals, buffers and blocked ranges produce expected results
- [ ] Webhook replay and late capture cannot double-confirm or steal inventory
- [ ] Two waitlist workers create one exclusive offer
- [ ] Cross-restaurant/customer access and private-topic joins are denied
- [ ] Lost realtime and reconnect/refetch yield canonical state
- [ ] Fresh migrations, backup restore and focused CI pass with recorded evidence
- [ ] No live payment release before all commercial gates are approved

## Required verification

- Run every critical scenario from blueprint §17.1 with deterministic assertions
- Record test command, environment, commit, result, failures and limitations
- Perform staging end-to-end: hold → payment outcome → safe release/offer → staff service update
- Re-run only affected suites after fixes and preserve release evidence

## Dependencies and execution gate

Prerequisites: EPIC-005, EPIC-008, EPIC-011, EPIC-012, EPIC-013, EPIC-014, EPIC-017, EPIC-018.

All backend release gates pass with evidence; live money remains a separate authorized operational step.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- A plan or unchecked acceptance box is not test evidence
- Staging test mode cannot establish production settlement behavior

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
