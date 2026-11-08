# DINE — Product Requirements Document (PRD)
## Restaurant Table Reservation & Real-Time Booking Platform

**Version:** 1.0  
**Status:** Architecture & MVP Planning  
**Platform:** React Native Mobile Application  
**Architecture:** Modular Monolith  
**Primary Database:** PostgreSQL  
**Product Category:** Restaurant Discovery, Table Reservation & Booking Management

---

# 1. Executive Summary

Dine is a restaurant reservation platform that allows customers to discover restaurants, inspect table availability, select a specific table, temporarily reserve it during checkout, complete payment where required, and receive real-time booking updates.

The platform combines:

- **BookMyShow-style selection:** Visual table selection and availability.
- **Concurrency-safe inventory:** Prevent two customers from reserving the same table for overlapping time intervals.
- **Temporary reservation holds:** Protect a table while a customer completes checkout.
- **Payment orchestration:** Verify payments and reconcile asynchronous gateway events.
- **Uber-style status tracking:** Real-time updates throughout the restaurant booking lifecycle.
- **Restaurant operations:** Allow authorized staff to manage tables, reservations, check-ins and occupancy.

## 1.1 Primary Product Objective

Build a reliable, transaction-safe reservation engine capable of handling concurrent booking attempts without double booking.

## 1.2 Product Success Criteria

The MVP must demonstrate:

1. A customer can select an available restaurant table.
2. Two concurrent users cannot acquire conflicting holds for the same table and time interval.
3. Holds expire safely and release inventory.
4. Successful verified payments lead to confirmed bookings when the reservation remains valid.
5. Payment success does not create duplicate reservations.
6. Customers receive real-time booking updates.
7. Restaurant staff can manage bookings and table availability.
8. Database constraints and transactional operations protect reservation integrity.

---

# 2. Critical Product Decisions

Before development, Dine must distinguish between a cinema seat and a restaurant table.

A cinema seat belongs to a fixed show. A restaurant table can serve multiple groups throughout the day.

Therefore, Dine cannot use only:

`table_id + booked_status`

It must account for:

`restaurant_id + table_id + reservation_time_interval`

### 2.1 Booking Example

Restaurant: R101  
Table: T5  
Capacity: 4 guests

| Reservation | Time | Result |
|---|---|---|
| Customer A | 7:00–8:30 PM | Allowed |
| Customer B | 7:30–9:00 PM | Rejected |
| Customer C | 9:00–10:30 PM | Allowed |

Customer B conflicts with Customer A.

Customer C can book because the reservation intervals do not overlap.

The actual intervals may include restaurant-configured preparation and cleaning buffers.

## 2.2 Core Business Rules

**BR-001:** Each table belongs to exactly one restaurant.

**BR-002:** Each reservation has a defined start and end time.

**BR-003:** Overlapping active reservations for the same table are prohibited.

**BR-004:** A customer may hold a table for a configurable checkout period, initially 2 minutes.

**BR-005:** Expired holds must not be confirmed without a valid recovery policy.

**BR-006:** Payment success and booking confirmation are separate states.

**BR-007:** Restaurant staff may block a table for maintenance or operational reasons.

**BR-008:** Table availability must be verified against the authoritative database before confirmation.

**BR-009:** Every confirmed booking receives a unique booking reference.

**BR-010:** Repeated API calls and payment webhooks must be idempotent.

**BR-011:** A booking is valid only for its specified restaurant, table, date and reservation interval.

**BR-012:** All booking timestamps are stored as timezone-aware values, with restaurant-local time used for display and business scheduling.

---

# 3. User Roles and Permissions

## 3.1 Customer

The customer can:

- Register and authenticate.
- Discover restaurants.
- View table availability.
- Select a date, time and party size.
- Select a table.
- Create a temporary hold.
- Pay a booking deposit when required.
- Track booking status.
- Cancel eligible reservations.
- View booking history.

## 3.2 Restaurant Staff

Authorized staff can:

- View reservations.
- Confirm customer arrival.
- Mark guests as seated.
- Complete reservations.
- Mark no-shows.
- Block tables.
- View occupancy and upcoming arrivals.

