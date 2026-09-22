import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production migration idempotently provisions the documented superadmin', async () => {
  const migration = await read('migrations/0019_production_superadmin_bootstrap.sql');
  assert.match(migration, /superadmin@proqtrack\.id/);
  assert.match(migration, /WHERE NOT EXISTS/i);
  assert.match(migration, /SET password_hash='sha256\$[a-f0-9]{64}'/);
  assert.match(migration, /role='superadmin'/);
  assert.match(migration, /status='active'/);
  assert.doesNotMatch(migration, /password\s*=\s*['"][^'"]+['"]/i);
});

test('production deployment fails closed when superadmin readiness is missing', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /AS production_superadmin/);
  assert.match(workflow, /Production superadmin is not active/);
});

test('follow-up migration replaces the incorrect recovery credential hash', async () => {
  const migration = await read('migrations/0020_correct_superadmin_password_hash.sql');
  assert.match(migration, /password_hash='sha256\$[a-f0-9]{64}'/);
  assert.doesNotMatch(migration, /899169b9613ef73ec345b82b78242916491ff2535b3743c99e74606125e4375c/);
  assert.match(migration, /role='superadmin'/);
  assert.match(migration, /status='active'/);
});

test('final recovery hash follows the server legacy verifier format', async () => {
  const migration = await read('migrations/0021_align_superadmin_hash_with_server_verifier.sql');
  assert.match(migration, /password \+ "\|proqtrack\.v1"/);
  assert.match(migration, /password_hash='sha256\$53d8df577ff12695fb02c03d92e4e3d119a717e2ed89036a7ffbb053cef924d3'/);
  assert.doesNotMatch(migration, /da2c6d434e34d4d9ee60f04dab3d74f43a685ebca713fff2ca1fac5a3e24734d/);
});
