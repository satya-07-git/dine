---
id: "EPIC-004"
title: "Restaurant onboarding, staff and tenant RBAC"
type: "epic"
status: "backlog"
phase: "B · Foundation"
depends_on: ["EPIC-003"]
prd_requirements: ["PRD §3, FR-A03–A04, §14", "SQL §3.3", "Diagram 1"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Authorize customer, staff, manager and platform admin actions within verified restaurant ownership."
---

# EPIC-004 — Restaurant onboarding, staff and tenant RBAC

## Objective

Authorize customer, staff, manager and platform admin actions within verified restaurant ownership.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §3, FR-A03–A04, §14; SQL §3.3; Diagram 1.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · B · Foundation. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Restaurant onboarding and platform admin control boundary
- Active restaurant_staff membership with scoped roles and revocation
- Manager control of venue configuration, policy and staff access per finalized PRD
- Customer ownership guards on holds, reservations, payments and room subscriptions

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Manager role may configure restaurant details, layout, hours, deposits and staff permissions under source §3.3
- Customer cannot use staff actions; staff cannot grant platform privileges
- All list/search/export and direct ID reads must enforce tenant scope
- RLS/least-privilege DB access complements application guards; no client access to inventory writes

## Data and API changes

restaurant_staff(id,restaurant_id,user_id,role,status), unique memberships and authorization helpers. This table appears in PRD/ERD but is absent from supplied executable SQL; an additive migration is required.

GET /restaurant-ops/reservations uses scoped membership. Onboarding/staff administration route shapes are not enumerated and must be designed before coding.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define explicit role/action matrix
- [ ] T02 Migrate staff membership and revocation model
- [ ] T03 Implement customer ownership and restaurant guards
- [ ] T04 Define platform onboarding/admin contracts
- [ ] T05 Enforce scope on REST and Socket.IO subscription requests

## Acceptance criteria

- [ ] Staff at A cannot inspect/mutate B reservations or blocks
- [ ] Customer cannot access another customer payment/hold/booking
- [ ] Manager permissions match source; restricted staff cannot edit deposits
- [ ] Revoked staff membership loses write and private-room access
- [ ] Platform interventions have permission and reason/audit evidence

## Required verification

- Two restaurants, multiple roles and guessed resource ID tests
- Direct backend list/detail/mutation authorization tests
- Membership revocation during an active session

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-003.

Tenant and role denial matrix passes; privileged actions have audit hooks.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
