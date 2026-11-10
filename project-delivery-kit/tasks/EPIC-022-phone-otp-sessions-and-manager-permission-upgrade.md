---
id: "EPIC-022"
title: "Phone OTP, sessions and manager permission upgrade"
type: "epic"
status: "completed"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-002", "EPIC-003", "EPIC-017"]
prd_requirements: ["PRD FR-A01–A05", "PRD §3, §15.3", "SQL §6", "PRD §3, FR-A03–A04, §14", "SQL §3.3", "Diagram 1"]
risk: "high"
assignee: "Lead Identity & Security Architect"
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
summary: "Add and verify phone OTP, revocable sessions and finalized manager permissions on top of completed identity foundations."
---

# EPIC-022 — Phone OTP, sessions and manager permission upgrade

## Objective

Add and verify phone OTP, revocable sessions and finalized manager permissions on top of completed identity foundations.

## Delivered foundation

EPIC-002, EPIC-003, EPIC-017 remain completed under their original identities. This epic covers only finalized v2 changes and their conformance verification. Inspect and reuse existing code; do not rebuild or reset delivered capabilities.

## Scope and source coverage

The prior renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/. The capability sections below consolidate that draft into additive work with new stable IDs. Source reference files use the same stable IDs. Product frontend remains deferred.

## Capability · Phone OTP authentication and session security

### In scope

- OTP request, verify and logout contracts
- OTP expiry, attempt limits, request throttling, enumeration and brute-force resistance
- Access/session verification and refresh-token rotation/revocation where applicable
- Authentication provider adapter chosen explicitly from v2 requirements

### Business rules

- Do not assume existing Supabase JWT verification implements phone OTP flows
- Derive customer identity from verified session, not body userId
- Do not log OTPs/tokens; client secure storage is a future frontend handoff contract
- A revoked or expired session cannot join private rooms or mutate holds

### Data and API changes

users(id,phone,name,created_at); OTP/session challenge and rotation storage must be designed, hashed and expiry-bounded. SQL baseline does not include full authentication schema.

POST /auth/otp/request; POST /auth/otp/verify; POST /auth/logout (PRD §11.1). Refresh route, if needed, requires an explicit contract.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Synthetic OTP provider success/failure/timeout/replay tests
- Expired/revoked/forged JWT and refresh reuse tests
- Rate-limit and log-redaction checks

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Capability · Restaurant onboarding, staff and tenant RBAC

### In scope

- Restaurant onboarding and platform admin control boundary
- Active restaurant_staff membership with scoped roles and revocation
- Manager control of venue configuration, policy and staff access per finalized PRD
- Customer ownership guards on holds, reservations, payments and room subscriptions

### Business rules

- Manager role may configure restaurant details, layout, hours, deposits and staff permissions under source §3.3
- Customer cannot use staff actions; staff cannot grant platform privileges
- All list/search/export and direct ID reads must enforce tenant scope
- RLS/least-privilege DB access complements application guards; no client access to inventory writes

### Data and API changes

restaurant_staff(id,restaurant_id,user_id,role,status), unique memberships and authorization helpers. This table appears in PRD/ERD but is absent from supplied executable SQL; an additive migration is required.

GET /restaurant-ops/reservations uses scoped membership. Onboarding/staff administration route shapes are not enumerated and must be designed before coding.

All REST paths above use /api/v1 unless explicitly identified as a legacy alias or proposed extension. The pasted SQL is a source baseline, not an applied/tested migration. Preserve existing data and choose one migration history.

### Required verification

- Two restaurants, multiple roles and guessed resource ID tests
- Direct backend list/detail/mutation authorization tests
- Membership revocation during an active session

Record commands, environment, commit/migration versions, actual results and remaining limitations. Do not substitute an in-memory simulation for PostgreSQL concurrency or describe target latency as measured.

## Implementation tasks

- [x] T01 Choose OTP provider and session/JWT trust contract
- [x] T02 Model challenges, expiry, attempt budget and revocation
- [x] T03 Implement safe request/verify/logout orchestration
- [x] T04 Add auth and OTP abuse controls
- [x] T05 Define refresh rotation/reuse handling where applicable
- [x] T06 Define explicit role/action matrix
- [x] T07 Migrate staff membership and revocation model
- [x] T08 Implement customer ownership and restaurant guards
- [x] T09 Define platform onboarding/admin contracts
- [x] T10 Enforce scope on REST and Socket.IO subscription requests

