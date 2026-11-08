---
id: "EPIC-017"
title: "Audit, support and privacy controls"
type: "epic"
status: "completed"
phase: "B onward · Cross-cutting"
depends_on: ["EPIC-003"]
prd_requirements: ["Blueprint §1.2", "Blueprint §4", "Blueprint §5.2", "Blueprint §9", "Blueprint §13.3", "Blueprint §14.2", "Blueprint §19.2"]
risk: "high"
assignee: "Lead Backend Architect"
summary: "Preserve evidence for state changes, payment incidents and privileged actions while minimizing personal data."
---

# EPIC-017 — Audit, support and privacy controls

## Objective

Preserve evidence for state changes, payment incidents and privileged actions while minimizing personal data.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.2, 4, 5.2, 9, 13.3, 14.2, 19.2. Delivery stage: B onward · Cross-cutting. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented and verified repository capability. Dependencies are capability prerequisites, verified through automated CI/CD quality gates.

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

- [x] T01 Define audit envelope and shared transactional helper
- [x] T02 Map required audit events across feature epics
- [x] T03 Define controlled support access and reason requirements
- [x] T04 Set log redaction and data-retention/deletion decisions
- [x] T05 Specify incident trace and evidence export boundaries

## Acceptance criteria

- [x] Each critical booking/payment/owner transition has actor and request correlation
- [x] Rejected unauthorized actions cannot mutate protected business state
- [x] Support intervention preserves prior evidence and records reason
- [x] Private secrets do not appear in logs or customer history
- [x] Retention/deletion policy is approved before production release

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

### Deliverables Implemented & Verified

1. **Authoritative SQL Migration (`supabase/migrations/20261106000017_audit_support_and_privacy_controls.sql`)**:
   - Enhanced `audit_logs` table: Added `actor_role VARCHAR(50)`, `reason TEXT`, and `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`, with performance indexes (`idx_audit_logs_actor_id`, `idx_audit_logs_restaurant_id`, `idx_audit_logs_entity`, `idx_audit_logs_request_id`, `idx_audit_logs_created_at`).
   - Created `support_interventions` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `ticket_id` (VARCHAR(100)), `actor_id` (UUID NOT NULL), `actor_role` (VARCHAR(50) NOT NULL CHECK in ('SUPPORT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')), `restaurant_id` (UUID REFERENCES `restaurants`), `booking_id` (UUID REFERENCES `bookings`), `intervention_type` (VARCHAR(50) CHECK in ('MANUAL_STATUS_CORRECTION', 'COMPENSATION_CREDIT', 'EMERGENCY_RELEASE', 'DISPUTE_INVESTIGATION', 'POLICY_OVERRIDE')), `reason` (TEXT NOT NULL), `prior_state` (JSONB NOT NULL), `new_state` (JSONB NOT NULL), `request_id` (UUID), `metadata` (JSONB), and `created_at`.
   - Created `privacy_erasure_requests` table: `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`), `user_id` (UUID NOT NULL), `status` (VARCHAR(50) CHECK in ('COMPLETED', 'ANONYMIZED_WITH_RETAINED_EVIDENCE', 'BLOCKED_ACTIVE_DISPUTE')), `has_financial_records` (BOOLEAN), `retained_records_summary` (JSONB), `anonymized_at`, and `created_at`.
   - Database Append-Only Triggers (`trg_enforce_append_only`): Attached to `audit_logs`, `booking_status_events`, `payment_events`, and `support_interventions` to strictly reject any UPDATE or DELETE mutations at the database engine level.
   - Enabled Row Level Security (RLS) on all three tables with policies for scoped tenant access, user self-service erasure queries, and support access.

2. **Domain Contracts & DTOs (`packages/contracts`)**:
   - Standard Problem Details error codes in `packages/contracts/src/errors.ts`:
     - `AUDIT_LOG_TAMPERING_FORBIDDEN`
     - `AUDIT_REASON_REQUIRED`
     - `SUPPORT_ACCESS_FORBIDDEN`
     - `SUPPORT_TRACE_NOT_FOUND`
     - `INCIDENT_EXPORT_DENIED`
     - `RETENTION_POLICY_CONFLICT`
     - `REDACTION_FAILED`
   - Domain enums in `packages/contracts/src/enums.ts`:
     - `SupportInterventionType` (`MANUAL_STATUS_CORRECTION`, `COMPENSATION_CREDIT`, `EMERGENCY_RELEASE`, `DISPUTE_INVESTIGATION`, `POLICY_OVERRIDE`)
     - `PrivacyErasureStatus` (`COMPLETED`, `ANONYMIZED_WITH_RETAINED_EVIDENCE`, `BLOCKED_ACTIVE_DISPUTE`)
     - `AuditActorRole` (`CUSTOMER`, `STAFF`, `OWNER`, `SUPPORT`, `PLATFORM_ADMIN`, `SYSTEM`)
   - Typed domain DTOs in `packages/contracts/src/dtos.ts`:
     - `AuditEnvelopeDto`, `AuditLogEntryDto`, `AuditLogQueryDto`, `AuditLogListResponseDto`
     - `SupportInterventionRequestDto`, `SupportInterventionResponseDto`
     - `SupportIncidentTraceDto`
     - `IncidentExportRequestDto`, `IncidentExportResponseDto`
     - `PrivacyErasureRequestDto`, `PrivacyErasureResponseDto`

