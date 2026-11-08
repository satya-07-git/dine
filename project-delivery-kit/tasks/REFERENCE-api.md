---
id: "api"
title: "Finalized /api/v1 REST contract catalog"
---
# Finalized /api/v1 REST contract catalog

Sources: finalized SQL/API supplement §6, base PRD §11 and latest product decisions. The finalized catalog has 22 routes; PRD §11.1 additionally requires logout, giving 23 distinct canonical method/route pairs in this plan. No running v2 endpoint is claimed verified by this dashboard.

## Canonical routes

All routes use /api/v1. Query/DTO details not supplied must be completed in OpenAPI during the owning epic. Private operations derive user/restaurant authority from verified session and membership, never request body IDs alone.

| Method | Relative endpoint | Responsibility | Epic |
| --- | --- | --- | --- |
| POST | /auth/otp/request | Request bounded phone OTP challenge | 003 |
| POST | /auth/otp/verify | Verify identity and issue session | 003 |
| POST | /auth/logout | Revoke session; retained from PRD §11.1 | 003 |
| GET | /restaurants | Bounded discovery with advisory filters | 007 |
| GET | /restaurants/:id | Published profile and policies | 005/007 |
| GET | /restaurants/:id/floor-plan | Stable versioned table geometry | 006 |
| GET | /restaurants/:id/availability | Interval/party capacity and active-claim eligibility | 009 |
| POST | /recommendations/tables | Deterministically rank eligible candidates | 011 |
| POST | /holds | Acquire exclusive temporary claim | 010 |
| GET | /holds/:id | Inspect own hold and server expiry | 010 |
| DELETE | /holds/:id | Safely release own hold | 010 |
| POST | /reservations/free | Atomically confirm valid FREE-mode hold | 012 |
| POST | /payments/orders | Initiate/reuse DEPOSIT order | 013 |
| POST | /payments/verify | Verify server-side payment evidence | 013 |
| POST | /webhooks/razorpay | Raw-body signature and durable inbox | 013 |
| GET | /bookings/:id | Canonical own booking and safe recovery status | 012/014 |
| GET | /bookings | Own bounded booking history | 012 |
| POST | /bookings/:id/cancel | Policy-checked cancellation | 012/014 |
| GET | /restaurant-ops/reservations | Scoped staff reservation list | 015 |
| POST | /restaurant-ops/bookings/:id/check-in | Record authorized arrival | 015 |
| POST | /restaurant-ops/bookings/:id/seat | Record seating | 015 |
| POST | /restaurant-ops/bookings/:id/complete | Complete visit | 015 |
| POST | /restaurant-ops/table-blocks | Protected operational block | 015 |

## Source differences and compatibility

| Older source contract | Finalized plan | Resolution |
| --- | --- | --- |
| /v1/booking-holds and nested payment-order | /api/v1/holds and /api/v1/payments/orders | Legacy alias/deprecation contract must be reviewed; do not break existing clients silently |
| PRD /restaurant-ops/reservations/:id/check-in, seat, complete | Supplement /restaurant-ops/bookings/:id/check-in, seat, complete | Use finalized supplement as canonical; record aliases if retained |
| PRD /restaurant-ops/tables/:id/block | Supplement /restaurant-ops/table-blocks | Canonical collection write; table ID/interval in validated body |
| PRD hold body reservationStart/reservationEnd | Final supplement startsAt; server derives endsAt | Do not accept arbitrary end/duration without policy validation |
| PRD optional recommendations | Final decision manual + automatic required | Recommendation endpoint belongs to Must scope |
| No logout row in supplement | PRD /auth/logout | Preserve required logout capability rather than dropping session revocation |

## Authoritative hold example

Illustrative UUID placeholders, INR 200 deposit and dates come from the finalized source. The server controls identity, mode, amount, dining end, buffer and expiry.

```http
POST /api/v1/holds
Authorization: Bearer <access-token>
Idempotency-Key: <unique-client-request-id>
Content-Type: application/json

{
  "restaurantId": "restaurant-uuid",
  "tableId": "table-uuid",
  "startsAt": "2026-11-10T13:30:00Z",
  "partySize": 4
}
```

```json
{
  "holdId": "hold-uuid",
  "status": "ACTIVE",
  "tableId": "table-uuid",
  "expiresAt": "2026-11-10T12:02:00Z",
  "serverTime": "2026-11-10T12:00:00Z",
  "payment": { "mode": "DEPOSIT", "amountPaise": 20000, "currency": "INR" }
}
```

```json
{
  "error": {
    "code": "TABLE_UNAVAILABLE",
    "message": "This table is no longer available.",
    "retryable": false
  }
}
```

The conflict's retryable:false does not forbid selecting a different table. It means the same unavailable claim cannot be promised by an automatic repeat. Bounded automatic next-candidate selection is a separate approved operation; manual selection never silently switches tables.

## REST guarantees

- Hold creation, payment initialization, free confirmation and financial side effects require documented idempotency controls. Store actor + operation + key, request hash and original logical response; mismatched key/body fails deterministically.
- All state writes validate current state/version and ownership. A payment success callback or socket event cannot authorize confirmation.
- Webhook authentication uses provider signature against the original raw body; customer verification uses a session plus server-side gateway evidence checks.
- Lists need bounded pagination and privacy-safe projections. Exact cursor/field rules must be completed before coding.
- Standard error details include safe message/code, retry guidance and correlation. Preserve or explicitly migrate existing Problem Details contracts rather than inventing silent incompatibility.

| HTTP | Meaning |
| --- | --- |
| 200/201 | Successful read/transition or creation |
| 400 | Invalid request shape |
| 401 | Authentication required/invalid |
| 403 | Insufficient resource/tenant permission |
| 404 | Resource unknown; keep privacy behavior consistent |
| 409 | Claim, stale version or mismatched idempotency conflict |
| 410 | Hold/action expired |
| 422 | Business rule violation |
| 429 | Rate limited |
| 503 | Temporary dependency unavailable |

## Required capability contracts not enumerated as routes

Manager onboarding/staff/calendar/layout/policy writes; explicit no-show and walk-in/phone booking input; platform support/refund/reconciliation interventions; refresh rotation if used; event replay history/cursor; notification devices/preferences; optional analytics/waitlist. These must receive reviewed DTOs/permissions/idempotency before implementation. They are not additional finalized catalog endpoints invented by this dashboard.