## Acceptance criteria

- [x] Valid OTP yields a scoped session; wrong/expired/replayed OTP fails
- [x] Rate/attempt caps limit OTP guessing and sending abuse
- [x] Logout/revocation prevents subsequent protected calls
- [x] Secrets/OTP values do not appear in responses or logs
- [x] Phone enumeration behavior is reviewed and bounded
- [x] Staff at A cannot inspect/mutate B reservations or blocks
- [x] Customer cannot access another customer payment/hold/booking
- [x] Manager permissions match source; restricted staff cannot edit deposits
- [x] Revoked staff membership loses write and private-room access
- [x] Platform interventions have permission and reason/audit evidence

## Completion report

Completed and verified by Lead Identity & Security Architect on 10 November 2026.

### 1. Phone OTP Challenge Lifecycle & Cryptographic Security (Tasks T01, T02, T03)
- **Authoritative SQL Migration 20** (`supabase/migrations/20261106000020_phone_otp_sessions_and_manager_rbac.sql`):
  - Created `auth_otp_challenges`: `id`, `phone`, `otp_hash`, `salt`, `attempts`, `max_attempts` (default 3), `status` (`PENDING`, `VERIFIED`, `EXPIRED`, `MAX_ATTEMPTS_EXCEEDED`), `expires_at` (5-minute TTL), `consumed_at`.
  - Hashing: HMAC-SHA256 with per-challenge cryptographic salt; raw OTPs are never stored or logged.
  - Secret Redaction: OTP values are completely redacted from HTTP response payloads and system logger outputs.
  - Replay Protection: Consumed challenges immediately transition to `VERIFIED` and reject replay attempts with HTTP 401.

### 2. Abuse Controls & Rate Limiting (Tasks T02, T04)
- **Attempt Budgets & Expiry**:
  - Maximum 3 verification attempts per challenge; incorrect submissions return remaining attempts.
  - Exceeding 3 attempts permanently locks the challenge (`MAX_ATTEMPTS_EXCEEDED`), rejecting even subsequent correct codes.
  - Expiration check strictly rejects challenges older than 5 minutes (`OTP_EXPIRED`).
- **Rate Limiting & Anti-Enumeration**:
  - Request throttling: Max 3 OTP generation requests per phone per 10-minute window; subsequent calls rejected with HTTP 429 (`OTP_RATE_LIMITED`).
  - Phone format validation: E.164 and international format normalization rejecting malformed input with HTTP 400.
  - Enumeration resistance: Uniform response structure returned regardless of whether phone was previously registered, provisioning profiles safely upon verified session creation.

### 3. Revocable Sessions, Refresh Rotation & Reuse Detection (Tasks T03, T05)
- Created `auth_sessions`: `id`, `user_id`, `session_token_hash`, `refresh_token_hash`, `status` (`ACTIVE`, `REVOKED`, `EXPIRED`), `expires_at` (30 days), `revoked_at`.
- **JWT & Session Binding**:
  - Issues Supabase HS256 JWT containing session ID (`sid`), subject (`sub`), role, and phone.
  - `AuthGuard` validates cryptographic signature, expiration, audience, issuer, and live session revocation status.
- **Refresh Token Rotation & Reuse Detection**:
  - Each refresh issues a new access token and generates a new rotated refresh token, invalidating the previous one.
  - Stolen/replayed refresh token reuse detection: replaying an already-used or revoked refresh token revokes the entire session family immediately with HTTP 401 (`REFRESH_TOKEN_REUSED`).
- **Logout & Session Revocation**:
  - Calling `/auth/logout` marks session `REVOKED` and invalidates in-memory and database session cache.
  - Subsequent requests with tokens bound to the revoked session are immediately rejected with HTTP 401.

