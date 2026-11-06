---
id: "EPIC-003"
title: "Identity, memberships and tenant authorization"
type: "epic"
status: "backlog"
phase: "B · Foundation"
depends_on: ["EPIC-002"]
prd_requirements: ["Blueprint §4", "Blueprint §5.2", "Blueprint §12.1", "Blueprint §13"]
risk: "high"
assignee: "Unassigned"
summary: "Authenticate callers with Supabase JWTs and enforce customer ownership and restaurant staff permissions on every resource."
---

# EPIC-003 — Identity, memberships and tenant authorization

## Objective

Authenticate callers with Supabase JWTs and enforce customer ownership and restaurant staff permissions on every resource.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 4, 5.2, 12.1, 13. Delivery stage: B · Foundation. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

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

- [ ] T01 Implement JWT verification and caller context
- [ ] T02 Migrate profiles and memberships with unique constraints
- [ ] T03 Add scoped guards and shared ownership resolver
- [ ] T04 Write RLS policies for client-reachable tables
- [ ] T05 Add membership revocation, rate limits and direct API denial cases

## Acceptance criteria

- [ ] Missing/expired/invalid tokens fail with 401
- [ ] An active host in restaurant A cannot read or mutate B resources
- [ ] A customer cannot access another customer booking or waitlist offer
- [ ] Revoked membership fails subsequent protected calls
- [ ] Private Supabase reads are scoped by RLS

## Required verification

- Use two customers and two restaurants with direct API and DB/RLS calls
- Test forged issuer/audience/signature, expired token and role escalation
- Test guessed resource IDs, list queries and revoked memberships

## Dependencies and execution gate

Prerequisites: EPIC-002.

Cross-tenant and cross-customer access is rejected on direct calls.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- IDOR can leak private booking/payment information
- RLS alone cannot protect a server route using elevated database credentials

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
