# ADR-005: Waitlist Exclusive Priority Offers Without Auto-Charge

## Status
**Approved** (06 November 2026)

## Context
When a confirmed reservation or active hold expires or is cancelled, freed table inventory becomes available. Multiple waiting guests may desire the same slot. Systems that automatically charge guests without explicit confirmation suffer from dispute spikes, buyer remorse, chargeback liability, and unexpected bank deductions. Broadcast "fastest-finger-first" free-for-alls create poor customer experience and concurrency stampedes.

## Decision Drivers
- **Fairness & Determinism**: Predictable, FIFO-based queue ordering among eligible guests matching table capacity and requested dining interval.
- **Consumer Consent & Regulatory Compliance**: Indian payment regulations (RBI e-mandate rules) and consumer trust require explicit affirmative customer consent for payment and table acceptance.
- **Inventory Protection**: An offered table must not be booked by anyone else while the guest evaluates the offer.

## Decision Outcome
Waitlist claims use **exclusive short-lived priority offers** with **no automatic charging**:
1. When a protected table allocation is safely freed, the waitlist engine selects the highest-priority eligible entry (FIFO based on entry creation timestamp matching capacity and dining interval).
2. The engine creates an exclusive priority offer (`waitlist_offers`) and transitions the allocation to `OFFER_HELD`.
3. An exclusive offer window is granted (e.g. 60-second prototype window, configurable per restaurant).
4. The guest receives a push/realtime notification and must affirmatively accept via `POST /v1/waitlist/offers/:id/accept` within the expiration window.
5. If the restaurant requires a deposit, acceptance transitions to `PAYMENT_PENDING` with normal deposit checkout. If free, it advances directly to `CONFIRMED`.
6. If the offer expires without acceptance or is declined, `OFFER_HELD` is released, the entry marked `EXPIRED`/`DECLINED`, and the offer cascades to the next eligible waitlist candidate.

### Core Invariants
- **Never Auto-Charge**: System will never automatically charge a stored payment method or confirm without explicit user action.
- **Single Offered Guest**: Exactly one guest holds the exclusive offer for a specific table and dining period at any given second.

## Consequences
### Positive
- Zero unexpected bank debits or chargebacks.
- Transparent, auditable queue progression.
- Concurrency isolation: only the offered guest can claim the allocation.

### Negative / Tradeoffs
- High latency if offers cascade through multiple unresponsive guests before being accepted (mitigated by bounded offer durations and opt-in push notifications).

## Source Traceability
- Dine Blueprint §1.2 (Clear queue semantics)
- Dine Blueprint §9.4 (Recommended initial timing assumptions)
- Dine Blueprint §10.1, §10.2, §10.3 (Smart waitlist)
- Dine Blueprint §19.3 (ADR-005)
