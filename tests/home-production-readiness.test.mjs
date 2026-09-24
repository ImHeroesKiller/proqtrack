import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Home uses the active organization timezone for operational day boundaries', async () => {
  const [utils, branding, app] = await Promise.all([
    read('src/lib/utils.js'),
    read('src/lib/organization-branding.js'),
    read('src/app.js'),
  ]);
  assert.match(utils, /export function runtimeTimezone\(\)/);
  assert.match(utils, /todayISO\(timeZone = runtimeTimezone\(\)\)/);
  assert.match(branding, /root\.dataset\.orgTimezone = timezone/);
  assert.match(branding, /__PROQTRACK_TIMEZONE__/);
  assert.match(app, /visitDay\(v\) === todayISO\(\)/);
});

test('Manager stock visibility fails closed to the active project', async () => {
  const db = await read('src/lib/db.js');
  const start = db.indexOf('export function getStocks()');
  const end = db.indexOf('export function getStocksByOutlet', start);
  const body = db.slice(start,end);
  assert.match(body, /actor\?\.role === 'manager' && actor\.projectId/);
  assert.match(body, /String\(row\.projectId \|\| ''\) === projectId/);
  assert.match(body, /linkedProjectIds\(outlet\)\.includes\(projectId\)/);
  assert.match(body, /linkedProjectIds\(product\)\.includes\(projectId\)/);
});

test('Home refresh is cloud authoritative but never overwrites pending local work', async () => {
  const [cloud, app] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('src/app.js'),
  ]);
  assert.match(cloud, /export async function refreshOperationalData/);
  assert.match(cloud, /syncing \|\| queuedSnapshot/);
  assert.match(cloud, /diffSnapshots\(baseline,currentSnapshot\)\.length/);
  assert.match(cloud, /authorization:`Bearer \${refreshToken}`/);
  assert.match(cloud, /getApiToken\(\) !== refreshToken/);
  assert.match(app, /const HOME_REFRESH_MS = 45000/);
  assert.match(app, /window\.FT\.refreshHome/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /window\.addEventListener\('focus'/);
});

test('production Home no longer loads legacy Phase 0 fake dashboard enhancers', async () => {
  const [bootstrap, legacy] = await Promise.all([
    read('src/bootstrap.js'),
    read('src/phase0-ui.js'),
  ]);
  assert.doesNotMatch(bootstrap, /phase0-ui\.js/);
  assert.doesNotMatch(bootstrap, /phase0-data\.js/);
  assert.match(bootstrap, /pwa-install\.js/);
  assert.match(legacy, /Grafik aktivitas tujuh hari/);
});

test('Home activity and action surfaces are production scoped and contextual', async () => {
  const app = await read('src/app.js');
  assert.match(app, /sort\(\(a,b\) => String\(b\.checkInTime/);
  assert.match(app, /home-hero/);
  assert.doesNotMatch(app, /background:linear-gradient\(135deg,#fff7ed,#fff\)/);
  assert.match(app, /FT\.openTrackingEmployee/);
  assert.match(app, /leavePeriod/);
  assert.match(app, /submittedByName/);
  assert.match(app, /title="Sedang di lapangan"/);
  assert.match(app, /label: 'Home'/);
});