## 3.3 Restaurant Manager

The manager can additionally:

- Configure restaurant details.
- Manage floor plans and tables.
- Set operating hours.
- Configure booking duration and buffers.
- Set deposit and cancellation policies.
- Manage staff permissions.

## 3.4 Platform Administrator

The platform administrator can:

- Manage restaurant onboarding.
- Investigate payment disputes.
- Monitor reservation failures.
- Review operational logs.
- Manage platform-level policies.

All permissions must be enforced on the backend using role-based access control and restaurant ownership checks.

---

# 4. Functional Requirements

## Module A — Identity and Authentication

**FR-A01:** Customer login using phone OTP.

**FR-A02:** Secure authenticated sessions.

**FR-A03:** Role-based access for customers, staff, managers and administrators.

**FR-A04:** Restaurant-level tenant isolation.

**FR-A05:** Session revocation and refresh-token rotation where applicable.

### Security Requirements

- OTP expiry and rate limits.
- Server-side authorization.
- Secure token storage.
- Audit logs for privileged actions.
- Protection against enumeration and brute-force attacks.

---

## Module B — Restaurant Discovery

**FR-B01:** Search restaurants by name and location.

**FR-B02:** Filter by cuisine, price range, operating hours and availability.

**FR-B03:** View restaurant information and policies.

**FR-B04:** Select booking date, time and party size.

**FR-B05:** Show restaurants with potentially available tables.

Search results are advisory. Availability must be revalidated when creating a hold.

---

## Module C — Floor Plan and Table Selection

**FR-C01:** Display a restaurant floor plan.

**FR-C02:** Show table position, capacity and type.

**FR-C03:** Indicate available, temporarily held, booked and unavailable tables.

**FR-C04:** Allow selection of a compatible table.

**FR-C05:** Prevent customers from selecting tables that cannot accommodate the requested party size.

**FR-C06:** Refresh availability when reservation parameters change.

### Table States

- AVAILABLE
- HELD
- RESERVED
- OCCUPIED
- BLOCKED

These are user-facing availability classifications, not necessarily a single persisted database enum.

A table may be available for 6 PM and reserved for 8 PM. Availability must be computed for the requested interval.

---

# 5. Reservation and Temporary Hold Engine

This is Dine's most critical backend module.

## 5.1 Hold Creation

When a customer selects Table T5:

1. Client submits restaurant, table, party size and requested reservation interval.
2. Backend authenticates the customer.
3. Backend validates restaurant operating hours.
4. Backend validates table capacity.
5. Backend checks table maintenance blocks.
6. Backend checks overlapping active reservations.
7. Backend checks overlapping unexpired holds.
8. Backend atomically creates a hold if inventory is available.
9. Backend returns hold ID and expiry timestamp.
10. Client displays the checkout countdown.

## 5.2 Hold Response

Example:

```json
{
  "holdId": "hold_123",
  "tableId": "table_T5",
  "status": "ACTIVE",
  "expiresAt": "2026-11-08T14:02:00Z",
  "serverTime": "2026-11-08T14:00:00Z"
}
```

The client countdown is informational.

The server clock and database state determine actual expiry.

## 5.3 Hold Expiry

When a hold expires:

- It is no longer eligible for normal confirmation.
- Its inventory protection must cease.
- The customer receives an expiry status.
- Another customer may acquire the table.
- Any late payment must enter reconciliation rather than automatically confirm the expired hold.

A background worker may update expired hold records, but correctness must not depend on the worker executing at the exact expiry second.

## 5.4 Concurrency Policy

Dine will use PostgreSQL transactions and database-enforced reservation constraints.

The application must never rely exclusively on:

- Frontend button disabling.
- Client-side timers.
- Redis cache availability.
- WebSocket messages.
- A read-then-write sequence without transactional protection.

### Example Race Condition

Customer A and Customer B attempt to reserve T5 simultaneously.

Expected outcome:

- One request successfully acquires the inventory claim.
- The conflicting request fails or is asked to select another table.
- No duplicate active claims are committed.

The winner is determined by successful database serialization and constraint enforcement, not by the customer's displayed click time.

---

# 6. Booking State Machine

