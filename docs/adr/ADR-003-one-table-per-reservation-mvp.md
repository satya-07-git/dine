# ADR-003: One Physical Table per Reservation MVP

## Status
**Approved** (06 November 2026)

## Context
Multi-table allocations (e.g. joining Table A and Table B for a party of 8) require complex spatial layout algorithms, multi-row deadlocks, complex lock ordering rules, dynamic capacity recalculation, and fractured cancellation/refund policies.

## Decision Drivers
- **MVP Scope Control**: Accelerate market entry and pilot deployment with stable, high-confidence concurrency behavior.
- **Deadlock Avoidance**: Acquiring row locks across multiple tables risks cyclic lock waiting without deterministic global ordering.
- **Table Allocation Invariant**: Simplify verification of `table_id WITH =, dining_period WITH &&` exclusion constraints.
- **Visual Floor UX**: Provide guests with direct, unambiguous selection of an exact physical table that meets their party capacity.

## Decision Outcome
The initial MVP strictly supports **exactly one physical table per reservation**.
- Each reservation maps to a single `table_allocations` row referencing one physical `restaurant_tables` record.
- Party size must satisfy `restaurant_tables.capacity >= party_size` and business minimum party rules.
- Dining end time is derived by the server based on the restaurant's configured duration and turnover cleaning buffer: `dining_period = [start_time, start_time + duration + buffer)`.

### Scope Exclusions (Deferred to Future Epics)
1. Dynamic table joining or splitting.
2. Variable seating configurations and reconfigurable banquettes.
3. POS-integrated real-time cover optimization.
4. Multi-table banquet or private dining room bookings.

## Consequences
### Positive
- Prevents row-lock deadlocks in high-concurrency booking paths.
- Guarantees 1:1 mapping between customer intent, visual floor UI, and database exclusion constraints.
- Greatly simplifies hold acquisition, waitlist queue matching, and staff seating workflows.

### Negative / Tradeoffs
- Parties larger than maximum individual table capacity cannot be accommodated through standard customer self-service in MVP (must be handled via direct staff inquiry / walk-in overrides).

## Source Traceability
- Dine Blueprint §1.3 (MVP boundary)
- Dine Blueprint §5.2, §5.3 (Primary tables & invariants)
- Dine Blueprint §6.2 (Availability decision rules)
- Dine Blueprint §19.3 (ADR-003)
