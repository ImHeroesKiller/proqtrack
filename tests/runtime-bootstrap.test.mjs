import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production HTML uses one explicit runtime bootstrap', async () => {
  const [html, logo] = await Promise.all([
    read('index.html'),
    read('assets/logo.js'),
  ]);

  assert.match(html, /import '\.\/assets\/logo\.js';/);
  assert.match(html, /await import\('\.\/src\/bootstrap\.js'\)/);
  assert.doesNotMatch(html, /await import\('\.\/src\/app\.js'\)/);
  assert.doesNotMatch(html, /await import\('\.\/src\/types\/index\.js'\)/);

  assert.doesNotMatch(logo, /src\/cloud-cutover\.js/);
  assert.doesNotMatch(logo, /src\/m4-bootstrap\.js/);
  assert.doesNotMatch(logo, /src\/reports\//);
  assert.doesNotMatch(logo, /src\/app\.js/);
});

test('runtime bootstrap contains all P0 modules in deterministic order', async () => {
  const source = await read('src/bootstrap.js');
  const ordered = [
    "./types/index.js",
    "./reports/index-v2.js",
    "./reports/phase4-fixed.js",
    "./cloud-cutover.js",
    "./m4-bootstrap.js",
    "./lib/m6-client.js",
    "./app.js",
  ];

  let previous = -1;
  for (const token of ordered) {
    const current = source.indexOf(token);
    assert.ok(current > previous, `${token} must load after the previous runtime module`);
    previous = current;
  }

  assert.match(source, /__PROQTRACK_BOOT__/);
  assert.match(source, /__m3CloudCutoverInstalled/);
  assert.match(source, /__m4OfflineLoginInstalled/);
  assert.match(source, /ReportPhase4/);
  assert.match(source, /ProQTrackM6/);
  assert.match(source, /proqtrack:boot-ready/);
});

test('P0 runtime modules keep cloud, offline, evidence and reporting responsibilities wired', async () => {
  const [cloud, m4, reports, reportPhase4] = await Promise.all([
    read('src/cloud-cutover.js'),
    read('src/m4-bootstrap.js'),
    read('src/reports/index-v2.js'),
    read('src/reports/phase4-fixed.js'),
  ]);

  assert.match(cloud, /installStorageWriteThrough\(\)/);
  assert.match(cloud, /establishCloudSession/);
  assert.match(cloud, /bootstrapOperationalData/);
  assert.match(cloud, /applyRemoteDataToLocal/);

  assert.match(m4, /offline-engine\.js/);
  assert.match(m4, /evidence-client\.js/);
  assert.match(m4, /field-photo-evidence\.js/);
  assert.match(m4, /offline-login\.js/);
  assert.match(m4, /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match(m4, /__PROQTRACK_M4_BOOTSTRAP_LOADED__/);

  assert.match(reports, /window\.Reports/);
  assert.match(reportPhase4, /window\.ReportPhase4/);
});

test('service worker advances cache and precaches the explicit bootstrap', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.6/);
  assert.match(sw, /'\.\/src\/bootstrap\.js'/);
  assert.match(sw, /pathname\.startsWith\('\/api\/'\)/);
});
