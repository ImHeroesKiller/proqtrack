import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production CSP permits only the Cloudflare Insights origins needed by the injected beacon', async () => {
  const [headers, hardening] = await Promise.all([
    read('_headers'),
    read('worker/hardening.js'),
  ]);
  for (const source of [headers, hardening]) {
    assert.match(source, /script-src[^;\n]*'self'[^;\n]*https:\/\/static\.cloudflareinsights\.com/);
    assert.match(source, /script-src-elem[^;\n]*'self'[^;\n]*https:\/\/static\.cloudflareinsights\.com/);
    assert.match(source, /connect-src[^;\n]*'self'[^;\n]*https:\/\/cloudflareinsights\.com/);
    assert.doesNotMatch(source, /script-src[^;\n]*\*/);
    assert.doesNotMatch(source, /script-src[^;\n]*'unsafe-eval'/);
  }
});

test('authoritative empty cloud tenant never auto-migrates stale browser data', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const start = bridge.indexOf('export async function bootstrapOperationalData');
  const end = bridge.indexOf('async function performOperationalRefresh', start);
  assert.ok(start >= 0 && end > start);
  const bootstrap = bridge.slice(start, end);

  const emptyGuard = bootstrap.indexOf('if (remote.empty === true)');
  const legacyMigration = bootstrap.indexOf('migrateLegacyMasterCollections');
  const p2Migration = bootstrap.indexOf('migrateP2OperationalCollections');
  assert.ok(emptyGuard >= 0, 'empty tenant guard missing');
  assert.ok(legacyMigration > emptyGuard, 'legacy migration must be behind empty guard');
  assert.ok(p2Migration > emptyGuard, 'P2 migration must be behind empty guard');
  assert.match(bootstrap, /localStorage\.removeItem\(\`proqtrack_pending_catalog_\$\{organizationId\}\`\)/);
});

test('bootstrap discards stale queued write-through state before accepting server baseline', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const start = bridge.indexOf('export async function bootstrapOperationalData');
  const end = bridge.indexOf('async function performOperationalRefresh', start);
  const bootstrap = bridge.slice(start, end);
  const baseline = bootstrap.lastIndexOf('baseline = snapshotCollections');
  assert.ok(baseline > 0);
  assert.ok(bootstrap.lastIndexOf('queuedSnapshot = null', baseline) > 0);
  assert.ok(bootstrap.lastIndexOf('syncing = false', baseline) > 0);
  assert.ok(bootstrap.lastIndexOf('clearTimeout(timer)', baseline) > 0);
});

test('empty tenant remains explicit-admin import only', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  assert.match(bridge, /export async function importLegacySnapshotForAdmin/);
  assert.match(bridge, /Legacy migration must be an explicit admin action for an empty tenant/);
});
