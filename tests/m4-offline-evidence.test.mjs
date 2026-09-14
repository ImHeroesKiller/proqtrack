import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { retryDelayMs } from '../src/lib/offline-store.js';
import { __test as evidenceTest } from '../worker/evidence.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function bytes(values) {
  return Uint8Array.from(values).buffer;
}

test('offline retry backoff is exponential and capped', () => {
  assert.equal(retryDelayMs(0), 1000);
  assert.equal(retryDelayMs(1), 2000);
  assert.equal(retryDelayMs(2), 4000);
  assert.equal(retryDelayMs(6), 60000);
  assert.equal(retryDelayMs(20), 60000);
});

test('evidence sniffing trusts bytes, not declared MIME', () => {
  assert.equal(evidenceTest.sniffImage(bytes([0xff,0xd8,0xff,0x00]))?.contentType, 'image/jpeg');
  assert.equal(evidenceTest.sniffImage(bytes([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?.contentType, 'image/png');
  assert.equal(evidenceTest.sniffImage(bytes([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]))?.contentType, 'image/webp');
  assert.equal(evidenceTest.sniffImage(bytes([1,2,3,4,5])), null);
});

test('project evidence authorization follows authoritative project scope', () => {
  assert.equal(evidenceTest.projectAllowed({ role: 'employee', projectIds: ['P1'] }, 'P1'), true);
  assert.equal(evidenceTest.projectAllowed({ role: 'employee', projectIds: ['P1'] }, 'P2'), false);
  assert.equal(evidenceTest.projectAllowed({ role: 'manager', projectIds: ['P2'] }, 'P2'), true);
  assert.equal(evidenceTest.projectAllowed({ role: 'head', projectIds: [] }, 'P9'), true);
});

test('M4 migration adds evidence idempotency and conflict receipts', async () => {
  const sql = await read('migrations/0008_offline_r2_evidence.sql');
  assert.match(sql, /ALTER TABLE core_field_evidence ADD COLUMN idempotency_key/i);
  assert.match(sql, /uq_core_field_evidence_idempotency/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_sync_conflicts/i);
  assert.match(sql, /client_revision/i);
  assert.match(sql, /server_revision/i);
});

test('offline outbox contains operational collections only and never account credentials', async () => {
  const source = await read('src/lib/offline-engine.js');
  assert.match(source, /OPERATIONAL_KEYS/);
  assert.doesNotMatch(source, /['"]accounts['"]/);
  assert.doesNotMatch(source, /password/i);
  assert.doesNotMatch(source, /Storage\.prototype/);
  assert.doesNotMatch(source, /proto\.setItem/);
  assert.match(source, /setInterval\(observeLocalCache/);
  assert.match(source, /recoverCloudConflict/);
});

test('service worker never caches API traffic', async () => {
  const source = await read('sw.js');
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /if \(isPrivateApi\(url\)\) return/);
  assert.match(source, /proqtrack-v4/);
});

test('R2 evidence API is separate from locked legacy file API', async () => {
  const [main, evidence, wrangler] = await Promise.all([
    read('worker/main.js'),
    read('worker/evidence.js'),
    read('wrangler.jsonc'),
  ]);
  assert.match(main, /handleEvidenceRoute/);
  assert.match(main, /CORE_EVIDENCE_API_ENABLED/);
  assert.match(evidence, /env\.FILES\.put/);
  assert.match(evidence, /core_field_evidence/);
  assert.match(evidence, /SHA-256/);
  assert.match(evidence, /env\.FILES\.delete/);
  assert.match(wrangler, /"MVP_FILE_API_ENABLED": "false"/);
});

test('evidence client persists blob before network upload', async () => {
  const source = await read('src/lib/evidence-client.js');
  const putIndex = source.indexOf('await putEvidence');
  const fetchIndex = source.indexOf('fetch(evidenceApiUrl');
  assert.ok(putIndex >= 0);
  assert.ok(fetchIndex > putIndex);
  assert.match(source, /navigator\.onLine/);
  assert.match(source, /idempotency-key/);
});
