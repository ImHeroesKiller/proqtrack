import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const fieldSales = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');

test('P2 Stock filters project outlet and status using row metadata', () => {
  assert.match(app,/id="stockProjectFilter"/);
  assert.match(app,/id="stockOutletFilter"/);
  assert.match(app,/row\.dataset\.project === project/);
  assert.match(app,/row\.dataset\.outlet === outlet/);
  assert.match(app,/row\.dataset\.status === statusF/);
});

test('P2 Stock dashboard exposes operational stock health summaries', () => {
  assert.match(app,/Saldo stok/);
  assert.match(app,/Stok menipis/);
  assert.match(app,/Stok habis/);
});

test('P2 visit stock captures stock-in explicitly instead of inferring replenishment', () => {
  assert.match(fieldSales,/name="stockInQty"/);
  assert.match(app,/const stockInQty = Number\(row\.querySelector\('\[name="stockInQty"\]'\)/);
  assert.doesNotMatch(app,/inferredStockIn/);
});

test('P2 Stock preflights daily duplicate cycle and impossible closing balance', () => {
  assert.match(app,/function inventoryCycleOnDate\(/);
  assert.match(app,/Cycle stok hari ini/);
  assert.match(app,/closingQty > openingQty \+ stockInQty/);
});

test('P2 Manager Stock movement supports explicit recorder employee', () => {
  assert.match(app,/Pencatat/);
  assert.match(app,/name="employeeId" required/);
  assert.match(app,/String\(data\.employeeId \|\| myEmployeeId\(\) \|\| ''\)/);
});

test('P2 Sales has operational summary and filters', () => {
  assert.match(app,/Transaksi aktif/);
  assert.match(app,/Qty terjual/);
  assert.match(app,/Nilai penjualan/);
  assert.match(app,/id="salesSourceFilter"/);
  assert.match(app,/id="salesFromFilter"/);
  assert.match(app,/id="salesToFilter"/);
  assert.match(app,/window\.FT\.filterProductSales/);
});

test('P2 Manual Sale correction uses governed modal instead of browser prompt', () => {
  assert.match(app,/Koreksi Manual Sale/);
  assert.match(app,/confirmManualSaleCorrection/);
  assert.match(app,/Void & Buat Replacement/);
  assert.doesNotMatch(app,/prompt\('Alasan koreksi manual sale/);
});

test('P2 Stock Sales translates common cloud conflict states to user feedback', () => {
  assert.match(app,/function stockSalesFriendlyError\(/);
  assert.match(app,/REVISION_CONFLICT/);
  assert.match(app,/INVENTORY_CYCLE_OPENING_MISMATCH/);
  assert.match(app,/CLOUD_SYNC_TIMEOUT/);
});


test('P2 visit stock validates whole batch before creating ledger cycles', () => {
  assert.match(app,/const entries = \[\]/);
  assert.match(app,/if \(!entries\.length\) throw new Error\('Pilih minimal satu produk/);
  assert.match(app,/for \(const entry of entries\) \{\s*createInventoryCycle/);
  assert.match(app,/closingQty > openingQty \+ stockInQty/);
});

test('P2 Sales exposes pending correction recovery without resurrecting voided source', () => {
  assert.match(app,/pendingCorrections/);
  assert.match(app,/koreksi manual belum memiliki replacement/);
  assert.match(app,/openManualSaleModal/);
});