Booking and payment lifecycles must be modeled separately.

## 6.1 Booking States

- PENDING_PAYMENT
- CONFIRMED
- CHECKED_IN
- SEATED
- COMPLETED
- CANCELLED
- EXPIRED
- NO_SHOW

## 6.2 Booking Transitions

`PENDING_PAYMENT → CONFIRMED`

`CONFIRMED → CHECKED_IN → SEATED → COMPLETED`

`CONFIRMED → CANCELLED`

`CONFIRMED → NO_SHOW`

`PENDING_PAYMENT → EXPIRED`

Illegal transitions must be rejected by the backend.

For example, a completed reservation cannot be returned directly to PENDING_PAYMENT.

## 6.3 Payment States

- CREATED
- PENDING
- SUCCEEDED
- FAILED
- REFUND_PENDING
- REFUNDED
- REFUND_FAILED

Payment state and booking state must not be merged into one field.

A successful payment can coexist temporarily with an unconfirmed booking while reconciliation is running.

---

# 7. Payment Integration

## 7.1 Payment Flow

1. Customer acquires an active hold.
2. Backend creates a pending booking and payment intent/order.
3. Customer initiates payment.
4. Gateway processes the payment.
5. Backend receives authenticated payment confirmation.
6. Backend verifies payment amount, currency, order reference and gateway status.
7. Backend checks whether the reservation can still be finalized.
8. Backend confirms the booking in a database transaction.
9. Customer receives the booking confirmation.

### Important Constraint

Payment confirmation must not rely solely on the mobile client's success callback.

Gateway server-side verification and authenticated webhooks are required.

## 7.2 Payment Success After Hold Expiry

Scenario:

- Hold expires at 7:02 PM.
- Gateway reports payment success at 7:02:05 PM.
- Another customer has acquired the table.

The original customer cannot automatically receive the table.

The system must:

1. Record the verified payment.
2. Detect the expired or conflicting inventory claim.
3. Mark the booking for reconciliation.
4. Initiate refund or an explicitly authorized alternative resolution.
5. Notify the customer.

## 7.3 Duplicate Webhook Handling

Every gateway event must have a unique event identifier.

The backend must store processed event identifiers and reject duplicate processing while returning the appropriate acknowledgment.

Repeated success webhooks must never create additional bookings.

## 7.4 Payment Idempotency

A repeated payment initialization request with the same idempotency key must return the existing operation result rather than create another payment order.

---

# 8. Recommended System Architecture

## 8.1 Architecture Choice

**Modular Monolith**

A modular monolith is recommended for the MVP because the reservation and payment workflows require strong coordination, while expected early traffic does not justify independent microservice deployment.

### Benefits

- Simpler transactional boundaries.
- Lower infrastructure cost.
- Easier local development.
- Easier debugging.
- Reduced operational complexity.
- Clear migration path toward independent services if needed.

### Limitations

- Modules share a deployment lifecycle.
- Poorly enforced module boundaries can create tight coupling.
- Some components may eventually need independent scaling.

Microservices should not be adopted solely for architectural prestige.

## 8.2 Technology Stack

| Layer | Recommended technology |
|---|---|
| Mobile application | React Native + TypeScript |
| Backend API | NestJS + TypeScript |
| API protocol | REST |
| Primary database | PostgreSQL |
| Database access | Prisma or Drizzle with raw SQL where required |
| Cache and ephemeral coordination | Redis |
| Real-time communication | WebSocket / Socket.IO |
| Background jobs | BullMQ |
| Payment gateway | Razorpay |
| Authentication | OTP-based authentication |
| Object storage | S3-compatible storage |
| API documentation | OpenAPI / Swagger |
| Testing | Vitest or Jest, Supertest |
| Load testing | k6 |
| Containerization | Docker |

PostgreSQL is the source of truth for booking inventory.

Redis supports caching, fan-out and job coordination, not final reservation ownership.

## 8.3 Backend Modules

```text
dine-backend/
  src/
    modules/
      auth/
      users/
      restaurants/
      floor-plans/
      tables/
      availability/
      holds/
      reservations/
      payments/
      realtime/
      notifications/
      restaurant-operations/
      admin/
      audit/
    common/
      database/
      guards/
      exceptions/
      idempotency/
      observability/
    workers/
      hold-expiry/
      payment-reconciliation/
      notification-dispatch/
```

