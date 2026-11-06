#!/usr/bin/env node
/**
 * Authoritative SQL Migration Runner for Dine Backend Platform.
 * Uses supabase/migrations as the single schema evolution authority.
 * Executes migrations in strict lexicographical order inside transactions
 * and tracks applied versions in `schema_migrations`.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');

async function validateMigrationsFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error('No SQL migration files found in supabase/migrations');
  }

  console.log(`[Migrate] Found ${files.length} migration file(s):`);
  for (const f of files) {
    console.log(`  - ${f}`);
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    if (!content.trim()) {
      throw new Error(`Migration file ${f} is empty`);
    }
  }

  return files;
}

async function runMigrations() {
  const isCheckMode = process.argv.includes('--check') || process.argv.includes('--dry-run');
  const files = await validateMigrationsFiles();

  if (isCheckMode) {
    console.log('[Migrate] Check / Dry-run mode completed successfully. All migration files are valid.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[Migrate] Warning: DATABASE_URL not set. Running in file validation mode only.');
    return;
  }

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('[Migrate] Connected to PostgreSQL database.');

    // Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Fetch already applied migrations
    const res = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const applied = new Set(res.rows.map((r) => r.version));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      console.log(`[Migrate] Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migrate] Successfully applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] Error applying ${file}:`, err.message);
        throw err;
      }
    }

    console.log(`[Migrate] Migration complete. ${appliedCount} new migration(s) applied.`);
  } catch (err) {
    // If database connection is not reachable in CI environment without Postgres daemon,
    // log and exit with error unless running check mode
    console.error('[Migrate] Execution error:', err.message);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('[Migrate] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runMigrations, validateMigrationsFiles };
