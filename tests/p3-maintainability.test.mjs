import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dispatchUiHandler, splitUiArgs } from '../src/lib/ui-events.js';
import { createZipBuilder, createPdfBlob } from '../src/lib/document-export.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const UI_TEMPLATE_FILES = [
  'src/app.js',
  'src/field-sales.js',
  'src/organization.js',
  'src/reports/index-v2.js',
  'src/reports/phase4-fixed.js',
  'src/reports/phase4-preview.js',
  'src/types/reports-export.js',
  'src/bulk-employees.js',
  'src/bulk-master.js',
  'src/account-settings.js',
  'src/types/index.js',
  'src/m4-bootstrap.js',
];

test('active UI templates use delegated data actions instead of executable inline attributes', async () => {
  let delegatedCount = 0;
  for (const path of UI_TEMPLATE_FILES) {
    const source = await read(path);
    assert.doesNotMatch(source, /(?:^|[\s<])on(?:click|submit|change|input|keydown)\s*=/m, path);
    delegatedCount += (source.match(/data-pqt-on(?:click|submit|change|input|keydown)\s*=/g) || []).length;
  }
  assert.ok(delegatedCount >= 271, `expected migrated actions, got ${delegatedCount}`);
});

test('delegated UI dispatcher executes only the supported grammar without eval', async () => {
  const source = await read('src/lib/ui-events.js');
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function\b|unsafe-eval/);

  const calls = [];
  const root = {
    FT: {
      closeModal() { calls.push(['close']); },
      filterTracking(value) { calls.push(['filter', value]); },
    },
    Reports: {
      customAddCol(value) { calls.push(['col', value]); },
    },
    location: { hash: '' },
  };
  let submitted = false;
  let prevented = false;
  const element = {
    value: 'area-1',
    checked: true,
    requestSubmit() { submitted = true; },
  };
  const event = {
    target: element,
    key: 'Enter',
    shiftKey: false,
    preventDefault() { prevented = true; },
  };

  dispatchUiHandler('FT.closeModal()', element, event, root);
  dispatchUiHandler('FT.filterTracking(this.value)', element, event, root);
  dispatchUiHandler('if(this.value)Reports.customAddCol(this.value)', element, event, root);
  dispatchUiHandler("location.hash='#/settings'", element, event, root);
  dispatchUiHandler("if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.requestSubmit();}", element, event, root);

  assert.deepEqual(calls, [['close'], ['filter', 'area-1'], ['col', 'area-1']]);
  assert.equal(root.location.hash, '#/settings');
  assert.equal(submitted, true);
  assert.equal(prevented, true);
  assert.deepEqual(splitUiArgs("event,'abc',this.value,true,null"), ['event', "'abc'", 'this.value', 'true', 'null']);
});

test('report packaging is browser-native and does not load executable CDN libraries', async () => {
  const source = await read('src/types/reports-export.js');
  assert.match(source, /document-export\.js/);
  assert.doesNotMatch(source, /cdn\.jsdelivr\.net|unpkg\.com|jszip@|jspdf@|loadScript\(/);

  const zip = createZipBuilder();
  zip.file('hello.txt', 'hello');
  zip.folder('nested').file('world.txt', 'world');
  const zipBytes = new Uint8Array(await (await zip.generateAsync({ type: 'blob' })).arrayBuffer());
  assert.deepEqual([...zipBytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...zipBytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);

  const pdf = createPdfBlob({
    title: 'Laporan Test',
    headers: ['A', 'B'],
    rows: [['1', '2']],
    filters: { start: '2026-09-01', end: '2026-09-30' },
    generatedAt: '2026-09-23T00:00:00+07:00',
  });
  const pdfText = new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()));
  assert.match(pdfText, /^%PDF-1\.4/);
  assert.match(pdfText, /%%EOF\s*$/);
});

test('CSP no longer permits executable inline attributes or third-party scripts', async () => {
  const [headers, hardening] = await Promise.all([read('_headers'), read('worker/hardening.js')]);
  for (const source of [headers, hardening]) {
    assert.match(source, /script-src 'self'/);
    assert.match(source, /script-src-elem 'self'/);
    assert.doesNotMatch(source, /script-src-attr/);
    assert.doesNotMatch(source, /unsafe-eval|cdn\.jsdelivr\.net|unpkg\.com/);
  }
});

test('conflicted offline snapshots remain blocked until explicit resolution', async () => {
  const [offline, bootstrap] = await Promise.all([
    read('src/lib/offline-engine.js'),
    read('src/m4-bootstrap.js'),
  ]);
  assert.match(offline, /requiresReview: true/);
  assert.match(offline, /if \(item\?\.requiresReview\)/);
  assert.match(offline, /export async function discardHeldSnapshot/);
  assert.match(offline, /conflict-resolved-server/);
  assert.match(bootstrap, /Perubahan perlu ditinjau/);
  assert.match(bootstrap, /Gunakan versi terbaru/);
  assert.match(bootstrap, /ProQOffline\?\.discardHeldSnapshot/);
  assert.doesNotMatch(bootstrap, /D1|Cloudflare|GitHub/);
});

test('P3 runtime and PWA baseline wires maintenance modules explicitly', async () => {
  const [bootstrap, sw] = await Promise.all([read('src/bootstrap.js'), read('sw.js')]);
  assert.match(bootstrap, /p3-runtime-2026-09-23/);
  assert.match(bootstrap, /\.\/lib\/ui-events\.js/);
  assert.match(bootstrap, /uiEvents: Boolean\(window\.ProQUIEvents\)/);
  assert.match(sw, /proqtrack-v12\.16/);
  assert.match(sw, /\.\/src\/lib\/ui-events\.js/);
  assert.match(sw, /\.\/src\/lib\/document-export\.js/);
});
