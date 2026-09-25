import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P2 runtime coalesces shell renders and uses one route-aware refresh timer', async () => {
  const app = await read('src/app.js');
  assert.match(app, /function scheduleRender\(\)/);
  assert.match(app, /renderFrame = requestAnimationFrame/);
  assert.match(app, /cancelAnimationFrame\(renderFrame\)/);
  assert.match(app, /const PASSIVE_REFRESH_COOLDOWN_MS = 5000/);
  assert.match(app, /function routeRefreshConfig/);
  assert.match(app, /function configureRouteRefresh/);
  assert.match(app, /function refreshActiveRoute/);
  assert.match(app, /state\.routeRefreshTimer = setTimeout/);
  assert.doesNotMatch(app, /homeRefreshTimer/);
  assert.doesNotMatch(app, /trackingRefreshTimer/);
  assert.doesNotMatch(app, /visitsRefreshTimer/);

  const refreshStart = app.indexOf('const HOME_REFRESH_MS');
  const renderStart = app.indexOf('// ===== Main Render =====', refreshStart);
  const refreshRuntime = app.slice(refreshStart, renderStart);
  assert.doesNotMatch(refreshRuntime, /setInterval\(/);
  assert.match(app, /refreshActiveRoute\(\{ reason:'visibility' \}\)/);
  assert.match(app, /refreshActiveRoute\(\{ reason:'focus' \}\)/);
});

test('P2 cloud refresh is single-flight and operational sync wait is event-driven in browser', async () => {
  const cloud = await read('src/lib/cloud-data.js');
  assert.match(cloud, /let refreshPromise = null/);
  assert.match(cloud, /let refreshKey = ''/);
  assert.match(cloud, /if \(refreshPromise && refreshKey === key\) return refreshPromise/);
  assert.match(cloud, /request\.then\(clearRequest, clearRequest\)/);

  const waitStart = cloud.indexOf('export async function waitForOperationalSync');
  const waitEnd = cloud.indexOf('export function restoreOperationalBaseline', waitStart);
  const wait = cloud.slice(waitStart, waitEnd);
  assert.match(wait, /window\.addEventListener\('proqtrack:cloud-status', onStatus\)/);
  assert.match(wait, /window\.removeEventListener\('proqtrack:cloud-status', onStatus\)/);
  assert.match(wait, /clearTimeout\(timeout\)/);
  assert.match(wait, /queueMicrotask/);
  assert.doesNotMatch(wait, /setTimeout\(resolve, 50\)/);
});

test('P2 tracking and outlet map resources have explicit cleanup and stale request cancellation', async () => {
  const [app, field] = await Promise.all([
    read('src/app.js'),
    read('src/field-sales.js'),
  ]);
  assert.match(app, /function disposeTrackingMap\(\)/);
  assert.match(app, /_map\.remove\(\)/);
  assert.match(app, /if \(route !== '#\/tracking'\) disposeTrackingMap\(\)/);
  assert.match(app, /window\.FS\?\.disposeOutletMap\?\.\(\)/);
  assert.match(app, /trackingFilterTimer = setTimeout/);

  assert.match(field, /window\.FS\.disposeOutletMap = function/);
  assert.match(field, /_outletMap\.off\(\)/);
  assert.match(field, /_outletMap\.remove\(\)/);
  assert.match(field, /new AbortController\(\)/);
  assert.match(field, /_outletSearchController\?\.abort\(\)/);
  assert.match(field, /_outletGeocodeController\?\.abort\(\)/);
  assert.match(field, /const GEOCODE_CACHE_MAX = 50/);
  assert.match(field, /const GEOCODE_CACHE_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(field, /while \(reverseGeocodeCache\.size > GEOCODE_CACHE_MAX\)/);
});

test('P2 service worker runtime cache is bounded and only cleans ProQTrack cache namespaces', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /const RUNTIME_CACHE = `proqtrack-runtime-\$\{RELEASE\}`/);
  assert.match(sw, /const CACHE_PREFIXES = \['proqtrack-shell-', 'proqtrack-runtime-'\]/);
  assert.match(sw, /const RUNTIME_MAX_ENTRIES = 80/);
  assert.match(sw, /CACHE_PREFIXES\.some\(prefix => key\.startsWith\(prefix\)\)/);
  assert.match(sw, /async function trimRuntimeCache/);
  assert.match(sw, /keys\.slice\(0, excess\)/);
  assert.match(sw, /async function putRuntimeCache/);
  assert.match(sw, /isRuntimeCacheable/);
  assert.doesNotMatch(sw, /keys\.filter\(key => key !== CACHE\)/);
  assert.match(sw, /if \(isPrivateApi\(url\)\) return/);
});

test('P2 offline engine listeners can be torn down without accumulating handlers', async () => {
  const offline = await read('src/lib/offline-engine.js');
  assert.match(offline, /let runtimeController = null/);
  assert.match(offline, /runtimeController = new AbortController\(\)/);
  assert.match(offline, /const \{ signal \} = runtimeController/);
  assert.match(offline, /\{ signal \}/);
  assert.match(offline, /runtimeController\?\.abort\(\)/);
  assert.match(offline, /lastSignatures\.clear\(\)/);
  assert.match(offline, /installed = false/);
});
