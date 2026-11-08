---
id: "EPIC-019"
title: "Platform support, audit and privacy"
type: "epic"
status: "backlog"
phase: "B onward · Cross-cutting"
depends_on: ["EPIC-004"]
prd_requirements: ["PRD §3.4, §15.3–15.4", "SQL §3.3, §5", "Diagram 1"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Preserve immutable evidence and constrained support operations for booking, financial and tenant incidents."
---

# EPIC-019 — Platform support, audit and privacy

## Objective

Preserve immutable evidence and constrained support operations for booking, financial and tenant incidents.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD §3.4, §15.3–15.4; SQL §3.3, §5; Diagram 1.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · B onward · Cross-cutting. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- Transactional actor/request/reason audit envelope on privileged changes
- Platform onboarding, dispute investigation and failure support boundaries
- PII/token/OTP/payment payload redaction and least-privilege data access
- Retention/deletion rules and immutable correction history

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Every inventory-critical mutation has required audit evidence in its transaction
- Support cannot bypass exclusion constraints or reclaim a new customer claim for a late payer
- Role-based support access is scoped and reasoned; no shared client admin secrets
- Retention/deletion periods are not specified by sources and require product/legal decisions

## Data and API changes

audit_logs and support interventions with immutable resource/restaurant/actor/request metadata. Supplied SQL does not include audit table definitions; design append-only permissions and erasure/evidence handling.

Platform admin/support/audit contracts need explicit DTOs/RBAC and export scope; no ad-hoc SQL support bypass.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Define audit event coverage and immutable envelope
- [ ] T02 Integrate audit into each transactional writer
- [ ] T03 Define scoped support trace/intervention contracts
- [ ] T04 Set redaction/minimization and retention decision register
- [ ] T05 Test support ownership and preserved historical evidence

## Acceptance criteria

- [ ] Critical booking/payment/block/staff actions have actor, request and reason
- [ ] Rolled-back mutation does not leave misleading success evidence
- [ ] Support cannot read/export foreign scope without explicit privilege
- [ ] Secrets/OTP/private payment values are redacted from logs
- [ ] Financial evidence retention and deletion policy are resolved before production

## Required verification

- Audit completeness across accepted/denied/rolled-back operations
- Support access/export negative tests
- Seeded secret-redaction and retention policy checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-004.

Baseline audit controls apply before the first mutation; production privacy/support gates remain explicit.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
