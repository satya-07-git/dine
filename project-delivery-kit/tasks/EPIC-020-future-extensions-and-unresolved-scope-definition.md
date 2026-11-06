---
id: "EPIC-020"
title: "Future extensions and unresolved scope definition"
type: "epic"
status: "blocked"
phase: "Later · Needs definition"
depends_on: ["EPIC-001"]
prd_requirements: ["Blueprint §1.3", "Blueprint §2.1", "Blueprint §19.1", "Blueprint §20.3"]
risk: "high"
assignee: "Unassigned"
summary: "Keep explicitly deferred capabilities visible without expanding the exact-table backend MVP."
---

# EPIC-020 — Future extensions and unresolved scope definition

## Objective

Keep explicitly deferred capabilities visible without expanding the exact-table backend MVP.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 1.3, 2.1, 19.1, 20.3. Delivery stage: Later · Needs definition. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Record joined tables, variable seating, POS integration, advanced pricing, demand optimization and multi-location analytics as later extensions
- Define proof/scale triggers before considering microservices/event-driven service splits
- Identify unresolved contracts for no-show, packages/reviews, gateway review/capture and settlement
- Require new requirements, threat/risk review and acceptance gates before extension implementation

## Out of scope

Building unspecified future systems or introducing Clinify healthcare/subscription/AI modules into Dine.

## Business rules

- Deferred source examples are not promised first-release work
- Joined tables require deterministic lock order and a new allocation contract
- POS events cannot bypass trusted inventory/status authorization
- Scope changes need updated ADRs, schema/API impact and release gates

## Data and API changes

No speculative production tables or routes are authorized here. Record decisions and proposed bounded changes first; preserve one SQL migration authority.

Future routes are intentionally undefined pending reviewed product requirements.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Any future integration must define credential scope, restaurant ownership, audit and data-minimization boundaries.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Maintain deferred-scope register with owner and rationale
- [ ] T02 Define prerequisites and risk criteria for each candidate extension
- [ ] T03 Write new product/API/data contracts before scheduling implementation

## Acceptance criteria

- [ ] Each later extension is identified with missing requirements and a decision owner
- [ ] No unresolved extension is shown as ready or completed
- [ ] First release dependencies do not require unspecified future modules
- [ ] Architecture scale changes require measured evidence and explicit ADR

## Required verification

- Review MVP/non-goals against blueprint §1.3
- Check dependency graph contains no future-only prerequisite for core release
- Review any proposed extension against all inventory/payment/tenant invariants

## Dependencies and execution gate

Prerequisites: EPIC-001.

Blocked for detailed product definition; unblock only after the specific extension is approved.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Unbounded scope delays the first safe pilot
- Copying Clinify domain requirements would contradict the Dine source

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
