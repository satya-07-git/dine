---
id: "EPIC-016"
title: "Favorites, reviews and customer preferences"
type: "epic"
status: "backlog"
phase: "G · Restaurant operations"
depends_on: ["EPIC-003", "EPIC-004", "EPIC-009"]
prd_requirements: ["Blueprint §1.1", "Blueprint §4", "Blueprint §16.2"]
risk: "medium"
assignee: "Unassigned"
summary: "Define bounded customer engagement APIs with ownership and eligible-review rules."
---

# EPIC-016 — Favorites, reviews and customer preferences

## Objective

Define bounded customer engagement APIs with ownership and eligible-review rules.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.1, 4, 16.2. Delivery stage: G · Restaurant operations. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Customer-owned favorites and minimum necessary preferences
- Eligible reviews linked to verified dining/booking evidence
- Published review projection with privacy and tenant boundaries
- Explicit eligibility, duplicate and moderation decision contract before implementation

## Out of scope

Recommendation AI, loyalty wallet, incentives, invented review scoring and mobile engagement screens.

## Business rules

- Customers cannot create another user preference/favorite/review
- Review eligibility is server-verified; the exact eligible booking states need agreement
- Private preferences do not enter public discovery responses
- A named module is not a complete specification of moderation or rating policy

## Data and API changes

Favorites/reviews/preferences are named module behavior but have no detailed source table schema. Define unique user/restaurant favorites, review provenance and minimal preference fields before migrations.

No engagement routes are enumerated in source §12. Agree versioned DTOs, ownership, publication and retry behavior in OpenAPI before creating writes.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Authenticated customers manage own records; moderation/admin powers require explicit audited permission. Apply appropriate RLS to client-reachable records.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Define engagement fields and review eligibility contract
- [ ] T02 Define privacy/public review projection
- [ ] T03 Implement favorite/preference ownership and uniqueness
- [ ] T04 Implement eligible review write/read after policy approval

## Acceptance criteria

- [ ] A customer cannot manipulate a foreign user engagement record
- [ ] Review without required dining evidence is rejected
- [ ] Duplicate favorite writes are repeat-safe
- [ ] Only approved public review fields appear in discovery

## Required verification

- Test cross-customer access and duplicate writes
- Test eligible/ineligible/cancelled booking review cases after rules are frozen
- Inspect public projections for private preference leakage

## Dependencies and execution gate

Prerequisites: EPIC-003, EPIC-004, EPIC-009.

Approved pilot engagement scope is complete with eligibility/ownership tests.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unspecified review eligibility must not be invented
- Preferences can expand retained personal data unnecessarily

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
