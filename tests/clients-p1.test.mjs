import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Client P1 combines search and status filters instead of overwriting visibility', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /id="clientSearch"/);
  assert.match(src, /id="clientStatusFilter"/);
  assert.match(src, /filterClients\(\)/);
  assert.match(src, /matchesSearch && matchesStatus/);
});

test('Client P1 waits for authoritative cloud commit before local persistence', async () => {
  const src = await read('src/types/index.js');
  const cloud = await read('src/lib/cloud-data.js');
  assert.match(src, /await commitOperationalChanges\(\[\{ entity:'clients', op:'upsert', row:data \}\]\)/);
  assert.match(src, /Data klien tersimpan dan tersinkron/);
  assert.match(cloud, /export async function commitOperationalChanges/);
  assert.match(cloud, /await apiJson\('\/api\/core\/sync'/);
  assert.match(cloud, /if \(queuedSnapshot\)/);
});

test('Client P1 fails closed when logo upload fails', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /if \(file\) \{/);
  assert.match(src, /throw Object\.assign\(new Error\('UPLOAD_UNAVAILABLE'\)/);
  assert.doesNotMatch(src, /Logo belum dapat diunggah\. Coba lagi\.', 'error'\);\s*finish\(\)/);
});

test('Client P1 blocks legacy demo seed on production hosts', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /allowLegacyDemoSeed/);
  assert.match(src, /\["localhost", "127\.0\.0\.1"\]\.includes\(location\.hostname\)/);
  assert.match(src, /allowLegacyDemoSeed && !db\.clients\.length/);
});

test('Client P1 enforces canonical validation and uniqueness in Worker', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /validateClientMutation/);
  assert.match(worker, /CLIENT_NAME_REQUIRED/);
  assert.match(worker, /CLIENT_CODE_CONFLICT/);
  assert.match(worker, /CLIENT_NAME_CONFLICT/);
  assert.match(worker, /CLIENT_LEGAL_NAME_CONFLICT/);
  assert.match(worker, /CLIENT_INVALID_PERIOD/);
  assert.match(worker, /CLIENT_INVALID_EMAIL/);
});

test('Client P1 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.27/);
});
