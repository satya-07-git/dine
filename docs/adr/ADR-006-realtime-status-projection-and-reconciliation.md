# ADR-006: Realtime Status as Projection Reconciled Against Database/REST

## Status
**Approved** (06 November 2026)

## Context
Mobile clients need immediate visual feedback when reservations are confirmed, table holds expire, waitlist offers arrive, or restaurant hosts update guest status (Ready, Seated, Completed). However, WebSocket channels, push notifications, and network connections in mobile environments are inherently unreliable, subject to packet drops, background app suspension, reconnect lag, and out-of-order delivery.

## Decision Drivers
- **Data Integrity & Consistency**: Prevent stale client UI from presenting invalid booking or payment state as truth.
- **Reliability Across Disconnects**: Guests transitioning between cellular networks or resuming suspended apps must recover exact server state.
- **Transactional Outbox Decoupling**: API write operations should not block on WebSocket push delivery or external push gateways.

## Decision Outcome
Realtime updates are **informational projections**, not authoritative state:
1. **Transactional Outbox**: All domain state changes commit an event row to `outbox_events` within the primary database transaction.
2. **Asynchronous Dispatch**: An outbox worker reads committed events and broadcasts them over Supabase Realtime Broadcast channels (scoped by user ID or restaurant ID).
3. **Optimistic UX Hints Only**: Clients treat incoming realtime messages as cues to update UI or trigger a lightweight refresh.
4. **Authoritative REST Reconciliation**:
   - Clients reconnecting, coming out of background mode, or receiving an event must verify canonical state by fetching the authoritative REST endpoint (`GET /v1/bookings/:id` or `GET /v1/restaurants/:id/floor-plan`).
   - Every status event includes an entity version or monotonic timestamp to detect out-of-order delivery.
   - Client applications must never confirm a reservation, declare payment complete, or assert occupancy based on client-side state alone.

## Consequences
### Positive
- Resilience to network drops, app backgrounding, and delivery failures.
- Zero risk of phantom bookings caused by client-side socket message spoofing or race conditions.
- High throughput: outbox worker absorbs burst loads without slowing down critical write transactions.

### Negative / Tradeoffs
- Slight eventual consistency delay (typically < 500ms) between database commit and broadcast arrival on client devices.

## Source Traceability
- Dine Blueprint §1.2 (Server-authoritative state)
- Dine Blueprint §2.3 (Stack decisions - Realtime & Workers)
- Dine Blueprint §3.3 (Data flow at booking time)
- Dine Blueprint §11.1, §11.2 (Realtime status)
- Dine Blueprint §19.3 (ADR-006)
