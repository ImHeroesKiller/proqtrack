import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Demo organization receives an idempotent representative dataset', async () => {
  const sql = await read('migrations/0022_demo_organization_dataset.sql');
  assert.match(sql, /INSERT OR IGNORE INTO core_clients/);
  assert.match(sql, /INSERT OR IGNORE INTO core_projects/);
  assert.match(sql, /INSERT OR IGNORE INTO core_employees/);
  assert.match(sql, /INSERT OR IGNORE INTO core_outlets/);
  assert.match(sql, /INSERT OR IGNORE INTO core_products/);
  assert.match(sql, /INSERT OR IGNORE INTO core_attendance/);
  assert.match(sql, /INSERT OR IGNORE INTO core_visits/);
  assert.match(sql, /INSERT OR IGNORE INTO core_product_sales/);
  assert.match(sql, /INSERT OR IGNORE INTO core_competitors/);
  assert.match(sql, /'ORG-DEFAULT'/);
  assert.match(sql, /cutover_mode='cloud'/);
});

test('login supports password visibility and keyboard submission', async () => {
  const app = await read('src/app.js');
  assert.match(app, /FT\.toggleLoginPassword\(this\)/);
  assert.match(app, /this\.requestSubmit\(\)/);
  assert.match(app, /autocomplete="current-password"/);
  assert.match(app, /aria-label="Tampilkan password"/);
  assert.match(app, /input\.type = visible \? 'password' : 'text'/);
});

test('login page avoids render-blocking font and map resources', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.match(html, /<script defer src="\.\/assets\/vendor\/leaflet\/leaflet\.js"><\/script>/);
  assert.doesNotMatch(html, /https:\/\/unpkg\.com/);
});

test('service worker cache is advanced for immediate client refresh', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.8/);
});
