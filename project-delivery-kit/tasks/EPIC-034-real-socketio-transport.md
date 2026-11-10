---
id: "EPIC-034"
title: "Real Socket.IO transport and authorized recovery"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-028", "EPIC-032", "EPIC-033"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "The current injectable gateway keeps client/room maps and returns recipient counts without a real Socket.IO server/emit."
---

# EPIC-034 — Real Socket.IO transport and authorized recovery

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

The current injectable gateway keeps client/room maps and returns recipient counts without a real Socket.IO server/emit. Simulated multi-node fanout and DELIVERED with zero recipients do not establish delivery.

## Evidence and affected surfaces

- [apps/api/src/modules/realtime/socket-io.gateway.ts](../../apps/api/src/modules/realtime/socket-io.gateway.ts)
- [apps/api/src/modules/realtime](../../apps/api/src/modules/realtime)

## Implementation tasks

- [ ] T01 Wire actual Nest WebSocketGateway and Socket.IO server/client dependencies with authorized handshake and reconnect.
- [ ] T02 Authorize restaurant and booking rooms from persisted session, membership and resource ownership; project public/private payloads separately.
- [ ] T03 Publish only after DB commit with event identity, monotonic versions and customer-safe payloads.
- [ ] T04 Implement durable replay/cursor retention and canonical snapshot fallback for gaps; do not treat socket messages as booking authority.
- [ ] T05 Configure real Redis fanout for multi-instance deployment and explicit transport-delivery semantics without assuming client acknowledgement.
- [ ] T06 Test real two-client/two-instance room isolation, session revocation, reconnect, duplicates/out-of-order events and offline recovery.

## Acceptance criteria

- [ ] Real network clients receive permitted events after commit.
- [ ] Unauthorized subscriptions and revoked sessions cannot retain private access.
- [ ] Two instances deliver through real fanout with consumer deduplication.
- [ ] Reconnect converges to PostgreSQL state after retention gap or missed events.
- [ ] No-recipient send is not reported as confirmed customer delivery.
- [ ] Measured event latency evidence is recorded separately from the target under two seconds.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-028, EPIC-032, EPIC-033. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
