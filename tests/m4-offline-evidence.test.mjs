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
  assert.equal(evidenceTest.objectSegment('ORG/a:b'), 'ORG_a_b');
});

test('project evidence authorization follows authoritative project scope', () => {
  assert.equal(evidenceTest.projectAllowed({ role: 'employee', projectIds: ['P1'] }, 'P1'), true);
  assert.equal(evidenceTest.projectAllowed({ role: 'employee', projectIds: ['P1'] }, 'P2'), false);
  assert.equal(evidenceTest.projectAllowed({ role: 'manager', projectIds: ['P2'] }, 'P2'), true);
  assert.equal(evidenceTest.projectAllowed({ role: 'head', projectIds: [] }, 'P9'), true);
});

test('M4 migration adds evidence idempotency, upload reservation and conflict receipts', async () => {
  const sql = await read('migrations/0008_offline_r2_evidence.sql');
  assert.match(sql, /ALTER TABLE core_field_evidence ADD COLUMN idempotency_key/i);
  assert.match(sql, /ADD COLUMN storage_status TEXT NOT NULL DEFAULT 'ready'/i);
  assert.match(sql, /uq_core_field_evidence_idempotency/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_sync_conflicts/i);
  assert.match(sql, /client_revision/i);
  assert.match(sql, /server_revision/i);
  assert.doesNotMatch(sql, /ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP/i);
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

test('offline login requires prior cloud identity, remembered cutover and never enrolls a privileged device', async () => {
  const source = await read('src/lib/offline-login.js');
  assert.match(source, /candidate\?\.cloudIdentity/);
  assert.match(source, /isCloudCutoverRemembered/);
  assert.match(source, /authenticate\(email, password, getDeviceIdentity\(\)\)/);
  assert.match(source, /clearApiToken\(\)/);
  assert.doesNotMatch(source, /markSuperadminHost/);
  assert.doesNotMatch(source, /registerTestDevice/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*password/i);
});

test('service worker never caches API traffic', async () => {
  const source = await read('sw.js');
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /if \(isPrivateApi\(url\)\) return/);
  assert.match(source, /proqtrack-v5/);
  assert.match(source, /offline-login\.js/);
});

test('R2 evidence API is separate from locked legacy file API and uses resumable reservation state', async () => {
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
  assert.match(evidence, /storage_status='uploading'/);
  assert.match(evidence, /storage_status='ready'/);
  assert.doesNotMatch(evidence, /env\.FILES\.delete/);
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

test('revision conflicts are recorded before client replay', async () => {
  const [main, sync] = await Promise.all([read('worker/main.js'), read('worker/m4-sync.js')]);
  assert.match(main, /handleM4Sync/);
  assert.match(sync, /core_sync_conflicts/);
  assert.match(sync, /REVISION_CONFLICT/);
  assert.match(sync, /client_replay/);
});

test('M4 bootstrap loads offline engine, evidence queue and offline login', async () => {
  const [logo, bootstrap] = await Promise.all([read('assets/logo.js'), read('src/m4-bootstrap.js')]);
  assert.match(logo, /m4-bootstrap\.js/);
  assert.match(bootstrap, /offline-engine\.js/);
  assert.match(bootstrap, /evidence-client\.js/);
  assert.match(bootstrap, /offline-login\.js/);
});
