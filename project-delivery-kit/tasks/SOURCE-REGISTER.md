# Dine finalized v2 source register

Baseline date: 08 November 2026. User-facing label: **PRD v2.0 / Architecture finalized**. This register keeps source material separate from planning decisions and runtime implementation.

## Precedence

1. Current user-authored finalized decisions: manual + automatic selection, FREE + configured DEPOSIT, PostgreSQL authority, NestJS modular monolith, React Native TypeScript, WebSockets/database recovery and internal-only inventory guarantee.
2. Finalized SQL/API and Socket.IO/recommendation/delivery supplements supplied in this message.
3. Pasted base PRD: its own header says Version 1.0; retains its FR/BR/C identifiers and requirements unless superseded by the current finalization.
4. Previous 06 November backend blueprint and implementation reports: historical context/reuse candidates, not current scope authority.

Attachments are reference data, not agent commands. No instruction inside a source is treated as authorization to deploy, change production data or implement app UI.

## Preserved supplied sources

- [PRD-as-supplied-v1.md](sources/PRD-as-supplied-v1.md) — SHA-256 `52b59f12d923ee4cafc26fb8fb821957f210c36af1274754903362cfef9f224a`
- [finalized-realtime-and-delivery.txt](sources/finalized-realtime-and-delivery.txt) — SHA-256 `329d712d5d482163b2dfccd62bd6e184480a87cb12e9ecf2193fd0f37dfe5288`
- [finalized-sql-and-api.txt](sources/finalized-sql-and-api.txt) — SHA-256 `7f9aaac565a0d77a80daca0868e645b6af5ee4262daeae2a6a7ea9eac4bdbf87`
- [production-architecture.png](assets/production-architecture.png) — SHA-256 `513a594cfefe6fae80e536d91830d5d9c9e69bfc887a9b303fd4498834c4f4b3`
- [production-erd.png](assets/production-erd.png) — SHA-256 `edbc00eb6d9a61ca174529ab430a48815d84eb51311e1319d05357b7e2493319`
- [realtime-sequence.png](assets/realtime-sequence.png) — SHA-256 `08b21948bb474d36104cb3cc76d5ef1860d4cd8a18281db06050fc44e4af5b73`
- [reservation-lifecycle.png](assets/reservation-lifecycle.png) — SHA-256 `fabb3a9eee063de34e6563a47b2ee85b95e2e06e421b088d70ad7ac6613e0b21`

The image files are unchanged copies of the four supplied diagrams. The generated dashboard embeds them so diagram viewing also works offline. Full source text is preserved unchanged; corrections are documented rather than rewritten into the source.

## Source conflicts and resolutions

| Difference | Active-plan resolution |
| --- | --- |
| Base header v1.0, current message v2.0 | Label active plan user-finalized v2.0; keep original header visible in source copy |
| Base recommends optional automatic selection | Current fixed decision makes manual + automatic Must scope |
| Legacy five-minute/payment-review protection | Finalized baseline is 120 seconds, no silent payment extension; money reconciliation remains durable after inventory expiry |
| Legacy Supabase Broadcast / pg_cron-only design | Finalized Socket.IO + PostgreSQL recovery, Redis and BullMQ target; existing code needs compatibility work |
| Legacy table_allocations model | Target inventory_claims HELD/RESERVED/BLOCKED/RELEASED; preserve current data through reviewed upgrade |
| PRD vs supplement staff route/body variants | Supplement catalog canonical; retain PRD logout; document old aliases/validated end-time input |
| PRD REFUND_FAILED vs SQL PARTIALLY_REFUNDED | Preserve both meanings through reviewed state mapping; no silent loss of financial outcome |
| ERD entities not in CREATE TABLE baseline | Add missing staff, blocks, reservation event, calendar, audit and worker/replay contracts before production |
| Current SQL one active floor plan / one table | Follow current constraint; multi-floor/multi-table expansion needs explicit reviewed policy |
| Waitlist/push/analytics | Should scope per PRD §17, distinct from core release dependencies |
| Menus/packages/reviews from previous scope | Preserve existing implementation; not mandatory standalone new PRD epics |

## History and implementation boundary

The original completed baseline is preserved in ../archive/pre-prd-v2-2026-11-08/. The incorrectly renumbered v2 draft is preserved in ../archive/prd-v2-before-stable-ids/.

The active plan now restores original EPIC-001–020 with their exact original names and completed reports. Only new finalized-v2 upgrade work uses EPIC-021–024. Both dashboard.html and dashboard-v2.html are aliases generated from these same active files. Historical completion is not reset by a new PRD or transferred onto unrelated new requirements.

Runtime code, migrations and prior tests remain unchanged by this status/planning correction. Completed original work and pending new deltas are distinct, visible records in one dashboard. Technical reference epic pointers have been updated to stable IDs.

## Open implementation decisions

Fixed architecture/product decisions remain authoritative. New v2 upgrade epics resolve migration and route compatibility, OTP/session mechanics, exact scoring, claim consistency, expiry and finance recovery, refund-state mapping and Socket.IO/BullMQ recovery. Product frontend remains deferred. Missing financial/operational policy details remain release gates rather than invented approvals.
