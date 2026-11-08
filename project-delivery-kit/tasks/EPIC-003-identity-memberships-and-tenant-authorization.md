---
id: "EPIC-003"
title: "Identity, memberships and tenant authorization"
type: "epic"
status: "completed"
phase: "B · Foundation"
depends_on: ["EPIC-002"]
prd_requirements: ["Blueprint §4", "Blueprint §5.2", "Blueprint §12.1", "Blueprint §13"]
risk: "high"
assignee: "Senior Backend & Security Engineer"
summary: "Authenticate callers with Supabase JWTs and enforce customer ownership and restaurant staff permissions on every resource."
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
---

# EPIC-003 — Identity, memberships and tenant authorization

## Objective

Authenticate callers with Supabase JWTs and enforce customer ownership and restaurant staff permissions on every resource.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 4, 5.2, 12.1, 13. Delivery stage: B · Foundation. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented repository baseline. Dependencies are capability prerequisites, verified through automated CI/CD gates.

## In scope

- Supabase Auth integration and verified JWT signature, issuer, expiry and audience
- Profiles and unique restaurant membership with role and active status
- Customer, host, manager, owner and audited platform-support permission matrix
- Server guards plus RLS for tables exposed through Supabase APIs
- Rate limiting and abuse controls for login, hold and payment-order paths

## Out of scope

Custom identity provider, client-side trust, unscoped platform-admin bypasses and product login screens.

## Business rules

- The token subject defines the caller; never accept user_id as authority
- A valid JWT alone does not grant restaurant membership
- Suspended/revoked membership cannot retain write access
- RLS and NestJS ownership/RBAC are complementary; service-role use requires explicit server scoping

## Data and API changes

profiles(id/auth_uid); restaurant_memberships(restaurant_id,user_id,role,status) with uniqueness, foreign keys and tenant indexes. Define RLS policies and authorization helpers with negative tests.

GET /me returns profile and role context. Supabase manages auth flows; staff invitation/member-management endpoint shapes require a contract rather than invention.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Customer reads own bookings/offers/profile; host handles permitted service states; manager handles permitted operations; owner edits own policies/layout/staff; platform support performs controlled audited actions.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Implement JWT verification and caller context
- [x] T02 Migrate profiles and memberships with unique constraints
- [x] T03 Add scoped guards and shared ownership resolver
- [x] T04 Write RLS policies for client-reachable tables
- [x] T05 Add membership revocation, rate limits and direct API denial cases

## Acceptance criteria

- [x] Missing/expired/invalid tokens fail with 401
- [x] An active host in restaurant A cannot read or mutate B resources
- [x] A customer cannot access another customer booking or waitlist offer
- [x] Revoked membership fails subsequent protected calls
- [x] Private Supabase reads are scoped by RLS

## Required verification

- Use two customers and two restaurants with direct API and DB/RLS calls
- Test forged issuer/audience/signature, expired token and role escalation
- Test guessed resource IDs, list queries and revoked memberships

## Dependencies and execution gate

Prerequisites: [EPIC-002](EPIC-002-repository-database-and-delivery-foundation.md).

Cross-tenant and cross-customer access is rejected on direct calls.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- IDOR can leak private booking/payment information
- RLS alone cannot protect a server route using elevated database credentials

## Completion report

Completed and verified by Senior Backend & Security Engineer on 06 November 2026.

### 1. Architectural Deliverables & Security Controls Implemented
- **Supabase JWT Verification & Caller Context (T01)**:
  - `apps/api/src/common/auth/jwt.util.ts`: Cryptographic HS256 HMAC-SHA256 signature verification utilizing constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks. Validates `exp` expiration, `aud` audience (`authenticated`), `iss` issuer (`${SUPABASE_URL}/auth/v1`), and extracts stable caller `sub` subject as identity principal.
  - `apps/api/src/common/auth/auth.guard.ts`: Enforces Bearer token verification. Automatically rejects missing, empty, expired, or signature-tampered tokens with RFC 7807 problem details 401 (`UNAUTHORIZED`). Attaches authenticated caller principal and tenant memberships to `request.user`.
- **Authoritative SQL Migrations & Schema Extensions (T02, T04)**:
  - `supabase/migrations/20261106000003_identity_and_rls.sql`:
    - Extended `profiles` with `auth_uid UUID UNIQUE` and indexed lookup.
    - Added tenant composite index `idx_memberships_tenant_role_status` on `restaurant_memberships(restaurant_id, role, status)`.
    - Configured PostgreSQL Row Level Security (RLS) on all client-reachable tables:
      - `profiles`: Self-service read/write restricted strictly to `auth.uid() = auth_uid OR auth.uid() = id`.
      - `restaurant_memberships`: Members read own memberships (`user_id = auth.uid()`); owners manage memberships for their restaurant.
      - `bookings`: Customer reads strictly own bookings (`user_id = auth.uid()`); staff access scoped strictly by active membership.
      - `table_allocations`: Scoped strictly to active restaurant staff.
      - `waitlist_entries` and `waitlist_offers`: Customers read only their own entries and offers.
      - `audit_logs`: Scoped strictly to active restaurant owners.
  - `apps/api/src/common/db/schema.ts`: Aligned Drizzle ORM schema with `authUid` and unique constraints.
