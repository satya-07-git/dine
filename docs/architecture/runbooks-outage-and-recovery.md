# Operational Outage and Disaster Recovery Runbooks

## Status
**Approved Operational Standard** (10 November 2026)  
Fulfills **Task T14** of **EPIC-024** (*Socket.IO, BullMQ and database event recovery upgrade*) and complements **ADR-001**, **ADR-002**, and **ADR-006**.

---

## 1. PostgreSQL Database Outage & Failover Runbook

### Primary Invariants
1. PostgreSQL is the **single system of record** for all table allocations, holds, bookings, and financial states.
2. If PostgreSQL is partitioned or unavailable, the API **must reject** mutable booking and payment operations rather than risk split-brain or double-allocation.

### Incident Detection & Alert Criteria
- Metric alert: `db_connection_pool_exhaustion` or `query_latency_p95 > 2000ms`.
- Liveness probe: `GET /health/liveness` returns 503.

### Immediate Mitigation Steps
1. **Assess Pool Saturation**: Check active client connections vs `max_connections` (100).
2. **Promote Standby Replica**:
   ```bash
   # Execute failover to hot-standby replica
   pg_ctl promote -D /var/lib/postgresql/data
   ```
3. **Switch Application Connection**:
   Update `DATABASE_URL` in environment secrets to the newly promoted primary endpoint.
4. **Reconcile Relational Integrity**:
   Verify no orphaned claims or untracked payment captures:
   ```sql
   SELECT COUNT(*) FROM inventory_claims WHERE state = 'HELD' AND expires_at < NOW();
   ```

---

## 2. Redis Cache & Queue Outage Runbook

### Primary Invariants
1. **Zero Ownership Inferred from Redis**: Loss of Redis can never transfer table ownership, confirm a booking, or erase financial truth.
2. **Degraded Mode Operation**: When Redis is offline, the backend transitions to degraded mode (`redis_queue_state = DEGRADED`). All critical inventory operations rely strictly on PostgreSQL row locks (`SELECT FOR UPDATE`) and GiST range exclusion constraints.
3. **Queue State is 100% Reconstructible**: All pending work (hold expiries, payment review reconciliations, and outbox event dispatches) is preserved in durable PostgreSQL tables.

### Incident Recovery & Rebuild Protocol
1. **Detect Outage**: Check `GET /api/v1/realtime/redis/health` -> returns `state: DEGRADED`.
2. **Restart / Replace Redis Instance**:
   ```bash
   docker compose restart redis
   ```
3. **Trigger Post-Recovery Rebuild from PostgreSQL Authority**:
   Execute the authoritative rebuild endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/v1/realtime/redis/rebuild \
     -H "Content-Type: application/json" \
     -d '{"queue_names": ["hold-expiry", "payment-reconciliation", "outbox-dispatch"]}'
   ```
4. **Verify Reconstruction**:
   Confirm all held claims, payments in review, and pending outbox events are restored into the queue with deterministic job identities (`entityId:jobType:version`).

---

## 3. Socket.IO Gateway & Multi-Node Fan-Out Outage Runbook

### Primary Invariants
1. Realtime messages are **ephemeral hints**, not authoritative confirmations (ADR-006).
2. Gateway failure or network disconnect **must never corrupt client state**.
3. Reconnecting clients must synchronize with authoritative PostgreSQL database history.

### Incident Response Steps
1. **Gateway Instance Failure**:
   If a WebSocket gateway node crashes, connected clients disconnect and attempt exponential reconnect.
2. **Fallback to Authoritative REST**:
   Clients detect socket disconnect and fall back to polling `GET /api/v1/bookings/:id`.
3. **Reconnect Replay & Synchronization**:
   Upon reconnect, clients request `GET /api/v1/realtime/events/replay?entity_id=<id>&since_sequence=<seq>`:
   - If within retained history: missing sequenced events are replayed in monotonic sequence.
   - If beyond retention cursor (`resync_required: true`): client immediately refetches `GET /api/v1/bookings/:id`.
4. **Tenant Isolation Verification**:
   Ensure room subscriptions re-verify customer ownership and staff active memberships upon reconnection.

---

## 4. BullMQ Worker Outage & Dead-Letter Isolation Runbook

### Primary Invariants
1. Worker crash during job execution does not cause data loss. The database lease expires (`claim_expires_at < NOW()`), enabling another worker to safely re-claim the work via `SELECT ... FOR UPDATE SKIP LOCKED`.
2. Poison payloads that fail 5 consecutive attempts are isolated into `DEAD_LETTER` status to protect queue throughput.
3. Every dead-letter job is visible and assigned to `PLATFORM_OPERATIONS` for explicit resolution.

### Dead-Letter Triage & Resolution Procedure
1. **List Visible Dead-Letter Jobs**:
   ```bash
   curl -X GET http://localhost:3000/api/v1/realtime/dead-letters
   ```
2. **Inspect Error & Payload**:
   Identify the failure reason (`last_error`, `dead_letter_reason`).
3. **Fix Root Cause**:
   If an external webhook or gateway timed out, verify provider status.
4. **Retry Safe Dead-Letter Job**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/realtime/dead-letters/<job_id>/retry
   ```
