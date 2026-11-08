---
id: "EPIC-022"
title: "Phone OTP, sessions and manager permission upgrade"
type: "epic"
status: "backlog"
phase: "V2 · Required upgrades"
depends_on: ["EPIC-002", "EPIC-003", "EPIC-017"]
prd_requirements: ["PRD FR-A01–A05", "PRD §3, §15.3", "SQL §6", "PRD §3, FR-A03–A04, §14", "SQL §3.3", "Diagram 1"]
risk: "high"
assignee: "Unassigned"
priority: "Must"
baseline: "PRD v2.0 · New delta"
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

- [ ] T01 Choose OTP provider and session/JWT trust contract
- [ ] T02 Model challenges, expiry, attempt budget and revocation
- [ ] T03 Implement safe request/verify/logout orchestration
- [ ] T04 Add auth and OTP abuse controls
- [ ] T05 Define refresh rotation/reuse handling where applicable
- [ ] T06 Define explicit role/action matrix
- [ ] T07 Migrate staff membership and revocation model
- [ ] T08 Implement customer ownership and restaurant guards
- [ ] T09 Define platform onboarding/admin contracts
- [ ] T10 Enforce scope on REST and Socket.IO subscription requests

## Acceptance criteria

- [ ] Valid OTP yields a scoped session; wrong/expired/replayed OTP fails
- [ ] Rate/attempt caps limit OTP guessing and sending abuse
- [ ] Logout/revocation prevents subsequent protected calls
- [ ] Secrets/OTP values do not appear in responses or logs
- [ ] Phone enumeration behavior is reviewed and bounded
- [ ] Staff at A cannot inspect/mutate B reservations or blocks
- [ ] Customer cannot access another customer payment/hold/booking
- [ ] Manager permissions match source; restricted staff cannot edit deposits
- [ ] Revoked staff membership loses write and private-room access
- [ ] Platform interventions have permission and reason/audit evidence

## Completion report

New v2 delta pending. The original 20 completed epics are not reopened by this work. Record actual changed code/migrations, commands and results here when these deltas are implemented. No new backend test result is claimed by a planning/status correction.