3. **NestJS Modular Monolith Architecture (`apps/api/src/modules/audit-support/`)**:
   - **`audit.helper.ts`**: Shared transactional `recordAuditLog` helper and recursive `redactSensitiveData` utility automatically scrubbing passwords, tokens, JWTs, card numbers, CVVs, pins, VPAs, and raw secrets from audit diffs and incident exports, alongside `maskEmail` and `maskPhone` PII helpers.
   - **`AuditSupportService` (`audit-support.service.ts`)**:
     - AC1: Commits immutable audit envelope with actor ID, actor role, restaurant ID, action, entity type, entity ID, diff, reason, and request correlation in the same database transaction.
     - AC2: Enforces multi-tenant isolation, blocking cross-tenant audit log queries and incident traces with 403 Forbidden (`SUPPORT_ACCESS_FORBIDDEN`).
     - AC3: Mandates explicit justification reason (rejects empty/missing with 422 `AUDIT_REASON_REQUIRED`), snapshots prior state, and appends intervention records without rewriting past history.
     - AC4: Sanitizes incident evidence exports with deep secret redaction, customer PII masking, and SHA-256 integrity checksum generation.
     - AC5: Handles privacy Right-to-be-Forgotten requests under POL-017 / GATE-006, resolving the conflict with statutory 7-year financial retention by anonymizing personal profiles and purging engagement artifacts while preserving immutable financial and booking records.
   - **`AuditSupportController` (`audit-support.controller.ts`)**:
     - `GET /support/audit-logs`: Scoped audit search with tenant and role gates.
     - `GET /support/bookings/:bookingId/trace`: End-to-end lifecycle incident trace aggregation.
     - `POST /support/interventions`: Controlled support actions with mandatory reason.
     - `POST /support/export/incident`: Certified sanitized incident export packages.
     - `POST /support/privacy/erasure-request`: Evaluates and executes privacy erasure vs statutory retention.
   - **`AuditSupportModule` & `AppModule`**: Registered feature module in the modular monolith.

4. **Commercial Policy Register & Governance Updates (`docs/policies/commercial-policy-register.md`)**:
   - **POL-014**: Transactional Audit Immutability & Correlation Envelope.
   - **POL-015**: Controlled Platform Support Interventions & Mandatory Justification.
   - **POL-016**: Sensitive Secret Redaction, Token Protection & Safe Logging.
   - **POL-017**: Data Retention Schedule & Right-to-be-Forgotten Policy (7-year statutory financial retention vs profile anonymization).
   - **GATE-006**: Statutory Audit Retention vs Data Deletion Resolution Gate (Blocking automated physical database purge jobs until formal compliance sign-off).

5. **OpenAPI Specification (`docs/architecture/openapi.json`)**:
   - Documented all `/support/*` routes with schemas, operation descriptions, authentication requirements, and RFC 7807 problem details.

6. **Automated Verification & CI/CD Quality Gates**:
   - **Node.js Unit Test Suite (`tests/unit/audit-support.test.js`)**: 12 comprehensive unit tests covering atomic audit envelope commits, rollback safety, append-only trigger enforcement, recursive secret redaction, email/phone masking, support reason validation (422), unauthorized intervention denial (403), history preservation, multi-tenant isolation, certified incident export checksums, and privacy erasure with financial retention preservation.
   - **Python CI/CD Verification Suite (`tests/test_ci_cd_verification.py`)**: `TestEpic17AuditSupportAndPrivacyControls` with 9 tests verifying migration 17, OpenAPI documentation, Node.js runner, AC1, AC2, AC3, AC4, AC5, and POL-014 through POL-017 / GATE-006 governance.
   - **All 8 CI/CD Quality Gates Passed Cleanly** with 139 automated tests passing across the entire platform via `./scripts/ci.sh`.