Each module should have clearly defined services, repositories, DTOs, authorization rules and tests.

Cross-module access should occur through explicit interfaces rather than unrestricted database writes.

---

# 9. PostgreSQL Database Design

## 9.1 Core Entities

### Users

- id
- phone
- name
- email
- created_at
- updated_at

### Restaurants

- id
- name
- description
- address
- latitude
- longitude
- timezone
- status
- created_at

### Restaurant Staff

- id
- restaurant_id
- user_id
- role
- status

### Floor Plans

- id
- restaurant_id
- name
- version
- is_active

### Tables

- id
- restaurant_id
- floor_plan_id
- table_number
- capacity_min
- capacity_max
- position_x
- position_y
- table_type
- operational_status

### Reservation Holds

- id
- restaurant_id
- table_id
- user_id
- reservation_start
- reservation_end
- expires_at
- status
- idempotency_key
- created_at

### Reservations

- id
- restaurant_id
- table_id
- user_id
- hold_id
- booking_reference
- reservation_start
- reservation_end
- party_size
- status
- confirmed_at
- created_at

### Payments

- id
- reservation_id
- gateway_order_id
- gateway_payment_id
- amount
- currency
- status
- idempotency_key
- created_at

### Payment Events

- id
- gateway_event_id
- payment_id
- event_type
- processing_status
- received_at

### Table Blocks

- id
- restaurant_id
- table_id
- blocked_start
- blocked_end
- reason
- created_by

### Reservation Events

- id
- reservation_id
- event_type
- previous_status
- new_status
- actor_id
- created_at

## 9.2 Database Relationships

- One restaurant has many tables.
- One restaurant has many floor plans.
- One user has many reservations.
- One table has many reservations over time.
- One reservation can have multiple payment attempts.
- One reservation has many lifecycle events.
- One restaurant has many staff members.

All restaurant-scoped queries must enforce tenant ownership.

---

# 10. Database-Level Double-Booking Prevention

A critical design principle is that conflicting reservation claims must be rejected by the database.

## 10.1 PostgreSQL Range Constraints

PostgreSQL supports range types and exclusion constraints.

