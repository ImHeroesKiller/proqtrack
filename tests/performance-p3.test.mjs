import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3 production profiler is lazy, bounded, local-only, and disposable', async () => {
  const [bootstrap, monitor] = await Promise.all([
    read('src/bootstrap.js'),
    read('src/lib/performance-monitor.js'),
  ]);
  assert.match(bootstrap, /\.\/lib\/performance-monitor\.js', 'performance-monitor'/);
  const criticalStart = bootstrap.indexOf('// Critical runtime only.');
  const criticalEnd = bootstrap.indexOf('// cloud-cutover and offline login', criticalStart);
  assert.doesNotMatch(bootstrap.slice(criticalStart, criticalEnd), /performance-monitor/);

  assert.match(monitor, /const MAX_SAMPLES = 60/);
  assert.match(monitor, /const LONG_TASK_THRESHOLD_MS = 50/);
  assert.match(monitor, /while \(samples\.length > MAX_SAMPLES\) samples\.shift\(\)/);
  assert.match(monitor, /PerformanceObserver/);
  assert.match(monitor, /observer\?\.disconnect\(\)/);
  assert.match(monitor, /controller\?\.abort\(\)/);
  assert.match(monitor, /pagehide/);
  assert.doesNotMatch(monitor, /fetch\(/);
  assert.doesNotMatch(monitor, /XMLHttpRequest/);
  assert.doesNotMatch(monitor, /setInterval\(/);
});

test('P3 route rendering emits bounded local timing and suspends background work', async () => {
  const app = await read('src/app.js');
  assert.match(app, /const renderStartedAt = typeof performance !== 'undefined' \? performance\.now\(\) : Date\.now\(\)/);
  assert.match(app, /proqtrack:render-complete/);
  assert.match(app, /durationMs:Math\.max\(0, renderFinishedAt - renderStartedAt\)/);
  assert.match(app, /if \(document\.visibilityState !== 'visible'\) \{\s*stopRouteRefresh\(\);/s);
  assert.match(app, /window\.addEventListener\('pagehide'/);
  assert.match(app, /disposeTrackingMap\(\)/);
  assert.match(app, /window\.FS\?\.disposeOutletMap\?\.\(\)/);
  assert.match(app, /cancelAnimationFrame\(renderFrame\)/);
});

test('P3 long-session tenant signature memory is bounded', async () => {
  const offline = await read('src/lib/offline-engine.js');
  assert.match(offline, /const MAX_SIGNATURE_TENANTS = 20/);
  assert.match(offline, /function rememberSignature/);
  assert.match(offline, /lastSignatures\.delete\(key\)/);
  assert.match(offline, /while \(lastSignatures\.size > MAX_SIGNATURE_TENANTS\)/);
  assert.match(offline, /lastSignatures\.delete\(lastSignatures\.keys\(\)\.next\(\)\.value\)/);
  assert.doesNotMatch(offline, /lastSignatures\.set\(organizationId, nextSignature\)/);
});

test('P3 performance budget covers current production hotspots with limited headroom', async () => {
  const config = JSON.parse(await read('performance-budget.json'));
  const budget = config.budgets;
  assert.equal(budget.source['src/app.js'], 350000);
  assert.equal(budget.source['src/lib/db.js'], 125000);
  assert.equal(budget.source['src/types/index.js'], 120000);
  assert.equal(budget.frontendJsTotalBytes, 1250000);
  assert.ok(budget.distPrecacheAssetCount <= 140);
  assert.ok(budget.distPrecacheTotalBytes <= 1900000);

  for (const [path, maxBytes] of Object.entries(budget.source)) {
    const actual = (await stat(new URL(`../${path}`, import.meta.url))).size;
    assert.ok(actual <= maxBytes, `${path} exceeds budget: ${actual} > ${maxBytes}`);
  }
});

test('P3 CI and production deploy both enforce the performance budget gate', async () => {
  const [pkgText, ci, production, script] = await Promise.all([
    read('package.json'),
    read('.github/workflows/ci.yml'),
    read('.github/workflows/cloudflare-mvp.yml'),
    read('scripts/performance-budget.mjs'),
  ]);
  const pkg = JSON.parse(pkgText);
  assert.equal(pkg.scripts['perf:budget'], 'node scripts/performance-budget.mjs');
  assert.match(pkg.scripts.check, /npm run perf:budget/);
  assert.match(pkg.scripts['deploy:live'], /npm run perf:budget/);
  assert.match(ci, /Performance budget gate/);
  assert.match(ci, /npm run perf:budget/);
  assert.match(production, /Performance budget gate/);
  assert.match(production, /npm run perf:budget/);

  assert.match(script, /dist\/precache-manifest\.json/);
  assert.match(script, /frontend JS total/);
  assert.match(script, /precache asset count/);
  assert.match(script, /precache total bytes/);
  assert.match(script, /performance-budget-report\.json/);
  assert.match(script, /process\.exitCode = 1/);
});
