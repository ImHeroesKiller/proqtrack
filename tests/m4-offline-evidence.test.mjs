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
  assert.match(source, /proqtrack:db-persisted/);
  assert.doesNotMatch(source, /setInterval\(observeLocalCache/);
  assert.match(source, /recoverCloudConflict/);
});

test('offline login requires prior cloud identity, remembered cutover and never falls back locally', async () => {
  const source = await read('src/lib/offline-login.js');
  assert.match(source, /candidate\?\.cloudIdentity/);
  assert.match(source, /isCloudCutoverRemembered/);
  assert.match(source, /authenticate\(email, password, getDeviceIdentity\(\)\)/);
  assert.match(source, /clearApiToken\(\)/);
  assert.match(source, /Login offline belum tersedia/);
  const gateStart = source.indexOf("if (!candidate?.cloudIdentity");
  const authStart = source.indexOf('let account = null', gateStart);
  assert.ok(gateStart >= 0 && authStart > gateStart);
  assert.doesNotMatch(source.slice(gateStart, authStart), /original\.call/);
  assert.doesNotMatch(source, /markSuperadminHost/);
  assert.doesNotMatch(source, /registerTestDevice/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*password/i);
});

test('conflict recovery hydrates server state but holds local snapshot for explicit review', async () => {
  const source = await read('src/lib/offline-engine.js');
  assert.match(source, /const lastSignatures = new Map\(\)/);
  assert.match(source, /if \(recovering\) return false/);
  assert.match(source, /persistDB\('offline-replay'\)/);
  assert.match(source, /status === 'ready' && !recovering/);
  assert.match(source, /conflict-held/);
  const recoveryStart = source.indexOf('export async function recoverCloudConflict');
  const recoveryEnd = source.indexOf('export function installOfflineEngine', recoveryStart);
  const recovery = source.slice(recoveryStart, recoveryEnd);
  assert.match(recovery, /cloud\.applyRemoteDataToLocal/);
  assert.doesNotMatch(recovery, /await replayLatestSnapshot/);
});

test('service worker never caches API traffic and precaches the complete built app', async () => {
  const [source, build] = await Promise.all([read('sw.js'), read('scripts/build.mjs')]);
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /if \(isPrivateApi\(url\)\) return/);
  assert.match(source, /proqtrack-v12/);
  assert.match(source, /PRECACHE_MANIFEST/);
  assert.match(source, /field-photo-evidence\.js/);
  assert.match(source, /m6-client\.js/);
  assert.match(build, /precache-manifest\.json/);
  assert.match(build, /collectFiles\("dist"\)/);
  assert.match(build, /runtimeGraph\("src\/entry\.js"\)/);
  assert.match(build, /node_modules\/leaflet\/dist\/leaflet\.js/);
  assert.match(build, /writeFile/);
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

test('revision conflicts are recorded for manual resolution', async () => {
  const [main, sync] = await Promise.all([read('worker/main.js'), read('worker/m4-sync.js')]);
  assert.match(main, /handleM4Sync/);
  assert.match(sync, /core_sync_conflicts/);
  assert.match(sync, /REVISION_CONFLICT/);
  assert.match(sync, /'manual'/);
});

test('M4 bootstrap loads offline engine, evidence queue and offline login', async () => {
  const [runtimeBootstrap, bootstrap] = await Promise.all([read('src/bootstrap.js'), read('src/m4-bootstrap.js')]);
  assert.match(runtimeBootstrap, /load\('\.\/m4-bootstrap\.js', 'm4-bootstrap'\)/);
  assert.match(runtimeBootstrap, /m4BootstrapModule\.installOfflineRuntime\?\.\(\)/);
  assert.match(bootstrap, /offline-engine\.js/);
  assert.match(bootstrap, /evidence-client\.js/);
  assert.match(bootstrap, /installOfflineLogin/);
  assert.match(bootstrap, /export function installOfflineRuntime\(\)/);
});


test('offline login only marks installed after FT hook is attached', async () => {
  const source = await read('src/lib/offline-login.js');
  const waitIndex = source.indexOf("if (!window.FT?.handleLogin || !window.FT?.state)");
  const flagIndex = source.indexOf('window.FT.__m4OfflineLoginInstalled = true');
  const installedIndex = source.indexOf('installed = true', flagIndex);
  assert.ok(waitIndex >= 0 && flagIndex > waitIndex);
  assert.ok(installedIndex > flagIndex);
  assert.match(source, /retryScheduled/);
});
