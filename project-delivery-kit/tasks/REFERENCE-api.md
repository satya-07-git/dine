---
id: "api"
title: "REST API and contract catalog"
---
# REST API and contract catalog

Source: Blueprint §12, with identity/security from §13 and payment trust from §9. All routes below are planned; this dashboard does not call a running Dine API.

## Shared HTTP contract

Illustrative base: https://api.dine.example/v1 — not a deployed URL. JSON requests/responses and versioned OpenAPI. Verify Bearer JWT for private customer/staff routes; verify gateway signatures on the webhook. Public restaurant projections must never expose private booking or staff data.

Idempotency-Key is required for hold creation, order creation, internal offer creation and refund requests. Scope by authenticated principal + endpoint + key, persist payload hash and original result, reject mismatched retry payloads. Accept/decline/cancellation and staff transitions also need repeat-safe domain behavior; exact idempotency header contracts must be documented when implemented.

## All 29 blueprint routes

| Method | Route (under /v1) | Caller / rule | Owning epic |
| --- | --- | --- | --- |
| GET | /me | Authenticated profile/role context | EPIC-003 |
| GET | /restaurants | Public filtered discovery, bounded | EPIC-005 |
| GET | /restaurants/nearby | Validated radius / location | EPIC-005 |
| GET | /restaurants/:id | Published details/policies | EPIC-004 |
| GET | /restaurants/:id/menu | Public catalog | EPIC-005 |
| GET | /restaurants/:id/packages | Published dining experiences | EPIC-015 |
| GET | /restaurants/:id/floor-plan | Versioned static geometry | EPIC-006 |
| GET | /restaurants/:id/availability | Party/time-scoped snapshot | EPIC-007 |
| GET | /tables/:id/availability | Table eligibility by interval | EPIC-007 |
| POST | /booking-holds | Caller-owned atomic hold; idempotency | EPIC-008 |
| GET | /booking-holds/:id | Own hold and server expiry | EPIC-008 |
| DELETE | /booking-holds/:id | Safely cancel own eligible hold | EPIC-008 |
| POST | /booking-holds/:id/payment-order | Own eligible hold, idempotent server order | EPIC-010 |
| GET | /payments/:id/status | Own trusted payment state | EPIC-010/011 |
| POST | /webhooks/razorpay | Raw-body gateway signature + inbox | EPIC-010 |
| GET | /bookings | Own bounded booking list | EPIC-009 |
| GET | /bookings/:id | Own canonical booking snapshot | EPIC-009 |
| POST | /bookings/:id/cancel | Own booking or explicit authorized staff policy | EPIC-009/011 |
| GET | /bookings/:id/events | Scoped append-only history | EPIC-009/013 |
| POST | /waitlist | Authenticated eligible queue entry | EPIC-012 |
| GET | /waitlist/:id | Own queue position/status | EPIC-012 |
| POST | /waitlist-offers/:id/accept | Own unexpired protected offer; explicit consent | EPIC-012 |
| POST | /waitlist-offers/:id/decline | Own offer; repeat-safe release | EPIC-012 |
| GET | /owner/restaurants/:id/bookings | Active host/manager/owner membership | EPIC-014 |
| PATCH | /owner/bookings/:id/status | Scoped role + transition guard | EPIC-009/014 |
| POST | /owner/bookings/:id/check-in | Valid QR + scoped restaurant role | EPIC-014 |
| PUT | /owner/restaurants/:id/floor-plan | Owner/layout editor + version guard | EPIC-006/014 |
| POST | /owner/restaurants/:id/closures | Authorized scheduling staff | EPIC-004/014 |
| PATCH | /owner/restaurants/:id/policies | Restaurant owner + audit | EPIC-004 |

## Hold example from the source

All IDs, dates and INR 200 deposit are illustrative. The future backend must use its chosen real identifier types and server-controlled values.

```http
POST /v1/booking-holds
Authorization: Bearer <user_access_token>
Idempotency-Key: <client_uuid_v4>
Content-Type: application/json

{
  "restaurant_id": "rest_101",
  "table_id": "T04",
  "starts_at": "2026-11-14T13:30:00Z",
  "party_size": 4
}
```

```json
{
  "hold_id": "hold_abc123",
  "status": "HELD",
  "expires_at": "2026-11-14T13:05:00Z",
  "server_time": "2026-11-14T13:00:00Z",
  "deposit": { "amount_minor": 20000, "currency": "INR" }
}
```

201 Created is the successful creation status. The illustrative hold response's HELD is allocation vocabulary; booking uses HOLD_ACTIVE. EPIC-009 must make this mapping explicit.

```json
{
  "error": {
    "code": "TABLE_UNAVAILABLE",
    "message": "Choose another table or join the waitlist."
  }
}
```

409 Conflict is returned for competing protected inventory. The compact source example omits request_id; the implementation's consistent error envelope must include correlation and actionable next step according to §12.1.

## Response/status conventions

| HTTP | Meaning |
| --- | --- |
| 201 | Created hold/order/entry as documented |
| 200 | Read or successful transition |
| 401 | Missing/invalid authentication |
| 403 | Authenticated but forbidden |
| 404 | Unknown resource; privacy-safe resource handling must be consistent |
| 409 | Inventory, version or mismatched-idempotency conflict |
| 410 | Expired resource/action |
| 422 | Business validation failure |
| 429 | Rate limited |

DTOs must specify timezone/instant parsing, pagination/cursors for lists, field validation, ownership, state/version, retry behavior and machine-readable error codes. Body-provided user ID, price, end time or deadline never replaces server authority.

## Explicit source contract gaps

The blueprint lists capabilities beyond its route catalog. Do not silently invent their routes or rules. Resolve during the owning epic:

- FREE_RESERVATION confirmation action: direct confirmation vs hold-then-confirm and exact route.
- Own waitlist-offer snapshot and leave-queue actions.
- Restaurant profile/hours/menu/media/package management and staff invitations/membership writes.
- Walk-in, table-block and no-show write contracts plus QR proof details.
- Refund/support/reconciliation intervention routes and operational authorization.
- Favorites/preferences/review endpoints, eligible-review and moderation policy.
- Event envelope, private topic authorization and notification/support operations.

These gaps do not remove named backend modules. They identify decisions required before their implementation. No healthcare, subscription or AI scope is imported from the Clinify design reference.
