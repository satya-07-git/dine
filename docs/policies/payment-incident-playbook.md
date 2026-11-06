# Payment Incident Playbook & Reconciliation Recovery Procedures

## Purpose
This document establishes the authoritative operational playbook, bounded retry limits, decision matrices, and support escalation protocols for managing payment reviews, ambiguous gateway states, late captures, and refund recovery on the Dine backend platform.

Conforms to **EPIC-011**, Blueprint §1.2, §9.3–9.4, §14.2, §17, and ADR-001/007.

---

## 1. Governance & Operational Standards

1. **Test-Mode Mandatory**: Live charges and real bank settlement remain strictly disabled until commercial exit gates are satisfied. All gateway interactions operate against simulated or sandbox providers.
2. **Out-of-Lock Gateway Calls**: Network calls to external gateways (e.g. Razorpay) must **never** be executed while holding database table row locks or GiST allocation locks.
3. **Atomic Revalidation Under Lock**: All database updates resulting from gateway queries must recheck current booking and table allocation status within an atomic commit transaction (`SELECT ... FOR UPDATE`).
4. **Physical Table Inviolability**: If Customer A's payment succeeds after inventory has already expired and been safely allocated to Customer B, the system **never** steals the table from Customer B. Customer B's reservation remains confirmed and untouched, and Customer A is automatically issued an idempotent refund with an audited incident record.
5. **No Silent Freeing**: A deadline reached with an unknown payment outcome must **never** silently free table inventory while financial capture is uncertain.

---

## 2. Bounded Review & Retry Policy (T01, T05)

| Parameter | Configuration Bound | Rationale |
| :--- | :--- | :--- |
| **Max Review Duration** | `15 minutes` (`900 seconds`) | UPI and bank debits typically settle or fail within 10–15 minutes. Beyond 15m, customer is either seated elsewhere or money is trapped in gateway review. |
| **Max Reconciler Retries** | `3 automated attempts` | Limits runaway API traffic and database churn against provider downtime. |
| **Reconciler Backoff** | `1m -> 5m -> 15m` | Exponential delay to allow banking network clearance. |
| **Escalation Boundary** | `review_age >= 15m` OR `retries >= 3` | At this threshold, status transitions from `PENDING_RECHECK` to `MANUAL_ESCALATION` (`CRITICAL` severity). |

---

## 3. Reconciler Decision Matrix (T01, T02)

```text
                                 [Gateway Status Query]
                                           |
         +---------------------------------+---------------------------------+
         |                                 |                                 |
     [CAPTURED]                         [FAILED]                         [UNKNOWN]
         |                                 |                                 |
+--------+--------+               [Safe Release Allocation]                  |
|                 |                        |                        +--------+--------+
[Table Still Held][Table Reallocated]      |                        |                 |
|                 |               [Mark PAYMENT_FAILED]       [Age < 15m & Retries < 3][Age >= 15m OR Retries >= 3]
[CONFIRMED]       [RETAIN Customer B]      |                        |                 |
                  [Mark A EXPIRED]   [Free for Waitlist]       [PAYMENT_REVIEW] [MANUAL_ESCALATION]
                  [Auto Refund A]                              [Maintain GiST]  [Create Incident]
                  [Log Incident]
```

### Formal Decision Table

| Provider State | Allocation Status | Review Age / Retries | System Action | Booking Outcome | Inventory Outcome | Monetary Action | Incident Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `CAPTURED` | Active (`HELD`/`PAYMENT_REVIEW`) | Any | Confirm booking | `CONFIRMED` | `CONFIRMED` | None (Retain deposit) | None |
| `CAPTURED` | Released / Reassigned to B | Any | Late capture recovery | `EXPIRED` | Retained by Customer B | Automated idempotent refund | `HIGH` (`LATE_CAPTURE_REFUND_REQUIRED`) |
| `FAILED` | Any | Any | Release inventory | `PAYMENT_FAILED` | `RELEASED` | None | None |
| `UNKNOWN` | Protected | `< 15m` & `< 3 retries` | Maintain review | `PAYMENT_REVIEW` | `PAYMENT_REVIEW` (protected) | None (await retry) | None |
| `UNKNOWN` | Protected | `>= 15m` OR `>= 3 retries` | Escalate to human support | `PAYMENT_REVIEW` | Protected | None (frozen until support action) | `CRITICAL` (`RECONCILIATION_TIMEOUT`) |

---

## 4. Idempotent Refund Workflow (T03)

1. **Idempotency Key Requirement**: Every refund request must supply a client-generated or system-generated unique `idempotency_key`.
2. **Replay Deduplication**: If a refund request arrives with an existing `idempotency_key`, the service returns the existing refund record immediately without invoking the payment gateway or issuing duplicate funds.
3. **Amount Validation**: The refund amount must be positive (`amount_minor > 0`) and cannot exceed the captured amount on the payment attempt.
4. **Status Progression**:
   - `PENDING`: Refund request recorded in database.
   - `PROCESSING`: Out-of-lock external gateway refund request dispatched.
   - `SUCCEEDED`: Gateway confirmed refund; payment attempt marked `REFUNDED`; audit log and outbox event published.
   - `FAILED`: Gateway rejected refund; `payment_incidents` record created with `HIGH` severity.
   - `MANUAL_ESCALATION`: Escalated to support team for manual bank transfer or ledger adjustment.

---

## 5. Support Incident Visibility & Resolution (T04)

### Incident Classifications

- `LATE_CAPTURE_REFUND_REQUIRED` (`Severity: HIGH`):
  - **Condition**: Customer was charged after hold elapsed and table was allocated to a competing customer.
  - **Resolution**: Reallocated customer retained; automatic refund verified; guest notified.
- `RECONCILIATION_TIMEOUT` (`Severity: CRITICAL`):
  - **Condition**: Gateway inquiry timed out or returned pending beyond the 15-minute review window.
  - **Resolution**: Support contacts payment gateway console to check order ID; marks incident `RESOLVED` or triggers manual refund.
- `REFUND_FAILED` (`Severity: HIGH`):
  - **Condition**: Payment gateway rejected automated refund call (e.g. insufficient merchant balance, closed customer account).
  - **Resolution**: Support team coordinates manual ledger adjustment or alternative refund rail.
- `GATEWAY_ERROR` (`Severity: HIGH`):
  - **Condition**: Repeated 5xx HTTP responses or signature validation anomalies from the payment provider.
  - **Resolution**: Escalate to payment operations and platform reliability engineering.

### Support Resolution API
- `GET /payments/incidents`: Filter by `status` (`OPEN`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`) and `severity`.
- `GET /payments/incidents/:id`: Inspect full audit metadata, associated booking, and payment attempt.
- `PATCH /payments/incidents/:id/resolve`: Submit formal resolution with mandatory audit reason.
