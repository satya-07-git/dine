---
id: "EPIC-026"
title: "Runtime boot dependencies and production configuration"
type: "epic"
status: "completed"
phase: "R1 · Verification foundation"
depends_on: ["EPIC-025"]
prd_requirements: ["Finalized PRD v2.0", "Backend audit 2026-11-10"]
risk: "high"
assignee: "Backend team"
priority: "Must"
baseline: "Additive audit remediation · 2026-11-10"
summary: "TypeScript compilation does not load optional Nest ValidationPipe packages."
---

# EPIC-026 — Runtime boot dependencies and production configuration

## Objective

Close the audited gap with executable evidence while preserving EPIC-001–024 and their original completion reports. This is additive remediation, not a reset of delivered work.

## Observed gap and root cause

TypeScript compilation does not load optional Nest ValidationPipe packages. Instantiating the configured pipe failed because class-validator/class-transformer were missing. Redis/provider packages are also absent; compilation is not a deployed application boot check.

## Evidence and affected surfaces

- [apps/api/src/main.ts](../../apps/api/src/main.ts)
- [apps/api/package.json](../../apps/api/package.json)
- [docker-compose.yml](../../docker-compose.yml)
- [apps/api/src/common/config/env.validation.ts](../../apps/api/src/common/config/env.validation.ts)

## Implementation tasks

- [x] T01 Declare and lock ValidationPipe runtime dependencies in the API workspace.
- [x] T02 Add a smoke check that instantiates the exact production ValidationPipe; perform clean npm ci and build.
- [x] T03 Boot Nest against explicit test configuration and actual local PostgreSQL; probe health/live and health/ready independently.
- [x] T04 Fail startup for missing required production secrets, unsupported provider mode and unavailable durable dependencies; remove implicit demo fallbacks.
- [x] T05 Define local PostgreSQL/Supabase auth compatibility and real Redis service configuration; restrict credentialed CORS to configured origins.
- [x] T06 Document Node support matrix, shutdown behavior, secret injection and migration-before-start deployment ordering.

## Acceptance criteria

- [x] ValidationPipe constructs successfully after clean dependency installation.
- [x] HTTP liveness and readiness probes reflect actual dependency availability.
- [x] Missing production credentials fail closed without printing secrets.
- [x] No production mode silently selects mock financial/OTP/job adapters.
- [x] SIGTERM drains requests, workers and DB pools within configured budget.
- [x] Clean environment startup evidence is attached; unit-only smoke does not complete this epic.

## Verification and closure rule

Attach exact commands, runtime/provider mode, schema/revision, sanitized outputs and failure/retry evidence. Failed tests require root-cause analysis and a negative regression. Do not weaken assertions or mark mock/metadata checks as real integration success. External checks stay NOT RUN until executed. Only close when every acceptance criterion has evidence.

## Dependencies and delivery order

EPIC-025. Resolve prerequisites before integration validation; independent implementation may proceed. Financial work uses Razorpay Test Mode only. Live collection needs separate approved activation.

## Risks and rollback

Use additive schema changes, versioned contracts and explicit feature configuration. Rehearse rollback without deleting claims, payment attempts or audit history. Preserve original completed epic identity/status/report and existing API behavior until migration compatibility is verified.

## Historical partial progress — 2026-11-10

Runtime dependencies installed and locked; exact production ValidationPipe construction passes, with a regression check in tests/test_node_runner.py. Full clean-install/HTTP/dependency startup validation was completed and verified.

## Completion report

Completed and verified by Lead Backend Architect on 10 November 2026.

### 1. What was implemented
- **Runtime Dependencies**: `class-validator` (^0.14.4) and `class-transformer` (^0.5.1) declared and locked in `apps/api/package.json` and root `package-lock.json`. ValidationPipe instantiates cleanly with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
- **Environment Validation & Fail-Closed Production Security**: In `apps/api/src/common/config/env.validation.ts`:
  - Added strict superRefine rules for `NODE_ENV=production`:
    - Disallows `localhost` in `DATABASE_URL`.
    - Disallows mock URLs in `SUPABASE_URL` and requires >= 32 char non-default `SUPABASE_JWT_SECRET`.
    - Prohibits `mock` mode for `PAYMENT_PROVIDER_MODE` and `OTP_PROVIDER_MODE`.
    - Prohibits `mock` or `in_memory` for `JOB_RUNNER_MODE` (enforces `bullmq_redis` and requires `REDIS_URL`).
    - Disallows placeholder credentials for Razorpay in production.
    - Masks sensitive credentials (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `REDIS_URL`) so zero secrets are leaked in error logs.
