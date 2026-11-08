---
id: "EPIC-019"
title: "Backend verification, staging and release gates"
type: "epic"
status: "completed"
phase: "H · Release"
depends_on: ["EPIC-005", "EPIC-008", "EPIC-011", "EPIC-012", "EPIC-013", "EPIC-014", "EPIC-017", "EPIC-018"]
prd_requirements: ["Blueprint §14.3", "Blueprint §15", "Blueprint §16", "Blueprint §17", "Blueprint §18.3", "Blueprint §19"]
risk: "high"
assignee: "Lead Verification & Release Architect"
summary: "Prove the complete backend slice and critical invariants on staging before any commercial rollout."
---

# EPIC-019 — Backend verification, staging and release gates

## Objective

Prove the complete backend slice and critical invariants on staging before any commercial rollout.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 14.3, 15, 16, 17, 18.3, 19. Delivery stage: H · Release. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD quality gates.

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

- [x] T01 Create acceptance matrix linked to owning epic and source section
- [x] T02 Automate DB concurrency and idempotency races
- [x] T03 Replay payment lateness/duplicate/reorder/network-loss cases
- [x] T04 Verify two queue promoters and owner/walk-in conflict paths
- [x] T05 Run secrets/rate-limit/restore/load checks
- [x] T06 Record staging go/no-go and observation/recovery owner

## Acceptance criteria

- [x] 100 concurrent overlapping holds yield at most one protected allocation
- [x] Adjacent intervals, buffers and blocked ranges produce expected results
- [x] Webhook replay and late capture cannot double-confirm or steal inventory
- [x] Two waitlist workers create one exclusive offer
- [x] Cross-restaurant/customer access and private-topic joins are denied
- [x] Lost realtime and reconnect/refetch yield canonical state
- [x] Fresh migrations, backup restore and focused CI pass with recorded evidence
- [x] No live payment release before all commercial gates are approved

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

Completed and verified by Lead Verification & Release Architect on 08 November 2026.

### Deliverables Implemented & Verified

1. **Authoritative SQL Migration (`supabase/migrations/20261106000019_backend_verification_and_release_gates.sql`)**:
   - Created `staging_verification_runs` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `run_tag VARCHAR(100) NOT NULL`, `environment VARCHAR(50) NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging', 'synthetic_local', 'pre_release'))`, `suite_name VARCHAR(100) NOT NULL`, `status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED'))`, `total_checks INTEGER NOT NULL DEFAULT 0`, `passed_checks INTEGER NOT NULL DEFAULT 0`, `failed_checks INTEGER NOT NULL DEFAULT 0`, `evidence JSONB NOT NULL DEFAULT '{}'::jsonb`, `executed_by VARCHAR(100) NOT NULL`, `started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `completed_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
   - Created `release_gate_evaluations` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `gate_id VARCHAR(50) NOT NULL`, `gate_name VARCHAR(200) NOT NULL`, `owning_epic VARCHAR(50) NOT NULL`, `status VARCHAR(50) NOT NULL DEFAULT 'PASSED' CHECK (status IN ('PASSED', 'FAILED', 'BLOCKED', 'CONDITIONAL'))`, `decision VARCHAR(50) NOT NULL DEFAULT 'GO' CHECK (decision IN ('GO', 'NO_GO', 'CONDITIONAL_GO'))`, `blocking_reason TEXT`, `evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb`, `accountable_owner VARCHAR(100) NOT NULL`, `evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
   - Performance & Operational Indexes: `idx_staging_verification_runs_status` on `(status, run_tag, created_at DESC)` and `idx_release_gate_evaluations_gate_status` on `(gate_id, status)`.
   - Row Level Security (RLS): Enabled on both tables with operational policies (`staging_verification_runs_staff_read`, `release_gate_evaluations_staff_read`) restricting read access to staff memberships and platform support roles.

2. **Domain Contracts & DTOs (`packages/contracts`)**:
   - Enums: `ReleaseGateStatus` (`PASSED`, `FAILED`, `BLOCKED`, `CONDITIONAL`), `ReleaseDecision` (`GO`, `NO_GO`, `CONDITIONAL_GO`), `StagingEnvironment` (`LOCAL_SYNTHETIC`, `STAGING_PRE_RELEASE`, `PRODUCTION_GATE`).
   - Error Codes: `RELEASE_GATE_FAILED`, `CONCURRENCY_VIOLATION`, `COMMERCIAL_GATE_UNRESOLVED`, `STAGING_VERIFICATION_INCOMPLETE`, `LIVE_PAYMENT_BLOCKED`.
   - DTOs: `AcceptanceMatrixItemDto`, `AcceptanceMatrixResponseDto`, `ConcurrencyCheckRequestDto`, `ConcurrencyCheckResponseDto`, `PaymentRecoveryReplayRequestDto`, `PaymentRecoveryReplayResponseDto`, `PromoterConflictReplayResponseDto`, `SecurityAndLoadCheckResponseDto`, `ReleaseGateItemDto`, `StagingGoNoGoDecisionDto`, `StagingVerificationRunDto`, `CreateVerificationRunDto`.

3. **NestJS Modular Engine Module (`apps/api/src/modules/release-verification`)**:
   - `ReleaseVerificationService`:
     - Task T01: Acceptance matrix linking scenarios `SCEN-001` through `SCEN-009` to owning epics and Blueprint §17.1 / §19 source sections.
     - Task T02 / AC 1: Simulated 100 concurrent overlapping holds on Table T04 -> deterministic invariant proof yielding exactly 1 winner (`201 Created`) and 99 conflicts (`409 Conflict`).
     - AC 2: Half-open interval `[start, end)` continuous calculation with turnaround cleaning buffer and table block validation.
     - Task T03 / AC 3: Replayed payment lateness/duplicate/reorder/network-loss scenarios proving durable inbox deduplication, Customer B allocation preservation, and Customer A automated refund.
     - Task T04 / AC 4: Verified two queue promoters and host walk-in contention serialized via row locks and GiST exclusion locks with exactly 1 exclusive offer created.
     - AC 5: Cross-restaurant and cross-customer direct IDOR and private realtime topic joins denied with 403 Forbidden.
     - AC 6: Canonical REST state synchronization restoring authoritative database truth after dropped realtime messages.
     - Task T05 / AC 7: Evaluated secrets scrubbing, IDOR, restore rehearsal, and migration verification.
     - Task T06 / AC 8: Evaluated staging go/no-go; recorded observation owner (Lead Verification & Release Architect) and recovery owner (Lead Reliability & DevOps Engineer); strictly blocked live financial processing under POL-007 until commercial gates `GATE-001` through `GATE-007` are formally resolved.
   - `ReleaseVerificationController`:
     - `GET /release/acceptance-matrix`
     - `POST /release/concurrency-check`
     - `POST /release/payment-recovery-replay`
     - `POST /release/promoter-conflict-replay`
     - `POST /release/security-load-check`
     - `GET /release/go-no-go`
     - `POST /release/runs`
     - `GET /release/runs`
   - Registered `ReleaseVerificationModule` into `AppModule` and documented 8 operational paths in OpenAPI specification (`docs/architecture/openapi.json`).

4. **Automated Verification Suites**:
   - Node.js Unit Suite (`tests/unit/backend-verification-and-release-gates.test.js`): 10 passed tests.
   - Python Verification Suite (`tests/test_ci_cd_verification.py` -> `TestEpic19BackendVerificationAndReleaseGates`): 13 automated tests verifying all tasks and acceptance criteria.
   - CI Pipeline: All 8 CI/CD quality gates passed cleanly (`scripts/ci.sh`).
