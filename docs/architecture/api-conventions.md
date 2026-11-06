# REST API Conventions, Idempotency Contracts, and Error Taxonomy

## Purpose
This document establishes the official HTTP conventions, security contracts, idempotency rules, and standardized error response taxonomy for the Dine backend API (`/v1`).

Fulfills **Task T04** of **EPIC-001** and aligns with Blueprint §12 and §13.

---

## 1. Protocol & Communication Standards

- **Base URL**: `https://api.dine.example/v1` (illustrative; environment-configurable via `API_BASE_URL`).
- **Content Type**: `application/json; charset=utf-8` for all requests and responses.
- **Specification**: OpenAPI 3.0 / Swagger specification automatically generated from NestJS DTO decorators at `/v1/docs` (JSON at `/v1/docs-json`).
- **Timestamps**: All timestamps must be represented as **UTC instants in ISO 8601 format** with millisecond precision and explicit `Z` suffix (e.g. `2026-11-06T18:30:00.000Z`). Local timezone offsets are supplied via restaurant profile or request parameters for business-hour checks.
- **Request Correlation**: Every incoming HTTP request must accept or generate an `X-Request-Id` header (UUIDv4). This ID is returned in the response headers, included in every structured log line, and returned inside error responses.

---

## 2. Authentication & Tenancy Authorization

### Bearer JWT
Private customer and staff endpoints require an HTTP `Authorization` header:
```http
Authorization: Bearer <supabase_jwt_token>
```
1. **Verification**: NestJS `AuthGuard` validates the token signature, audience (`authenticated`), expiration (`exp`), and issuer against the Supabase Auth configuration.
2. **Identity Subject**: The token `sub` claim is extracted as the authenticated `user_id`.
3. **Tenant & Role Scoping**:
   - For `/v1/owner/*` routes, `RestaurantGuard` queries `restaurant_memberships` for `user_id` and targeted `restaurant_id`.
   - Role must match required permission level (`Host`, `Manager`, `Owner`, `Platform Admin`).
   - Any request attempting to access or modify data belonging to another restaurant is immediately rejected with `403 Forbidden` (`FORBIDDEN_TENANT_ACCESS`).

---

## 3. Idempotency Specification

### 3.1 Operations Requiring Idempotency
An `Idempotency-Key` HTTP header is **strictly required** for mutating endpoints where duplication causes financial or inventory corruption:
1. `POST /v1/holds` (Hold creation)
2. `POST /v1/payments/orders` (Payment order generation)
3. `POST /v1/bookings/:id/confirm` (Booking confirmation)
4. `POST /v1/bookings/:id/cancel` (Cancellation & refund trigger)
5. `POST /v1/waitlist/offers/:id/accept` (Waitlist offer claim)

### 3.2 Idempotency Contract & Storage
```text
Client Request:
  Idempotency-Key: <client-generated-uuid-or-unique-string>
```
- **Storage Table**: `idempotency_records`
- **Scope Key**: Computed as `sha256(user_id + ":" + request.method + ":" + request.path + ":" + idempotency_key)`.
- **Payload Hash**: Computed as `sha256(request.raw_body)`.
- **Behavior Rules**:
  1. **First Request**: Server begins transaction, takes row-level lock on the idempotency key, executes business logic, records status code, headers, and response body, then commits.
  2. **Identical Replay**: If the same scope key arrives with the **same payload hash**, the server short-circuits execution and returns the original cached response with:
     ```http
     X-Idempotent-Replay: true
     ```
  3. **Mismatched Payload Conflict**: If the same scope key arrives with a **different payload hash**, the server rejects the request immediately:
     ```http
     HTTP/1.1 409 Conflict
     Content-Type: application/json
     {
       "code": "IDEMPOTENCY_PAYLOAD_MISMATCH",
       "message": "The idempotency key was already used with a different request payload.",
       "request_id": "c1f7b8e2-...",
       "retryable": false
     }
     ```
  4. **Concurrent In-Flight Request**: If a second request arrives while the first request is still processing, the second request waits for the lock or receives `409 Conflict` (`IDEMPOTENCY_CONCURRENT_REQUEST`).

---

## 4. Standardized Error Response Taxonomy (RFC 7807)

Every error returned by the API follows a consistent, machine-readable JSON structure:

```json
{
  "code": "INVENTORY_HOLD_CONFLICT",
  "message": "Table T04 is no longer available for the requested dining interval.",
  "status": 409,
  "request_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "timestamp": "2026-11-06T18:30:00.000Z",
  "details": {
    "table_id": "tab_04",
    "requested_period": "[2026-11-10 19:00:00+00, 2026-11-10 20:45:00+00)"
  },
  "next_action": "FETCH_UPDATED_AVAILABILITY",
  "retryable": false
}
```

### HTTP Status Code Semantics

| HTTP Status | Semantic Usage in Dine | Canonical Error Codes |
| :--- | :--- | :--- |
| **200 OK** | Successful read, status transition, or idempotent replay. | N/A |
| **201 Created** | Successful creation of hold, booking, or payment order. | N/A |
| **400 Bad Request** | Malformed JSON, unparseable parameters, invalid types. | `BAD_REQUEST`, `MALFORMED_JSON` |
| **401 Unauthorized** | Missing, expired, or invalid Bearer JWT. | `AUTH_UNAUTHORIZED`, `AUTH_TOKEN_EXPIRED` |
| **403 Forbidden** | Valid identity, but lacks role permission or tenant access. | `FORBIDDEN_TENANT_ACCESS`, `ROLE_NOT_AUTHORIZED` |
| **404 Not Found** | Restaurant, table, booking, or offer ID does not exist. | `RESOURCE_NOT_FOUND` |
| **409 Conflict** | Inventory overlap, concurrent booking clash, idempotency clash. | `INVENTORY_HOLD_CONFLICT`, `IDEMPOTENCY_PAYLOAD_MISMATCH` |
| **410 Gone** | Hold or waitlist offer has expired on server clock. | `HOLD_EXPIRED`, `WAITLIST_OFFER_EXPIRED` |
| **422 Unprocessable** | Semantic business rule violation (e.g. party > capacity, closures). | `PARTY_SIZE_EXCEEDS_CAPACITY`, `RESTAURANT_CLOSED` |
| **429 Too Many Req** | Rate limits exceeded on hold creation or login attempts. | `RATE_LIMIT_EXCEEDED` |
| **500 Internal Error** | Unhandled server exception (sanitized; no secrets in response). | `INTERNAL_SERVER_ERROR` |

---

## 5. Frontend Client Handoff States

Client applications (mobile or web) must implement deterministic handling for the following standardized response states without asserting client-side state as authoritative:

1. **Loading State**: When awaiting hold creation or payment verification, client displays progress indicator; client must not decrement countdown or presume reservation.
2. **Empty State**: When no tables match party size or availability interval, display alternative time slots or waitlist prompt.
3. **Validation Error (`400`/`422`)**: Highlight invalid form inputs (e.g. invalid email, party size < 1) with localized error text from `message`.
4. **Access Denied (`401`/`403`)**: Prompt user to authenticate or notify staff that they lack credentials for this restaurant.
5. **Conflict State (`409`)**: Table was claimed by another customer. Prompt: *"Someone just reserved this table. Here are other available tables at that time."*
6. **Expired State (`410`)**: Server countdown elapsed. Prompt: *"Your 5-minute hold has expired. Please select a table to try again."*
7. **Retryable Network / Server Failure (`502`/`503`/`504`)**: Exponential backoff retry using the same `Idempotency-Key` and `X-Request-Id`.
