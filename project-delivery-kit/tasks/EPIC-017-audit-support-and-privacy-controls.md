---
id: "EPIC-017"
title: "Audit, support and privacy controls"
type: "epic"
status: "backlog"
phase: "B onward · Cross-cutting"
depends_on: ["EPIC-003"]
prd_requirements: ["Blueprint §1.2", "Blueprint §4", "Blueprint §5.2", "Blueprint §9", "Blueprint §13.3", "Blueprint §14.2", "Blueprint §19.2"]
risk: "high"
assignee: "Unassigned"
summary: "Preserve evidence for state changes, payment incidents and privileged actions while minimizing personal data."
---

# EPIC-017 — Audit, support and privacy controls

## Objective

Preserve evidence for state changes, payment incidents and privileged actions while minimizing personal data.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 4, 5.2, 9, 13.3, 14.2, 19.2. Delivery stage: B onward · Cross-cutting. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Transactional immutable actor/request/restaurant/resource/reason audit convention
- Support traces across hold, booking, payment attempt, gateway event, offer and refund
- Controlled support interventions with immutable history
- Personal-data minimization, deletion/retention policy and safe operational logs
- Audited owner policy/layout/membership and exceptional payment actions

## Out of scope

Unlogged production SQL fixes, shared admin secrets and an unspecified legal retention schedule.

## Business rules

- Business mutation and its required audit evidence commit together
- Do not rewrite status/payment history to conceal corrections
- Platform support rights are scoped, justified and recorded
- Avoid raw personal/payment secrets in logs and exports
- Deletion and evidence retention conflict must be resolved before production, not by arbitrary cascading deletes

## Data and API changes

audit_logs; booking_status_events; payment_events; refunds; notification_deliveries with correlation IDs. Define append-only enforcement, access, redaction and retention boundaries.

GET /bookings/:id/events serves own scoped history. Support/audit search/export/intervention routes are not specified; define least-privilege contracts before implementation.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Customer reads own safe history; restaurant operators read only permitted operational evidence; support access requires explicit privilege and audit. No cross-tenant list/export bypass.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Define audit envelope and shared transactional helper
- [ ] T02 Map required audit events across feature epics
- [ ] T03 Define controlled support access and reason requirements
- [ ] T04 Set log redaction and data-retention/deletion decisions
- [ ] T05 Specify incident trace and evidence export boundaries

## Acceptance criteria

- [ ] Each critical booking/payment/owner transition has actor and request correlation
- [ ] Rejected unauthorized actions cannot mutate protected business state
- [ ] Support intervention preserves prior evidence and records reason
- [ ] Private secrets do not appear in logs or customer history
- [ ] Retention/deletion policy is approved before production release

## Required verification

- Inspect audit evidence after successful and rolled-back transactions
- Exercise foreign-tenant support/read/export denial
- Seed synthetic sensitive values and verify redaction
- Test deletion policy against immutable financial/booking references once approved

## Dependencies and execution gate

Prerequisites: EPIC-003.

Audit requirements apply from the first mutation; support/privacy release controls are verified.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- History loss prevents recovery and dispute investigation
- Elevated support credentials can bypass normal RLS without application scoping

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
