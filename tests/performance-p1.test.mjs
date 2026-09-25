import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P1 removes Leaflet from startup HTML and loads it on demand', async () => {
  const [html, loader, app, fieldSales] = await Promise.all([
    read('index.html'),
    read('src/lib/leaflet-loader.js'),
    read('src/app.js'),
    read('src/field-sales.js'),
  ]);
  assert.doesNotMatch(html, /vendor\/leaflet\/leaflet\.(css|js)/);
  assert.match(loader, /assets\/vendor\/leaflet\/leaflet\.css/);
  assert.match(loader, /assets\/vendor\/leaflet\/leaflet\.js/);
  assert.match(loader, /export function ensureLeaflet/);
  assert.match(app, /await ensureLeaflet\(\)/);
  assert.doesNotMatch(app, /setTimeout\(initMap,\s*200\)/);
  assert.match(fieldSales, /initOutletMap = async function/);
  assert.match(fieldSales, /await ensureLeaflet\(\)/);
});

test('P1 route-heavy and evidence modules are lazy instead of startup blocking', async () => {
  const [bootstrap, m4] = await Promise.all([
    read('src/bootstrap.js'),
    read('src/m4-bootstrap.js'),
  ]);
  const criticalStart = bootstrap.indexOf('// Critical runtime only.');
  const criticalEnd = bootstrap.indexOf('// cloud-cutover and offline login', criticalStart);
  const critical = bootstrap.slice(criticalStart, criticalEnd);
  assert.ok(!critical.includes('./types/index.js'));
  assert.ok(!critical.includes('./reports/index-v2.js'));
  assert.ok(!critical.includes('./operational-mapping.js'));
  assert.match(bootstrap, /loadProjectRuntime/);
  assert.match(bootstrap, /loadReportRuntime/);
  assert.match(bootstrap, /scheduleIdleRuntime/);
  assert.doesNotMatch(m4, /^import ['"]\.\/lib\/evidence-client\.js['"];?/m);
  assert.doesNotMatch(m4, /^import ['"]\.\/lib\/field-photo-evidence\.js['"];?/m);
  assert.match(m4, /import\('\.\/lib\/evidence-client\.js'\)/);
  assert.match(m4, /import\('\.\/lib\/field-photo-evidence\.js'\)/);
  assert.match(m4, /scheduleEvidenceRuntime/);
});

test('P1 evidence queue uses IndexedDB indexes for scoped rows and counts', async () => {
  const source = await read('src/lib/offline-store.js');
  assert.match(source, /index\('organization_status'\)/);
  assert.match(source, /index\.getAll\(IDBKeyRange\.only\(\[organizationId, status\]\)\)/);
  assert.match(source, /index\.count\(IDBKeyRange\.only\(\[organizationId, status\]\)\)/);
  assert.match(source, /export async function countEvidenceQueue/);
  const statsStart = source.indexOf('export async function offlineQueueStats');
  const stats = source.slice(statsStart, statsStart + 700);
  assert.match(stats, /countEvidenceQueue\(organizationId\)/);
  assert.doesNotMatch(stats, /listEvidence\(organizationId\)/);
});

test('P1 evidence previews create object URLs only for visible previews and revoke them', async () => {
  const source = await read('src/lib/evidence-client.js');
  const queueStart = source.indexOf('export async function queueEvidence');
  const uploadStart = source.indexOf('async function uploadQueuedEvidence', queueStart);
  const queueBody = source.slice(queueStart, uploadStart);
  assert.doesNotMatch(queueBody, /URL\.createObjectURL/);
  assert.match(source, /const previewUrl = URL\.createObjectURL\(file\)/);
  assert.match(source, /URL\.revokeObjectURL\(previewUrl\)/);
});

test('P1 photo evidence gallery renders in bounded lazy-decoded batches', async () => {
  const [app, fieldSales] = await Promise.all([
    read('src/app.js'),
    read('src/field-sales.js'),
  ]);
  assert.match(app, /const PHOTO_PAGE_SIZE = 24/);
  assert.match(app, /const visiblePhotos = photos\.slice\(0, visibleCount\)/);
  assert.match(app, /loading="lazy" decoding="async" fetchpriority="low"/);
  assert.match(app, /FT\.loadMorePhotos/);
  assert.match(fieldSales, /state\._photoVisibleCount = 0/);
});

test('P1 removes long-lived document-wide MutationObservers from route runtimes', async () => {
  const [entry, projectRuntime, reports, phase0] = await Promise.all([
    read('src/entry.js'),
    read('src/types/index.js'),
    read('src/reports/index-v2.js'),
    read('src/phase0-ui.js'),
  ]);
  assert.match(entry, /observer\.disconnect\(\)/);
  assert.doesNotMatch(projectRuntime, /new MutationObserver/);
  assert.doesNotMatch(reports, /new MutationObserver/);
  assert.match(projectRuntime, /proqtrack:db-persisted/);
  assert.match(reports, /proqtrack:db-persisted/);
  assert.match(phase0, /enhancementRoot=document\.getElementById\('app'\)\|\|document\.body/);
  assert.match(phase0, /pagehide.*enhancementObserver\.disconnect/s);
});
