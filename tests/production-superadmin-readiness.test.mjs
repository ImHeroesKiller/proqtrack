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
