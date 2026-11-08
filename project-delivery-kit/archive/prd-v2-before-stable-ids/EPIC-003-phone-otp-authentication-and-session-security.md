---
id: "EPIC-003"
title: "Phone OTP authentication and session security"
type: "epic"
status: "backlog"
phase: "B · Foundation"
depends_on: ["EPIC-002"]
prd_requirements: ["PRD FR-A01–A05", "PRD §3, §15.3", "SQL §6"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0"
summary: "Provide phone OTP login and revocable authenticated sessions with bounded abuse controls."
---

# EPIC-003 — Phone OTP authentication and session security

## Objective

Provide phone OTP login and revocable authenticated sessions with bounded abuse controls.

## Context and finalized source

Baseline: user-finalized PRD v2.0, 08 November 2026. References: PRD FR-A01–A05; PRD §3, §15.3; SQL §6.

Read SOURCE-REGISTER.md for precedence and attachment/version differences. This is a v2 planning/revalidation epic. Prior implementation evidence is preserved in ../archive/pre-prd-v2-2026-11-08/ and is not automatically proof of v2 conformance. Existing backend code must be inspected and reused where compatible.

## Scope classification

Must · B · Foundation. Epic IDs/dependencies are delivery planning decisions; FR/BR/C identifiers refer to the supplied PRD.

## In scope

- OTP request, verify and logout contracts
- OTP expiry, attempt limits, request throttling, enumeration and brute-force resistance
- Access/session verification and refresh-token rotation/revocation where applicable
- Authentication provider adapter chosen explicitly from v2 requirements

## Out of scope

Product UI implementation and unspecified future features.

## Business rules

- Do not assume existing Supabase JWT verification implements phone OTP flows
- Derive customer identity from verified session, not body userId
- Do not log OTPs/tokens; client secure storage is a future frontend handoff contract
- A revoked or expired session cannot join private rooms or mutate holds

## Data and API changes

users(id,phone,name,created_at); OTP/session challenge and rotation storage must be designed, hashed and expiry-bounded. SQL baseline does not include full authentication schema.

POST /auth/otp/request; POST /auth/otp/verify; POST /auth/logout (PRD §11.1). Refresh route, if needed, requires an explicit contract.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

## Permission and audit requirements

Authenticate the actor and enforce customer ownership, active restaurant membership and resource/action permissions on every direct REST/room operation. Managers receive the explicit configuration rights in PRD §3.3; platform admin interventions require controlled privilege and recorded reason. Append critical mutation history/audit/outbox in the same transaction. Minimize private payloads and redact OTPs, tokens, gateway secrets and personal data.

## Backend contract and frontend handoff

Product frontend remains deferred. Publish validated DTOs, pagination where applicable, request correlation, idempotency/version semantics, and actionable 400/401/403/404/409/410/422/429/503 responses. Future clients treat countdowns and socket events as informational and restore state from authoritative REST after reconnect.

## Implementation tasks

- [ ] T01 Choose OTP provider and session/JWT trust contract
- [ ] T02 Model challenges, expiry, attempt budget and revocation
- [ ] T03 Implement safe request/verify/logout orchestration
- [ ] T04 Add auth and OTP abuse controls
- [ ] T05 Define refresh rotation/reuse handling where applicable

## Acceptance criteria

- [ ] Valid OTP yields a scoped session; wrong/expired/replayed OTP fails
- [ ] Rate/attempt caps limit OTP guessing and sending abuse
- [ ] Logout/revocation prevents subsequent protected calls
- [ ] Secrets/OTP values do not appear in responses or logs
- [ ] Phone enumeration behavior is reviewed and bounded

## Required verification

- Synthetic OTP provider success/failure/timeout/replay tests
- Expired/revoked/forged JWT and refresh reuse tests
- Rate-limit and log-redaction checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Dependencies and execution gate

Prerequisites: EPIC-002.

Phone authentication works through real backend calls with verified expiry/revocation rules.

Security, audit, migration integrity and observability controls apply from the first relevant mutation, even when their dedicated epic appears later.

## Completion report

V2 conformance has not been verified in this planning task. Status is backlog.

Prior baseline completion reports were preserved verbatim in the archive before this rebaseline. This does not state that existing code is absent or that previous tests failed. Reuse compatible code, implement only required deltas and update this report/checkboxes/status together after fresh v2 evidence exists. No backend runtime or database migration is changed by generating this plan.
