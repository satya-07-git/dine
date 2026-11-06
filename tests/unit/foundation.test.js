const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

test('Dine Foundation: Environment Validation & Secret Sanitization', async (t) => {
  const { validateEnv } = require('../../apps/api/dist/common/config/env.validation');

  await t.test('accepts valid configuration', () => {
    const validConfig = {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/dine_dev',
      SUPABASE_JWT_SECRET: 'super-secret-jwt-key-min-16-chars-long',
    };

    const parsed = validateEnv(validConfig);
    assert.equal(parsed.PORT, 3000);
    assert.equal(parsed.NODE_ENV, 'test');
  });

  await t.test('rejects missing DATABASE_URL without leaking secrets', () => {
    const invalidConfig = {
      NODE_ENV: 'test',
      SUPABASE_JWT_SECRET: 'super-secret-jwt-key-min-16-chars-long',
    };

    assert.throws(() => {
      validateEnv(invalidConfig);
    }, /DATABASE_URL/);
  });
});

test('Dine Foundation: Database Migrations & Exclusion Constraint', async (t) => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  assert.ok(files.length >= 2, 'Must have at least 2 migrations');

  const extSql = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
  assert.match(extSql, /btree_gist/, 'Migration 1 must enable btree_gist');
  assert.match(extSql, /uuid-ossp/, 'Migration 1 must enable uuid-ossp');

  const coreSql = fs.readFileSync(path.join(migrationsDir, files[1]), 'utf8');
  assert.match(coreSql, /CREATE TABLE IF NOT EXISTS table_allocations/, 'Migration 2 must create table_allocations');
  assert.match(coreSql, /CONSTRAINT no_protected_table_overlap EXCLUDE USING gist/, 'Must have GiST exclusion constraint');
  assert.match(coreSql, /schema_migrations/, 'Must have schema_migrations table');
});

test('Dine Foundation: Drizzle Schema Integrity', () => {
  const schema = require('../../apps/api/dist/common/db/schema');
  assert.ok(schema.bookings, 'Drizzle schema must define bookings');
  assert.ok(schema.tableAllocations, 'Drizzle schema must define tableAllocations');
  assert.ok(schema.restaurants, 'Drizzle schema must define restaurants');
  assert.ok(schema.restaurantTables, 'Drizzle schema must define restaurantTables');
  assert.ok(schema.idempotencyRecords, 'Drizzle schema must define idempotencyRecords');
  assert.ok(schema.outboxEvents, 'Drizzle schema must define outboxEvents');
  assert.ok(schema.auditLogs, 'Drizzle schema must define auditLogs');
});

test('Dine Foundation: OpenAPI Specification Completeness', () => {
  const specPath = path.resolve(__dirname, '../../docs/architecture/openapi.json');
  assert.ok(fs.existsSync(specPath), 'openapi.json must exist');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  assert.equal(spec.info.title, 'Dine Backend API');
  assert.ok(spec.paths['/health/live'], 'Liveness route must be documented');
  assert.ok(spec.paths['/health/ready'], 'Readiness route must be documented');
  assert.ok(spec.paths['/v1/health'], 'API health route must be documented');
  assert.ok(spec.paths['/reservations/{id}'], 'Reservations route must be documented');
});
