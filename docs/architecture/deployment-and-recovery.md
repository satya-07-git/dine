# Deployment, Operational Readiness & Database Recovery Playbook

## Purpose
This document provides the operational runbook and deployment/recovery checklists for the Dine backend modular monolith. Fulfills the delivery requirement of **EPIC-002** (Task T05) and aligns with Blueprint §14 and §18.

---

## 1. Fresh Database Bootstrap & Migration Replay

The authoritative schema evolution authority is `supabase/migrations/`. Drizzle ORM does **not** maintain an independent migration history.

### 1.1 Fresh Environment Initialization
To bootstrap a pristine PostgreSQL instance from scratch:

```bash
# 1. Start PostgreSQL with btree_gist and postgis
docker compose up -d postgres

# 2. Replay all migrations sequentially in transactions
npm run migrate

# 3. Seed synthetic test/pilot data (idempotent)
npm run seed
```

### 1.2 Authoritative Migration Workflow
1. New schema additions must be created as timestamped SQL files under `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`.
2. Each migration runs inside an explicit `BEGIN ... COMMIT` transaction.
3. Every executed migration is recorded in `schema_migrations(version, applied_at)`.
4. Drizzle schemas under `apps/api/src/common/db/schema.ts` must be updated concurrently to provide TypeScript type definitions for repositories.

---

## 2. Zero-Downtime Rollout & Database Forward Recovery

### 2.1 Backward-Compatible Migration Rules
- **Additive Only**: Columns must be added with default values or as nullable.
- **Two-Phase Deprecation**: Never drop or rename active columns in the same release as application code changes.
  - Phase A: Introduce new column, dual-write in application service.
  - Phase B: Backfill existing data.
  - Phase C: Switch readers to new column.
  - Phase D: Drop legacy column in subsequent release.
- **Index Creation**: Production indexes must be created `CONCURRENTLY` to avoid table exclusive locks.

### 2.2 Point-In-Time Recovery (PITR) Procedure
If catastrophic database corruption or accidental drop occurs:
1. Place API into maintenance mode (readiness probe returns 503).
2. Restore latest base physical backup (WAL-G / Supabase automated snapshot).
3. Replay write-ahead logs (WAL) to targeted transaction timestamp prior to incident.
4. Execute `npm run migrate` to ensure schema matches current application container release.
5. Verify table allocations GiST exclusion constraint:
   ```sql
   SELECT conname, contype FROM pg_constraint WHERE conname = 'no_protected_table_overlap';
   ```
6. Re-enable traffic by clearing maintenance mode flag.

---

## 3. Connection Pooling & Resource Boundaries

| Parameter | Recommended Value | Description |
| --- | --- | --- |
| `DATABASE_POOL_MIN` | 2 | Minimum warm connections maintained in pool |
| `DATABASE_POOL_MAX` | 20 | Maximum concurrent client connections per container |
| `connectionTimeoutMillis` | 5000 | Fail fast if pool connection unavailable within 5s |
| `idleTimeoutMillis` | 30000 | Close idle connections after 30s |
| `statement_timeout` | 15000 | Terminate transactions running longer than 15s |

---

## 4. Health & Container Orchestrator Probes

The API exposes three distinct health routes:

1. **Liveness Probe**: `GET /health/live`
   - Purpose: Verifies the Node.js event loop is responsive.
   - Action on failure: Container orchestrator restarts the pod.
   - Secret sanitization: Returns status `ok` and uptime; zero credentials.

2. **Readiness Probe**: `GET /health/ready`
   - Purpose: Verifies PostgreSQL pool connectivity (`SELECT 1`).
   - HTTP 200: Healthy, ready for ingress traffic.
   - HTTP 503: Degraded/Down, router stops directing traffic to container.
   - Secret sanitization: Sanitized JSON response without connection strings or credentials.

3. **API Versioned Health**: `GET /v1/health`
   - Exposes dependency status for upstream monitoring systems.

---

## 5. Pre-Deployment Verification Checklist

- [ ] All migrations verified via dry-run: `node scripts/migrate.js --check`
- [ ] Synthetic seed validated: `node scripts/seed.js --check`
- [ ] TypeScript compilation clean: `npm run build`
- [ ] Automated CI/CD test suite passes: `./scripts/ci.sh`
- [ ] Required environment variables set in target vault (AWS Secrets Manager / Vault)
- [ ] No secrets logged or printed during startup validation (`validateEnv`)
- [ ] OpenAPI specification generated and consistent: `node scripts/export-openapi.js`
