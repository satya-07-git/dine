#!/usr/bin/env node
/**
 * Synthetic Seed Data Runner for Dine Backend Platform.
 * Executes supabase/seed.sql against the configured database.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const SEED_FILE = path.resolve(__dirname, '../supabase/seed.sql');

async function runSeed() {
  const isCheckMode = process.argv.includes('--check') || process.argv.includes('--dry-run');

  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }

  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  console.log(`[Seed] Seed file validated: ${SEED_FILE} (${sql.length} bytes)`);

  if (isCheckMode) {
    console.log('[Seed] Dry-run check completed successfully.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[Seed] Warning: DATABASE_URL not set. Seed file validated only.');
    return;
  }

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('[Seed] Connected to database. Executing synthetic seed...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[Seed] Synthetic seed data inserted successfully.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Seed] Error seeding database:', err.message);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('[Seed] Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { runSeed };
