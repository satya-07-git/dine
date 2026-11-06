# ADR-004: Restaurant-Configurable Deposit Policy

## Status
**Approved** (06 November 2026)

## Context
Restaurants operate across diverse dining segments with varying no-show rates, guest expectations, and financial risk profiles. Fine-dining establishments require upfront deposits to mitigate expensive empty covers, whereas casual cafes and family diners prioritize low-friction, instant free reservations to maximize foot traffic.

## Decision Drivers
- **Restaurant Autonomy**: Enable restaurant operators to align reservation requirements with their business model.
- **Conversion vs No-Show Risk**: Balance guest booking friction against restaurant revenue protection.
- **Unified Engine**: Support both free and deposit workflows within a single consistent state machine without bifurcation of inventory management.

## Decision Outcome
Reservation deposit requirements are **restaurant-configurable** at the restaurant profile or schedule policy level:
- Supported modes: `FREE_RESERVATION` and `DEPOSIT_REQUIRED`.
- When `FREE_RESERVATION`:
  - Hold is created in `HOLD_ACTIVE` state.
  - Guest confirms reservation directly (`POST /v1/bookings/:id/confirm`).
  - Transition immediately advances from `HOLD_ACTIVE` -> `CONFIRMED`.
- When `DEPOSIT_REQUIRED`:
  - Hold is created in `HOLD_ACTIVE` state.
  - Gateway payment order is initiated (`POST /v1/payments/orders`) -> advances to `PAYMENT_PENDING`.
  - Confirmation occurs strictly upon server verification of signed gateway webhook / verified capture -> advances to `CONFIRMED`.
  - If payment cannot be verified before expiry deadline, hold advances to `PAYMENT_REVIEW` to protect inventory until reconciliation finishes.

### Commercial Policy Constraints
- Pilot testing must be conducted with Razorpay Test Mode prior to live money enablement.
- Deposit amounts must be positive integers (`amount_minor > 0`), in valid ISO currency (INR default).
- Commercial refund, penalty, and cancellation fee rules must be explicitly resolved and versioned before enabling live money.

## Consequences
### Positive
- Accommodates both casual dining and fine-dining restaurants.
- Unified table allocation state machine ensures identical concurrency safety for free and paid reservations.

### Negative / Tradeoffs
- Booking service must support dual branching logic for confirmation without compromising auditability.

## Source Traceability
- Dine Blueprint §1.3 (MVP boundary - product policy)
- Dine Blueprint §9.1 (Two policy paths)
- Dine Blueprint §19.1 (Decisions to resolve before commercial release)
- Dine Blueprint §19.3 (ADR-004)
