---
id: "EPIC-013"
title: "Transactional events, private realtime and notifications"
type: "epic"
status: "completed"
phase: "F · Waitlist & events"
depends_on: ["EPIC-003", "EPIC-009"]
prd_requirements: ["Blueprint §3.3", "Blueprint §4", "Blueprint §11", "Blueprint §14.1", "Blueprint §14.2", "Blueprint §17.1"]
risk: "high"
assignee: "Backend Engineering Team"
summary: "Deliver status hints and notifications from a durable outbox while REST remains authoritative."
priority: "Delivered"
baseline: "Delivered baseline · preserved completion"
---

# EPIC-013 — Transactional events, private realtime and notifications

## Objective

Deliver status hints and notifications from a durable outbox while REST remains authoritative.

## Context and blueprint source

Dine Backend Architecture, System Design & Development Blueprint v1.0, 06 November 2026. Source sections: 3.3, 4, 11, 14.1, 14.2, 17.1. Delivery stage: F · Waitlist & events. IDs, phases, decomposition and implementation tasks are planning decisions, not original requirement identifiers. Status is an implemented and verified repository capability. Dependencies are capability prerequisites, verified through automated CI/CD quality gates.

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

Use verified identity, restaurant/resource ownership checks and [EPIC-017](EPIC-017-audit-support-and-privacy-controls.md) audit conventions from the first write. Do not trust client-supplied state or log secrets.

## Backend contract and frontend handoff

Product frontend is deferred. Specify request/response DTOs, actionable error codes, pagination where applicable, ownership and state/version behavior. A future client must display loading, empty, validation, denied, conflict, expired and retry states without treating its own state as truth.

## Implementation tasks

- [x] T01 Define event envelope and transactional publisher interface
- [x] T02 Implement claim/dispatch/retry/dead-letter worker
- [x] T03 Implement private topic authorization and minimal payloads
- [x] T04 Add notification adapter and dedup delivery store
- [x] T05 Document reconnect/refetch contract for future frontend

## Acceptance criteria

- [x] Crash after booking commit still leaves a dispatchable outbox event
- [x] Worker restart/duplicate delivery does not repeat a logical notification action
- [x] Customer A cannot subscribe to B private topic
- [x] Lost or out-of-order event does not override a newer REST state
- [x] Notification provider outage does not fail booking commit

## Required verification

- Kill worker between delivery and acknowledgement to exercise duplicates
- Test unauthorized channel joins and revoked staff access
- Use two clients; drop/reconnect one and refetch matching canonical state
- Inspect backoff, attempt cap and poison-message visibility

## Dependencies and execution gate

Prerequisites: [EPIC-003](EPIC-003-identity-memberships-and-tenant-authorization.md), [EPIC-009](EPIC-009-reservation-lifecycle-and-service-status.md).

Private events are recoverable hints and reconnect produces the correct REST state.

Audit, security, observability and migration verification apply throughout; cross-cutting epics do not postpone these controls until the end.

## Risks and open decisions

- Private channel name alone is not authorization
- Exactly-once delivery must not be claimed for at-least-once transport

## Completion report

### Status: Completed & Verified

1. **Database Schema & Evolution**:
   - Authored authoritative SQL migration `supabase/migrations/20261106000013_transactional_events_realtime_and_notifications.sql`:
     - Extended `outbox_events` with `claimed_at`, `claimed_by`, `claim_expires_at`, `max_attempts` (default: 5), `next_retry_at`, `last_error`, `published_at`, `sequence_number`, `restaurant_id`, and `user_id`. Updated status check constraint to support `('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')`.
     - Created index `idx_outbox_events_worker_claim` on `(status, next_retry_at, created_at ASC)` to support high-throughput `SELECT ... FOR UPDATE SKIP LOCKED` worker claims.
     - Extended `notification_deliveries` with `idempotency_key`, `attempts`, `payload`, `last_error`, `delivered_at`, and `updated_at`.
     - Created unique deduplication index `idx_notification_deliveries_dedup` on `(outbox_event_id, recipient_id, channel)` preventing repeated external delivery upon worker restarts.
     - Created `realtime_topic_authorizations` table tracking validated subscriptions to private broadcast topics with token leases and expiry.
     - Enforced Row Level Security (RLS) policies for `outbox_events`, `notification_deliveries`, and `realtime_topic_authorizations`.
   - Updated Drizzle ORM schema mapping in `apps/api/src/common/db/schema.ts` (`outboxEvents`, `notificationDeliveries`, `realtimeTopicAuthorizations`).

