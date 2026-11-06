---
id: "EPIC-013"
title: "Transactional events, private realtime and notifications"
type: "epic"
status: "backlog"
phase: "F · Waitlist & events"
depends_on: ["EPIC-003", "EPIC-009"]
prd_requirements: ["Blueprint §3.3", "Blueprint §4", "Blueprint §11", "Blueprint §14.1", "Blueprint §14.2", "Blueprint §17.1"]
risk: "high"
assignee: "Unassigned"
summary: "Deliver status hints and notifications from a durable outbox while REST remains authoritative."
---

# EPIC-013 — Transactional events, private realtime and notifications

## Objective

Deliver status hints and notifications from a durable outbox while REST remains authoritative.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 3.3, 4, 11, 14.1, 14.2, 17.1. Delivery stage: F · Waitlist & events. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an unimplemented repository plan. Dependencies are capability prerequisites, not evidence that they are ready.

## In scope

- Write booking status event and outbox in the same transaction as state change
- At-least-once worker dispatch with delivery deduplication and bounded retries
- Supabase private Broadcast with user/restaurant-scoped topics and authorization
- Sequenced/versioned event envelope and REST snapshot on reconnect
- Replaceable push/in-app NotificationSender adapters and failure visibility

## Out of scope

Realtime as source of truth, public private-data channels, guaranteed push delivery and invented occupancy sensors.

## Business rules

- Booking commit does not depend on WebSocket or push success
- Worker retry may duplicate delivery; consumers deduplicate event ID/version
- Authorized staff generate READY/SEATED status; broadcast does not invent state
- Reconnect/launch refetches canonical REST state
- Waitlist notification is informational until own offer is accepted

## Data and API changes

outbox_events; booking_status_events; notification_deliveries with attempt/result/dedup metadata. Agree event_id, entity_id, restaurant/user scope, sequence, event_type and occurred_at envelope.

GET /bookings/:id and /bookings/:id/events are canonical snapshots/history. Private Broadcast is not a replacement REST write API. Provider channel and delivery-support routes remain contracts to define.

Schema and API details beyond explicitly listed blueprint fields/routes must be reviewed during implementation. Add schema changes only through supabase/migrations.

## Permission and audit requirements

Authorize topic subscriptions by verified user/membership; minimize payloads and enforce recipient scope. Delivery retries/support reads require internal/scoped rights.

Use verified identity, restaurant/resource ownership checks and EPIC-017 audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [ ] T01 Define event envelope and transactional publisher interface
- [ ] T02 Implement claim/dispatch/retry/dead-letter worker
- [ ] T03 Implement private topic authorization and minimal payloads
- [ ] T04 Add notification adapter and dedup delivery store
- [ ] T05 Document reconnect/refetch contract for future frontend

## Acceptance criteria

- [ ] Crash after booking commit still leaves a dispatchable outbox event
- [ ] Worker restart/duplicate delivery does not repeat a logical notification action
- [ ] Customer A cannot subscribe to B private topic
- [ ] Lost or out-of-order event does not override a newer REST state
- [ ] Notification provider outage does not fail booking commit

## Required verification

- Kill worker between delivery and acknowledgement to exercise duplicates
- Test unauthorized channel joins and revoked staff access
- Use two clients; drop/reconnect one and refetch matching canonical state
- Inspect backoff, attempt cap and poison-message visibility

## Dependencies and execution gate

Prerequisites: EPIC-003, EPIC-009.

Private events are recoverable hints and reconnect produces the correct REST state.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Private channel name alone is not authorization
- Exactly-once delivery must not be claimed for at-least-once transport

## Completion report

Not implemented. No backend migrations, NestJS endpoints, gateway integration or staging results have been verified by this planning deliverable. Record changed files, migration IDs, test commands/results, deployment environment and remaining limits here when implementation is actually completed.
