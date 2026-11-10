---
id: "EPIC-033"
title: "Durable phone OTP delivery and revocable sessions"
type: "epic"
status: "backlog"
phase: "R2 · Production integration"
depends_on: ["EPIC-026", "EPIC-032"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "OTP request stores an in-memory challenge and synthetic code without sending SMS."
---

# EPIC-033 — Durable phone OTP delivery and revocable sessions

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

OTP request stores an in-memory challenge and synthetic code without sending SMS. Database errors are swallowed, verification depends on process memory, and an unknown session can be treated as active. Multi-instance restart/revocation is not durable.

## Evidence and affected surfaces

- [apps/api/src/modules/identity/auth-otp.service.ts](../../apps/api/src/modules/identity/auth-otp.service.ts)

## Implementation tasks

- [ ] T01 Introduce SMS/OTP provider adapter with explicit local mock versus real sandbox/approved test delivery.
- [ ] T02 Persist hashed challenges, expiry, attempts and single-use consumption transactionally; never expose production OTP through debug helpers.
- [ ] T03 Use shared rate limits by phone/account/network and prevent enumeration and brute-force retries.
- [ ] T04 Persist refresh rotation, replay-family revocation and session lookup across instances; unknown session must fail closed.
- [ ] T05 Remove memory fallback on DB failures in production and redact phone/token/code material from logs.
- [ ] T06 Test delivery failure, DB outage, restart, cross-instance verification, expired/reused code, refresh replay and immediate logout revocation.

## Acceptance criteria

- [ ] Actual approved test phone receives OTP via selected provider.
- [ ] Restart and second server can verify a valid persisted challenge once.
- [ ] Unknown/revoked sessions fail authorization.
- [ ] Concurrent verify and refresh replay cannot mint duplicate valid sessions.
- [ ] Rate limits and attempt counters survive instance changes.
- [ ] DB/provider outage does not fabricate successful delivery or authentication.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-026, EPIC-032. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.