- **Scoped Tenant & RBAC Guards (T03, T05)**:
  - `apps/api/src/common/auth/tenant.guard.ts`: Intercepts restaurant requests, extracts `restaurant_id`, checks authoritative membership status and role. Automatically rejects cross-tenant attempts (e.g. Host of Restaurant A querying Restaurant B) with 403 (`FORBIDDEN_TENANT_ACCESS`).
  - `apps/api/src/common/auth/ownership.guard.ts`: Resolves resource ownership for customer entities (bookings, waitlists, profiles). Prevents IDOR attacks by verifying caller identity matches resource owner; rejects unauthorized cross-customer attempts with 403 (`FORBIDDEN_RESOURCE_ACCESS`).
  - `apps/api/src/common/auth/rate-limiter.guard.ts`: Sliding-window in-memory abuse protection for auth, hold creation, and payment endpoints. Throws 429 (`RATE_LIMIT_EXCEEDED`) upon exceeding threshold.
- **API Endpoints (Blueprint §12 / REFERENCE-api)**:
  - `GET /v1/me`: `MeController` returning caller profile details, auth_uid, email, and active restaurant tenant memberships.
  - `GET /v1/identity/profile/:id`: Scoped profile retrieval guarded by customer ownership.
  - `PATCH /v1/identity/memberships/:id/status`: Owner-guarded endpoint to update staff status (supporting instant suspension/revocation).
  - `GET /v1/owner/restaurants/:id/bookings`: Scoped staff booking visibility guarded by `TenantGuard`.

### 2. Automated CI/CD Test Pipeline & Verification Evidence
- **Automated Unit Test Suites**:
  - `tests/unit/identity.test.js`: 15 unit tests covering:
    - Supabase HS256 JWT signature verification and context extraction.
    - Negative tests: expired token (401), tampered signature (401), invalid audience (401), invalid issuer (401), missing header (401).
    - Cross-tenant isolation: Host in Restaurant 1 denied for Restaurant 2 (403 `FORBIDDEN_TENANT_ACCESS`).
    - Membership revocation: Suspended staff member Eve immediately denied (403 `MEMBERSHIP_SUSPENDED`).
    - Customer resource isolation: Customer Bob denied from reading Customer Alice booking (403 `FORBIDDEN_RESOURCE_ACCESS`).
    - Rate limiter sliding window: Exceeding request quota triggers 429 `RATE_LIMIT_EXCEEDED`.
  - `tests/unit/foundation.test.js`: 6 unit checks passing for environment, migrations, Drizzle, and OpenAPI.
- **Automated Python CI/CD Gate Tests (`tests/test_ci_cd_verification.py`)**:
  - 26 comprehensive architecture, foundation, and identity tests passing:
    - `test_identity_node_unit_suite`: Executes Node.js identity suite (15/15 passed).
    - `test_migration_003_rls_and_auth_uid`: Verifies SQL migration 3 defines RLS policies on all 7 tables with `auth.uid()`.
    - `test_openapi_identity_and_me_routes`: Verifies OpenAPI documents `/me`, `/identity/profile/{id}`, and `/owner/restaurants/{id}/bookings`.
    - `test_python_jwt_cryptographic_verification`: Independent HMAC-SHA256 signature and tamper detection.
    - `test_python_two_customers_and_two_restaurants_isolation`: Invariant proof for two customers, two restaurants, host roles, and suspended staff.
- **CI Shell Pipeline (`scripts/ci.sh`)**:
  - All 8 CI Quality Gates passing cleanly with zero errors.

### 3. Downstream Release Gates & Next Phase Transition
- Identity, memberships and tenant authorization ([EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md)) is verified, marked completed, and registered in the delivery dashboard.
- Downstream Phase 3 ([EPIC-004](EPIC-004-restaurant-profiles-hours-and-policies.md): Restaurant profiles, hours and policies) is unblocked for implementation.

## Finalized v2 change boundary

This original epic ID, title, completed status, accepted checklist and historical completion report are preserved. New finalized-v2 changes are tracked in EPIC-021–024; they do not reset this delivered work or imply that new provider/schema behavior was already verified.