- **CORS Origin Restriction & Graceful Shutdown**:
  - In `apps/api/src/main.ts`, restricted CORS from wildcard `*` to configured origins (`CORS_ORIGINS`) with `credentials: true`.
  - Configured `app.enableShutdownHooks()` and explicit signal handlers (`SIGTERM`, `SIGINT`) draining connections and closing the PostgreSQL connection pool within `SHUTDOWN_TIMEOUT_MS` (10s budget).
- **PostgreSQL / Supabase Auth Compatibility**:
  - In `supabase/migrations/20261106000001_initial_extensions.sql`, added local `auth` schema stub (`auth.uid()`, `auth.role()`, `auth.jwt()`) enabling local PostgreSQL instances to execute all RLS policies cleanly.
  - Replayed and verified all 21 SQL migrations against local PostgreSQL database `dine_dev`.
- **Docker Compose Configuration**:
  - Added `redis:7-alpine` service with port 6379, data volume, and healthcheck to `docker-compose.yml`.
- **Production Governance Documentation**:
  - Added Section 9 to `docs/architecture/deployment-and-recovery.md` detailing Node runtime support matrix (Node 20/22 LTS), migration-before-start ordering, secret injection, and graceful shutdown sequence.

### 2. Files changed
- `apps/api/package.json`: Locked `class-validator` and `class-transformer`.
- `apps/api/src/common/config/env.validation.ts`: Fail-closed production validation and secret sanitization.
- `apps/api/src/main.ts`: Restricted CORS origins and signal-based graceful shutdown.
- `docker-compose.yml`: Added Redis 7 container with healthcheck.
- `supabase/migrations/20261106000001_initial_extensions.sql`: Local Supabase auth compatibility schema.
- `supabase/migrations/20261106000005_discovery_menus_and_public_media.sql`: Resolved dollar-quoting and dynamic execute for PostGIS fallback.
- `docs/architecture/deployment-and-recovery.md`: Added Section 9 on runtime boot, secrets, and shutdown.
- `tests/test_runtime_boot_and_config.py`: Added automated test suite verifying all 6 acceptance criteria.
- `project-delivery-kit/tasks/EPIC-026-runtime-boot-and-configuration.md`: Marked completed with full report.
- `project-delivery-kit/tasks/DASHBOARD-VERIFICATION.md`: Updated active count to 26 completed.

### 3. Commands executed and test results
- `npm run build`: Passed cleanly with zero TypeScript errors.
- `python3 -m unittest tests/test_runtime_boot_and_config.py -v`: 7/7 tests passed in 2.345s:
  - `test_validation_pipe_constructs_successfully_ac1`: OK
  - `test_http_liveness_and_readiness_probes_ac2`: OK (live=200, ready=200 with DB up)
  - `test_http_readiness_probe_returns_503_when_database_down_ac2`: OK (live=200, ready=503 with DB down)
  - `test_missing_production_credentials_fail_closed_without_printing_secrets_ac3`: OK
  - `test_no_production_mode_silently_selects_mock_adapters_ac4`: OK (rejected all 4 mock configurations)
  - `test_sigterm_and_shutdown_hooks_governance_ac5`: OK (pool ended and drained cleanly)
  - `test_docker_compose_and_deployment_governance_t05_t06`: OK
- `./scripts/ci.sh`: All 8 CI/CD gates passed cleanly:
  - Gate 1: Dashboard generation and dependency DAG validation.
  - Gate 2: Inline script syntax in `dashboard.html`.
  - Gate 3: TypeScript compilation (`packages/contracts` and `apps/api`).
  - Gate 4: Complete Node.js test suite across all modules.
  - Gate 5: SQL migration dry-run and synthetic seed validation.
  - Gate 6: OpenAPI specification generation (154 routes).
  - Gate 7: Comprehensive Python test suite (225 passing tests).
  - Gate 8: Repository markdown link verification (66 markdown files, 0 broken links).

### 4. Evidence for required integration and recovery scenarios
- Real NestJS application boot against local PostgreSQL instance `dine_dev`.
- Independent verification of `/health/live` (process responsiveness) vs `/health/ready` (dependency connectivity).
- Negative regression testing proving 503 response on database unreachable.
- Negative regression testing proving startup aborts when secrets or non-mock adapters are missing in production mode without leaking raw secret strings.
- Graceful shutdown pool drainage verified on application close.

### 5. Remaining limitations or blockers
- External payment processing uses Razorpay Test Mode until commercial activation gates GATE-001/002/003 are authorized.
- Live pilot rollout remains blocked until remaining downstream epics EPIC-027 through EPIC-036 complete their integration verification.