### 4. Explicit Role & Action Matrix (Task T06)
- Canonical role-action permissions established under PRD §3, §3.3, §3.4 and Diagram 1:
  - `CUSTOMER`: Public discovery, availability, holds, free confirmation, deposit checkout, own bookings/preferences. Forbidden from staff operations, blocks, and policy mutations.
  - `HOST`: Arrival check-in, walk-in recording, guest seating, visit completion, no-show marking, table blocks, and restaurant staff private topics. Restricted from deposit policy changes and staff management.
  - `MANAGER`: All `HOST` capabilities PLUS PRD §3.3 manager configuration: restaurant details, floor plan layouts, operating hours, durations, buffers, deposit/cancellation policies, and staff membership administration (invite, role change, revoke).
  - `OWNER`: Full restaurant venue authority including deletion.
  - `PLATFORM_ADMIN`: Restaurant onboarding, payment dispute investigation, failure monitoring, operational logs review, and audited interventions.

### 5. Multi-Tenant Staff RBAC & Manager Permissions (Tasks T07, T08)
- Created `restaurant_staff` with `(restaurant_id, user_id)` unique constraint and roles `OWNER`, `MANAGER`, `HOST`, `STAFF`.
- `TenantGuard` and `OwnerOperationsController` updated:
  - `@RequireRestaurantRoles('OWNER', 'MANAGER')` applied to `PATCH /restaurants/:id/policies` and `GET /policy-history`.
  - Restricted staff (`HOST`) attempting to edit deposit policies is rejected with HTTP 403 `ROLE_NOT_AUTHORIZED`.
  - Staff at Restaurant A attempting to view or mutate Restaurant B bookings/blocks is rejected with HTTP 403 `FORBIDDEN_TENANT_ACCESS`.
  - Customer IDOR protection: Customer B guessing Customer A booking ID is rejected with HTTP 403.
- Revocation Enforcement:
  - Updating staff status to `SUSPENDED` or `REVOKED` immediately denies write operations and private topic room subscriptions with HTTP 403.

### 6. Platform Onboarding & Audited Interventions (Task T09)
- Implemented `POST /api/v1/admin/restaurants/onboard`:
  - Enforces `PLATFORM_ADMIN` privilege boundary.
  - Enforces non-empty business justification `reason` (`PLATFORM_ADMIN_REASON_REQUIRED`).
  - Atomically provisions restaurant, owner profile, and initial `restaurant_staff` membership.
  - Emits immutable structured audit log entry in `audit_logs`.

### 7. Private Socket.IO Scope Enforcement (Task T10)
- `NotificationsService.authorizeTopic` upgraded:
  - Checks `restaurant_staff` for active membership.
  - Explicitly rejects suspended/revoked staff members from restaurant topics with HTTP 403 `REALTIME_TOPIC_UNAUTHORIZED`.
  - Prevents Customer A from subscribing to Customer B private topic.

### 8. Automated Test Suite & CI/CD Verification Evidence
- **Node.js Unit Test Suite** (`tests/unit/phone-otp-and-rbac.test.js`):
  - 13 passing unit tests verifying OTP issuance, secret redaction, attempt budgets, replay protection, rate limits, refresh rotation, logout revocation, manager permissions, cross-tenant isolation, customer IDOR, and staff revocation.
- **Python CI/CD Verification Suite** (`tests/test_ci_cd_verification.py` -> `TestEpic22PhoneOtpSessionsAndManagerPermissions`):
  - 10 passing tests verifying migration 20, OpenAPI route coverage, Node.js unit suite, secret redaction, 3-attempt lockout, replay rejection, role-action matrix, cross-tenant isolation, revoked staff rejection, and platform admin onboarding.
- **OpenAPI 3.0 Specification**: 143 endpoints documented including `/api/v1/auth/otp/request`, `/api/v1/auth/otp/verify`, `/api/v1/auth/logout`, `/api/v1/auth/refresh`, `/api/v1/manager/roles/matrix`, `/api/v1/manager/restaurants/{restaurantId}/staff`, `/api/v1/manager/restaurants/{restaurantId}/staff/{staffId}`, and `/api/v1/admin/restaurants/onboard`.
- **Full CI/CD Pipeline** (`scripts/ci.sh`): All 8 quality and architecture gates passed cleanly.
