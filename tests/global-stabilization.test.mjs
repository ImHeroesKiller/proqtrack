import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const stockUi = readFileSync(new URL('../src/lib/stock-sales-ui.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const state = readFileSync(new URL('../CURRENT_STATE.md', import.meta.url), 'utf8');

test('stability authoritative mutations rehydrate Products and Outlets', () => {
  assert.match(app,/async function confirmAuthoritativeSync\(\)/);
  assert.match(app,/await waitForOperationalSync\(\);\s*await refreshOperationalData\(getDB\(\), getActor\(\)\)/);
  assert.match(app,/createProduct\(data\).*?await confirmAuthoritativeSync\(\)/s);
  assert.match(app,/updateProduct\(id,data\).*?await confirmAuthoritativeSync\(\)/s);
  assert.match(app,/deleteProduct\(id\);await confirmAuthoritativeSync\(\)/);
  assert.match(app,/createOutlet\(data\).*?await confirmAuthoritativeSync\(\)/s);
  assert.match(app,/updateOutlet\(id,data\).*?await confirmAuthoritativeSync\(\)/s);
});

test('stability Stock Sales user copy avoids internal implementation vocabulary', () => {
  for (const phrase of [
    'tersinkron ke cloud',
    'Opening stock diambil otomatis dari saldo cloud',
    'Derived sales berasal dari Inventory Cycle',
    'memperbarui derived sales secara kompensasi',
    'Belum ada finalized cycle sebelumnya',
  ]) assert.equal(app.includes(phrase), false, phrase);
  assert.equal(stockUi.includes('Data cloud berubah'), false);
  assert.equal(stockUi.includes('Sinkronisasi cloud belum siap'), false);
});

test('stability chained corrections derive available quantity from prior effective sale and closing', () => {
  assert.match(worker,/Number\(sourceCycle\.sell_out_qty \|\| 0\) \+ Number\(sourceCycle\.closing_qty \|\| 0\)/);
});

test('stability shell cache and production state move together', () => {
  assert.match(sw,/proqtrack-v12\.44/);
  assert.match(state,/0027_inventory_cycle_correction_uat\.sql/);
  assert.match(state,/proqtrack-v12\.44/);
});
