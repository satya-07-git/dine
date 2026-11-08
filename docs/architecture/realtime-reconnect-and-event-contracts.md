# Realtime Reconnect, Event Envelopes, and Client State Reconciliation

## Status
**Approved Contract** (06 November 2026)  
Fulfills **Task T05** of **EPIC-013** and implements **ADR-006** (*Realtime Status as Projection Reconciled Against Database/REST*).

---

## 1. Architectural Principles

1. **Server-Authoritative System of Record**: PostgreSQL and the NestJS REST API remain the single source of truth for all bookings, table allocations, waitlists, and payments.
2. **Realtime as Ephemeral Hints**: WebSockets and Supabase Realtime Broadcast messages are informational triggers for client UI refresh, **never** authoritative confirmation of reservations, payments, or physical seating.
3. **Transactional Outbox Decoupling**: Mutating booking endpoints commit business state changes and an `outbox_events` record within the **exact same database transaction**. Critical API endpoints never block on external push gateways, APNs/FCM servers, or WebSocket transport.
4. **At-Least-Once Delivery with Deduplication**: The asynchronous outbox worker guarantees at-least-once dispatch. Duplicate deliveries are deduplicated at both the transport layer (`notification_deliveries` unique constraint) and the consumer client layer.
5. **Mandatory REST Reconciliation on Reconnect**: When mobile/web clients launch, resume from background, switch network interfaces (e.g. Wi-Fi to 5G), or reconnect to WebSockets, they **must** fetch the authoritative REST snapshot (`GET /v1/notifications/sync/:bookingId` or `GET /v1/bookings/:id`).

---

## 2. Event Envelope Specification

Every transactional event emitted into `outbox_events` adheres to the canonical envelope:

```typescript
export interface EventEnvelopeDto<T = Record<string, unknown>> {
  event_id: string;          // UUIDv4 event identifier
  aggregate_type: string;    // e.g. "BOOKING", "WAITLIST_OFFER", "PAYMENT"
  aggregate_id: string;      // UUID of the primary aggregate root
  event_type: string;        // e.g. "booking.confirmed", "booking.seated"
  sequence_number: number;   // 1-indexed monotonic per-aggregate sequence
  occurred_at: string;       // ISO 8601 UTC timestamp
  restaurant_id?: string;    // Scoping restaurant UUID
  user_id?: string;          // Scoping recipient user UUID
  payload: T;                // Event domain payload
}
```

---

## 3. Private Realtime Topic Topology & Authorization

Supabase Realtime Broadcast channels are strictly partitioned by tenant and recipient scope:

| Topic Pattern | Target Audience | Authorization Rule | Sample Events |
| :--- | :--- | :--- | :--- |
| `user:<userId>` | Specific Customer | Authenticated JWT `sub` must match `<userId>`. Other guests are rejected with `403 FORBIDDEN`. | `booking.confirmed`, `waitlist.offer_extended` |
| `restaurant:<restaurantId>` | Active Restaurant Staff | Authenticated user must hold `ACTIVE` membership with role `OWNER`, `MANAGER`, or `HOST`. | `booking.status_changed`, `booking.ready`, `booking.seated` |
| `booking:<bookingId>` | Guest & Assigned Staff | Caller must be the booking guest or staff of the hosting restaurant. | `booking.status_changed`, `booking.cancelled` |

### Minimal Payload Projection (ADR-006)
To prevent sensitive customer PII or payment secrets from leaking over shared or broadcast transports, realtime broadcasts project a strictly stripped **hint payload**:

```json
{
  "event_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "entity_id": "c1f7b8e2-5a24-4f01-90a6-192e5927c3ab",
  "event_type": "booking.status_changed",
  "status": "READY",
  "sequence_number": 4,
  "version": 3,
  "occurred_at": "2026-11-06T19:15:00.000Z"
}
```

---

## 4. Client State Reconciliation Algorithm

When a client receives a broadcast event or reconnects after disconnection:

```text
       Incoming Realtime Event / Reconnect Trigger
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  Check Incoming sequence_number  │
        │    & version against Local State │
        └──────────────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
incoming.sequence <= local.sequence     incoming.sequence > local.sequence
OR incoming.version <= local.version    OR incoming.sequence > local.sequence + 1
         │                               │
         ▼                               ▼
┌───────────────────────────┐   ┌──────────────────────────────────┐
│ STALE / DUPLICATE EVENT   │   │ OUT-OF-ORDER OR MISSED EVENTS    │
│ Action: Safely drop hint. │   │ Action: Trigger authoritative    │
│ Local state is newer.     │   │ REST refetch:                    │
│ Do NOT overwrite UI!      │   │ GET /v1/notifications/sync/:id   │
└───────────────────────────┘   └──────────────────────────────────┘
                                                 │
                                                 ▼
                                ┌──────────────────────────────────┐
                                │ Canonical REST Snapshot Applied  │
                                │ Local state updated to server    │
                                └──────────────────────────────────┘
```

### Pure Reconciliation Helper
```typescript
export function reconcileClientState(
  clientSeq: number | undefined,
  clientVersion: number | undefined,
  serverSeq: number,
  serverVersion: number
): { isStale: boolean; shouldIgnoreIncoming: boolean; missedEventsCount: number } {
  const cSeq = clientSeq ?? 0;
  const cVer = clientVersion ?? 0;

  const isStale = cSeq < serverSeq || cVer < serverVersion;
  const shouldIgnoreIncoming = cSeq >= serverSeq && cVer >= serverVersion;
  const missedEventsCount = Math.max(0, serverSeq - cSeq);

  return { isStale, shouldIgnoreIncoming, missedEventsCount };
}
```

---

## 5. Worker Deduplication & Poison Message Isolation

1. **Delivery Deduplication Key**:  
   `idempotency_key = outbox_event_id + ":" + recipient_id + ":" + channel`  
   Protected by authoritative unique database index:
   ```sql
   CREATE UNIQUE INDEX idx_notification_deliveries_dedup
     ON notification_deliveries (outbox_event_id, recipient_id, channel);
   ```
2. **Worker Restart / Crash Recovery**:  
   If an outbox worker crashes after transmitting an external notification but before acknowledging the outbox row, the claim lease expires (`claim_expires_at < NOW()`). Upon restart, the next worker re-claims the event, checks `notification_deliveries`, detects that the channel delivery already succeeded, and marks the event `PUBLISHED` without repeating the notification.
3. **Exponential Backoff**:  
   Failed deliveries calculate retry delay as:  
   `next_retry_at = NOW() + min(1000ms * 2^(attempts - 1), 300000ms)`
4. **Dead-Letter Queue Transition**:  
   After exceeding `max_attempts` (default: 5), events transition to `DEAD_LETTER` status to isolate poison payloads without blocking the queue.
