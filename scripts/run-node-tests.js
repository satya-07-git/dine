#!/usr/bin/env node
// One invocation policy for npm, CI and Python wrappers. Never fall back to a
// different suite after failure, and never accept file-only success as coverage.
const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const files = process.argv.slice(2);
if (!files.length) files.push(...readdirSync(resolve(root, 'tests/unit'))
  .filter(name => name.endsWith('.test.js')).sort().map(name => `tests/unit/${name}`));
if (!files.length) throw new Error('No Node test files discovered');
const help = spawnSync(process.execPath, ['--help'], { encoding: 'utf8' });
const flags = ['--test', '--test-reporter=tap'];
// Node 20 lacks this option; explicit TAP still provides nested summaries there.
if (help.stdout.includes('--test-isolation')) flags.push('--test-isolation=none');
const result = spawnSync(process.execPath, [...flags, ...files], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status || 1);
const summary = key => Number((result.stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm')) || [])[1]);
if (!(summary('tests') > files.length) || summary('pass') !== summary('tests') ||
    ['fail', 'cancelled', 'skipped', 'todo'].some(key => summary(key) !== 0)) {
  console.error('Incomplete Node test execution: require nested tests and no failed/skipped cases.');
  process.exit(1);
}
