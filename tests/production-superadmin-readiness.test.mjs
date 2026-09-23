import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fresh production bootstrap fails closed without a repository recovery credential', async () => {
  const migration = await read('migrations/0019_production_superadmin_bootstrap.sql');
  assert.match(migration, /superadmin@proqtrack\.id/);
  assert.match(migration, /WHERE NOT EXISTS/i);
  assert.match(migration, /disabled\$operator-provisioning-required/);
  assert.match(migration, /'suspended'/);
  assert.doesNotMatch(migration, /sha256\$[a-f0-9]{64}/i);
  assert.doesNotMatch(migration, /pbkdf2\$sha256\$/i);
});

test('production deployment still fails closed when live superadmin readiness is missing', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /AS production_superadmin/);
  assert.match(workflow, /Production superadmin is not active/);
});

test('legacy recovery migrations no longer reset credentials from source', async () => {
  const migrations = await Promise.all([
    read('migrations/0020_correct_superadmin_password_hash.sql'),
    read('migrations/0021_align_superadmin_hash_with_server_verifier.sql'),
  ]);
  for (const migration of migrations) {
    assert.match(migration, /role='superadmin'/);
    assert.doesNotMatch(migration, /password_hash\s*=/i);
    assert.doesNotMatch(migration, /sha256\$[a-f0-9]{64}/i);
  }
});


test('production deploy performs an isolated superadmin login smoke with cleanup', async () => {
  const [workflow, smoke] = await Promise.all([
    read('.github/workflows/cloudflare-mvp.yml'),
    read('scripts/production-superadmin-smoke.sh'),
  ]);
  assert.match(workflow, /Verify superadmin production login/);
  assert.match(workflow, /production-superadmin-smoke\.sh/);
  assert.match(smoke, /openssl rand -hex 24/);
  assert.match(smoke, /trap cleanup EXIT/);
  assert.match(smoke, /'superadmin','active'/);
  assert.match(smoke, /api\/auth\/login/);
  assert.match(smoke, /api\/admin\/organizations/);
  assert.match(smoke, /Superadmin production smoke PASS/);
});