For confirmed reservations, a simplified design can use:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
ADD CONSTRAINT no_overlapping_reservations
EXCLUDE USING gist (
  table_id WITH =,
  tstzrange(
    reservation_start,
    reservation_end,
    '[)'
  ) WITH &&
)
WHERE (
  status IN (
    'CONFIRMED',
    'CHECKED_IN',
    'SEATED'
  )
);
```

This prevents overlapping active confirmed reservations for the same table.

The `[)` interval includes the start and excludes the end, allowing adjacent non-overlapping bookings.

**Important:** This constraint alone is insufficient for temporary holds.

## 10.2 Unified Inventory Claims

The production design should use a unified inventory-claim mechanism for both temporary holds and confirmed reservations.

Recommended claim fields:

- id
- restaurant_id
- table_id
- interval_start
- interval_end
- claim_type
- claim_status
- expires_at
- hold_id
- reservation_id

A partial exclusion constraint can protect all active claims.

Because PostgreSQL partial constraints cannot safely depend on a moving `NOW()` condition, expired claims must be explicitly transitioned out of the active constraint set inside a properly serialized transaction before inventory is reused.

## 10.3 Transactional Lock Acquisition

Recommended procedure:

1. Begin database transaction.
2. Acquire a table-scoped transaction lock.
3. Transition expired claims for the target table to inactive.
4. Check conflicting active claims and table blocks.
5. Insert the new active claim.
6. Commit.
7. Return the hold.

The transaction lock can use `SELECT ... FOR UPDATE` on the table record or a carefully designed advisory-lock strategy.

The exclusion constraint remains the final safety mechanism.

All booking, hold, cancellation and administrative block paths must follow the same inventory protocol.

---

# 11. API Design

## 11.1 Authentication

`POST /api/v1/auth/otp/request`

`POST /api/v1/auth/otp/verify`

`POST /api/v1/auth/logout`

## 11.2 Restaurant Discovery

`GET /api/v1/restaurants`

`GET /api/v1/restaurants/:id`

`GET /api/v1/restaurants/:id/floor-plan`

## 11.3 Availability

`GET /api/v1/restaurants/:id/availability`

Parameters:

- date
- startTime
- partySize

Response includes table identifiers, capacity, availability and optional recommendations.

## 11.4 Hold Creation

`POST /api/v1/holds`

Example request:

```json
{
  "restaurantId": "rest_101",
  "tableId": "table_T5",
  "reservationStart": "2026-11-08T13:30:00Z",
  "reservationEnd": "2026-11-08T15:00:00Z",
  "partySize": 4
}
```

Headers:

`Idempotency-Key: unique-client-request-id`

Possible responses:

- `201 Created` — hold acquired.
- `409 Conflict` — table unavailable.
- `422 Unprocessable Entity` — invalid party size or reservation interval.
- `429 Too Many Requests` — rate limit exceeded.

## 11.5 Hold Inspection

`GET /api/v1/holds/:id`

## 11.6 Payment Initialization

`POST /api/v1/payments/orders`

## 11.7 Payment Verification

`POST /api/v1/payments/verify`

## 11.8 Payment Webhook

`POST /api/v1/webhooks/razorpay`

The webhook must verify the gateway signature before processing.

## 11.9 Booking Operations

`GET /api/v1/bookings/:id`

`GET /api/v1/bookings`

`POST /api/v1/bookings/:id/cancel`

## 11.10 Restaurant Operations

`GET /api/v1/restaurant-ops/reservations`

`POST /api/v1/restaurant-ops/reservations/:id/check-in`

`POST /api/v1/restaurant-ops/reservations/:id/seat`

`POST /api/v1/restaurant-ops/reservations/:id/complete`

`POST /api/v1/restaurant-ops/tables/:id/block`

All state-changing endpoints require authentication, authorization, validation and appropriate idempotency controls.

---

# 12. Real-Time Booking Status

Dine should provide live status updates similar to ride-tracking applications, but with restaurant-specific events.

## 12.1 Customer Timeline

1. Table selected.
2. Table temporarily held.
3. Payment processing.
4. Booking confirmed.
5. Restaurant preparing for arrival.
6. Customer checked in.
7. Customer seated.
8. Reservation completed.

The restaurant-preparation status is optional and should only appear if staff workflows support it.

## 12.2 WebSocket Events

- `table.availability.changed`
- `hold.created`
- `hold.expired`
- `booking.confirmed`
- `booking.cancelled`
- `booking.checked_in`
- `booking.seated`
- `booking.completed`

Events should include:

- eventId
- eventType
- entityId
- version
- timestamp
- payload

## 12.3 Reconnection Handling

After reconnecting:

1. Client authenticates the WebSocket connection.
2. Client subscribes to authorized restaurant or booking channels.
3. Client fetches authoritative current state.
4. Client ignores stale or duplicate events.
5. Client updates the UI.

WebSocket delivery must not be treated as guaranteed or authoritative.

---

# 13. Best Available Table Recommendation

Dine may provide an optional automatic table recommendation feature.

## 13.1 Inputs

- Party size.
- Table capacity.
- Requested time.
- Table availability.
- Customer preferences.
- Restaurant floor plan.
- Seating zone.
- Operational constraints.

## 13.2 Recommendation Logic

A simplified scoring model:

`Score = Capacity Fit + Preference Match + Location Suitability + Operational Efficiency`

Only tables passing mandatory availability and capacity checks are eligible.

## 13.3 MVP Algorithm

1. Retrieve compatible available tables.
2. Exclude blocked or conflicting tables.
3. Calculate capacity waste.
4. Apply customer preferences.
5. Rank candidates.
6. Return the highest-ranked tables.

For example, a party of two should generally not consume a six-person table when suitable two-person tables are available, unless restaurant policy allows it.

This feature should remain advisory. Final booking must pass the same transactional inventory checks as manual table selection.

---

# 14. Restaurant Administration

The restaurant dashboard must support:

- Floor plan configuration.
- Table capacity management.
- Operating hours.
- Reservation duration policies.
- Cleaning and turnover buffers.
- Booking deposit rules.
- Reservation cancellation.
- Table maintenance blocks.
- Staff access management.
- Booking history.
- Daily reservation overview.

## Operational Rule

When a manager attempts to block a table that already has a confirmed reservation, the system must identify the conflict.

It must not silently cancel a customer booking.

A privileged resolution workflow should be required.

---

# 15. Non-Functional Requirements

## 15.1 Performance Targets

Initial engineering targets, subject to load testing:

- Availability API p95 latency: under 300 ms in the defined test environment.
- Hold creation p95 latency: under 500 ms at planned MVP load.
- Booking status propagation: under 2 seconds in normal operation.
- No duplicate active reservations under tested concurrency.

These are targets, not guaranteed production measurements.

## 15.2 Reliability

- Durable PostgreSQL transactions.
- Automated backups.
- Payment reconciliation jobs.
- Retryable background processing.
- Dead-letter handling for repeatedly failing jobs.
- Graceful handling of gateway outages.

## 15.3 Security

- HTTPS.
- Parameter validation.
- Backend authorization.
- OTP rate limiting.
- Secure payment webhook verification.
- Database least-privilege access.
- Sensitive-data minimization.
- Audit trails for staff and administrative actions.

## 15.4 Observability

Collect:

- Booking attempt rate.
- Hold acquisition success rate.
- Hold conflict rate.
- Hold expiry rate.
- Payment success rate.
- Payment-to-booking reconciliation failures.
- Booking confirmation latency.
- WebSocket reconnect frequency.
- API error rate.
- Database transaction contention.

---

# 16. Testing Strategy

## 16.1 Unit Tests

Test:

- Availability interval overlap.
- Capacity validation.
- Booking transition rules.
- Hold expiry rules.
- Recommendation scoring.
- Cancellation policy evaluation.

## 16.2 Integration Tests

Test:

- Hold creation against PostgreSQL.
- Conflicting hold rejection.
- Expired hold replacement.
- Payment verification.
- Duplicate webhook processing.
- Booking confirmation transaction.
- Tenant isolation.

## 16.3 Concurrency Tests

### Test Case C-001

100 concurrent requests attempt to acquire the same table for the same interval.

Expected:

- Exactly one active inventory claim.
- No duplicate confirmed reservations.
- Remaining requests receive conflict or controlled retry responses.

### Test Case C-002

Two customers reserve the same table for non-overlapping intervals.

Expected:

- Both reservations may succeed.

### Test Case C-003

Payment success arrives after hold expiry and another customer acquires the table.

Expected:

- No conflicting booking confirmation.
- Late payment enters reconciliation.

### Test Case C-004

Payment webhook is delivered repeatedly.

Expected:

- One logical payment update.
- One confirmed booking.
- No duplicate financial side effects.

### Test Case C-005

Backend crashes after payment verification but before booking confirmation.

Expected:

- Durable payment record.
- Recovery through reconciliation.
- No duplicate booking.

### Test Case C-006

Two staff members and one customer attempt conflicting table operations simultaneously.

Expected:

- Inventory constraints remain valid.
- At most one conflicting operation succeeds.

---

# 17. MVP Scope

## Must Have

- Customer authentication.
- Restaurant listings.
- Table inventory.
- Reservation date and time selection.
- Interactive floor plan.
- Atomic temporary holds.
- Hold expiry.
- Booking confirmation.
- Payment integration for deposit-required bookings.
- Payment reconciliation.
- Real-time booking status.
- Restaurant staff booking dashboard.
- Basic cancellation.
- Concurrency and integration tests.

## Should Have

- Best available table recommendations.
- Push notifications.
- Restaurant analytics.
- Waitlist.
- Booking reminders.

## Future Features

- Multi-table reservations.
- Table joining and splitting.
- Restaurant POS integrations.
- Dynamic pricing.
- Loyalty programs.
- Restaurant subscription billing.
- Advanced occupancy forecasting.
- AI-based seating optimization.

Future features must not compromise the correctness of the MVP reservation engine.

---

# 18. Development Roadmap

## Phase 0 — Domain and Architecture Design

Deliverables:

- Final business rules.
- Booking lifecycle.
- Payment lifecycle.
- Database ERD.
- API contracts.
- Inventory concurrency design.
- Failure-mode analysis.

**Exit criterion:** All critical booking and payment scenarios have documented outcomes.

## Phase 1 — Backend Foundation

Deliverables:

- NestJS application.
- PostgreSQL configuration.
- Database migrations.
- Authentication.
- Authorization.
- Restaurant and table modules.
- API documentation.

**Exit criterion:** Authorized users can create and retrieve restaurant and table data.

## Phase 2 — Reservation Engine

Deliverables:

- Availability queries.
- Transactional inventory claims.
- Temporary holds.
- Hold expiry.
- Booking state transitions.
- Concurrency tests.

**Exit criterion:** Concurrent requests cannot create conflicting active claims.

## Phase 3 — Payment and Reconciliation

Deliverables:

- Razorpay integration.
- Payment records.
- Webhook verification.
- Idempotency.
- Booking finalization.
- Refund and reconciliation workflows.

**Exit criterion:** Duplicate, delayed and failed payment events cannot cause duplicate reservations.

## Phase 4 — Real-Time Operations

Deliverables:

- WebSocket gateway.
- Booking event delivery.
- Staff status updates.
- Client reconnection recovery.
- Notification dispatch.

**Exit criterion:** Customer and restaurant views converge on authoritative booking state.

## Phase 5 — React Native Integration

Deliverables:

- Restaurant discovery screens.
- Floor plan.
- Table selection.
- Checkout countdown.
- Payment UI.
- Booking status screen.
- Booking history.

**Exit criterion:** Complete customer booking journey works end to end.

## Phase 6 — Quality Assurance and Pilot

Deliverables:

- Automated integration tests.
- Concurrency load tests.
- Security review.
- Failure injection.
- Payment reconciliation validation.
- Limited restaurant pilot.

**Exit criterion:** Critical reservation integrity tests pass and the pilot meets agreed operational acceptance criteria.

---

# 19. Business and Commercial Requirements

Dine must define who pays the platform and why.

Possible revenue models:

### Model A — Per-Booking Commission

The restaurant pays Dine for eligible completed reservations.

**Advantages:** Low entry barrier for restaurants.

**Disadvantages:** Revenue depends on booking volume, attribution and restaurant reporting.

### Model B — Restaurant SaaS Subscription

Restaurants pay for reservation management software.

**Advantages:** Potentially predictable recurring revenue.

**Disadvantages:** Requires clear operational ROI and customer support.

### Model C — Hybrid Model

A base subscription plus booking-related fees.

**Advantages:** Multiple revenue sources.

**Disadvantages:** More complex pricing and potential resistance from restaurants.

The MVP must not assume restaurants will pay merely because a booking interface exists.

Before commercialization, validate:

- Restaurant willingness to pay.
- Booking volume.
- Existing reservation processes.
- No-show rates.
- Staff time saved.
- Customer acquisition cost.
- Support and payment-processing costs.

---

# 20. Definition of Done

The MVP is technically ready for controlled pilot only when:

1. Reservation integrity is enforced at database level.
2. No double bookings occur in defined concurrency tests.
3. Hold expiry works independently of the mobile timer.
4. Duplicate payment events are idempotent.
5. Late payments are reconciled.
6. Restaurant staff cannot bypass inventory protections.
7. Booking status is recoverable after client disconnection.
8. API authorization and tenant isolation are tested.
9. Critical operational metrics are observable.
10. End-to-end booking works in the pilot environment.

---

# 21. Final Architecture Decision

Dine MVP will use:

**React Native → NestJS Modular Monolith → PostgreSQL**

Supporting components:

**Redis + BullMQ + WebSockets + Razorpay**

The most important design rule is:

**The database owns booking truth. The API coordinates business operations. The payment gateway owns payment processing. Redis accelerates supporting operations. The mobile application presents state but never decides final reservation ownership.**

This architecture provides a practical foundation for building a reliable restaurant reservation product without introducing unnecessary microservice complexity.