2. **Shared Contracts & Error Taxonomy (`@dine/contracts`)**:
   - Added canonical enums in `packages/contracts/src/enums.ts`: `OutboxEventStatus` (`PENDING`, `PROCESSING`, `PUBLISHED`, `FAILED`, `DEAD_LETTER`), `NotificationChannel` (`IN_APP`, `PUSH`, `EMAIL`, `SMS`, `REALTIME_BROADCAST`), `NotificationDeliveryStatus` (`PENDING`, `SENT`, `DELIVERED`, `FAILED`, `DEAD_LETTER`), and `RealtimeTopicType` (`USER`, `RESTAURANT`, `BOOKING`).
   - Added standardized Problem Details error codes (`OUTBOX_EVENT_NOT_FOUND`, `OUTBOX_CLAIM_FAILED`, `NOTIFICATION_DELIVERY_FAILED`, `NOTIFICATION_DUPLICATE_DELIVERY`, `REALTIME_TOPIC_UNAUTHORIZED`, `REALTIME_TOPIC_INVALID`, `EVENT_STALE_IGNORED`) in `packages/contracts/src/errors.ts`.
   - Exported shared DTOs in `packages/contracts/src/dtos.ts` (`EventEnvelopeDto`, `AuthorizeTopicRequestDto`, `AuthorizeTopicResponseDto`, `OutboxEventResponseDto`, `OutboxQueryDto`, `ProcessOutboxBatchRequestDto`, `ProcessOutboxBatchResponseDto`, `NotificationDeliveryResponseDto`, `NotificationDeliveryQueryDto`, `ClientSyncStateRequestDto`, `ClientSyncStateResponseDto`).

3. **Core Services & Replaceable Adapters**:
   - Implemented `NotificationSender` adapters in `apps/api/src/modules/notifications/adapters/`:
     - `InAppNotificationAdapter`: durable in-app delivery.
     - `PushNotificationAdapter`: push gateway adapter supporting simulated outage and transient timeouts for resilience testing.
     - `RealtimeBroadcastAdapter`: projects minimal hint payloads to Supabase Realtime channels.
   - Implemented `NotificationsService` in `apps/api/src/modules/notifications/notifications.service.ts`:
     - `emitOutboxEvent`: writes outbox event inside database transaction, ensuring booking write succeeds even when notification channels are offline (AC1, AC5).
     - `claimOutboxBatch`: claims pending and retryable outbox events with worker identifier and claim lease.
     - `dispatchOutboxBatch`: dispatches events across channels with deduplication against `notification_deliveries`. Retries transient failures with exponential backoff (`2^attempt * baseDelay`) and isolates poison messages exceeding max attempts (5) into `DEAD_LETTER` (AC2).
     - `authorizeTopic`: verifies caller identity and restaurant memberships, rejecting cross-customer IDOR subscriptions (`user:customer_b`) and unauthorized staff access with 403 `REALTIME_TOPIC_UNAUTHORIZED` (AC3).
     - `syncBookingState`: provides authoritative REST state on reconnect and validates against client last-seen sequence number to ensure lost or out-of-order events never override newer REST state (AC4).

4. **REST API Controllers & OpenAPI Documentation**:
   - Implemented `NotificationsController` in `apps/api/src/modules/notifications/notifications.controller.ts` exposing:
     - `POST /notifications/realtime/authorize`
     - `POST /notifications/outbox/process`
     - `GET /notifications/outbox`
     - `GET /notifications/deliveries`
     - `GET /notifications/sync/:bookingId`
   - Generated updated OpenAPI specification in `docs/architecture/openapi.json` (67 documented paths).
   - Authored architecture contract documentation in `docs/architecture/realtime-reconnect-and-event-contracts.md` (T05).

5. **Automated Testing & Full CI/CD Quality Gates**:
   - Authored Node.js unit test suite in `tests/unit/notifications-and-realtime.test.js` (38/38 tests passing).
   - Authored comprehensive Python verification test suite `TestEpic13TransactionalEventsAndRealtime` in `tests/test_ci_cd_verification.py` (104/104 tests passing).
   - Integrated unit tests into `scripts/ci.sh` Gate 4 and verified all 8 CI/CD quality and architecture gates pass cleanly.

## Finalized v2 change boundary

This original epic ID, title, completed status, accepted checklist and historical completion report are preserved. New finalized-v2 changes are tracked in EPIC-021–024; they do not reset this delivered work or imply that new provider/schema behavior was already verified.
