import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Client P2 exposes Manager read-only navigation', async () => {
  const app = await read('src/app.js');
  assert.match(app, /\{ id: 'clients',\s+label: 'Clients',\s+icon: 'clients', route: '#\/clients' \}/);
});

test('Client P2 adds pagination, empty state and mobile cards', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /CLIENT_PAGE_SIZE = 15/);
  assert.match(src, /clientResultSummary/);
  assert.match(src, /clientEmpty/);
  assert.match(src, /clientPager/);
  assert.match(src, /pm-client-table thead\{display:none\}/);
  assert.match(src, /content:attr\(data-label\)/);
});

test('Client P2 renders live sync state', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /clientSyncLabel/);
  assert.match(src, /proqtrack:cloud-status/);
  assert.match(src, /Tersinkron cloud/);
});

test('Client P2 uses structured additional PIC fields', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /additionalPicRows/);
  assert.match(src, /name="additionalPicName"/);
  assert.match(src, /fd\.getAll\("additionalPicName"\)/);
  assert.match(src, /addAdditionalPic/);
  assert.match(src, /removeAdditionalPic/);
});

test('Client P2 normalizes website and enriches detail view', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /normalizeClientWebsite/);
  assert.match(src, /inputmode="url"/);
  assert.match(src, /NPWP \/ SIUP/);
  assert.match(src, /Project Terhubung/);
  assert.match(src, /Terakhir diperbarui/);
});

test('Client P2 cleans orphan uploaded logo after failed commit', async () => {
  const src = await read('src/types/index.js');
  const uploads = await read('src/lib/uploads.js');
  const worker = await read('worker/index.js');
  assert.match(src, /newlyUploadedKey/);
  assert.match(src, /deleteUploadedAsset/);
  assert.match(uploads, /export async function deleteUploadedAsset/);
  assert.match(worker, /request\.method === 'DELETE'/);
  assert.match(worker, /env\.FILES\.delete\(key\)/);
  assert.match(worker, /DELETE FROM file_metadata/);
});

test('Client P2 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.28/);
});
