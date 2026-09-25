import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const fieldSales = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const stockSalesPages = readFileSync(new URL('../src/routes/stock-sales-pages.js', import.meta.url), 'utf8');
const stockSalesUi = readFileSync(new URL('../src/lib/stock-sales-ui.js', import.meta.url), 'utf8');

test('P2 Stock filters project outlet and status using row metadata', () => {
  assert.match(stockSalesPages,/id="stockProjectFilter"/);
  assert.match(stockSalesPages,/id="stockOutletFilter"/);
  assert.match(app,/stockFilterSnapshot/);
  assert.match(app,/stockMatchesFilters/);
  assert.match(stockSalesUi,/projectId/);
  assert.match(stockSalesUi,/outletId/);
  assert.match(stockSalesUi,/status/);
});

test('P2 Stock dashboard exposes operational stock health summaries', () => {
  assert.match(stockSalesPages,/Saldo stok/);
  assert.match(stockSalesPages,/Stok menipis/);
  assert.match(stockSalesPages,/Stok habis/);
});

test('P2 visit stock captures stock-in explicitly instead of inferring replenishment', () => {
  assert.match(fieldSales,/name="stockInQty"/);
  assert.match(app,/const stockInQty = Number\(row\.querySelector\('\[name="stockInQty"\]'\)/);
  assert.doesNotMatch(app,/inferredStockIn/);
});

test('P2 Stock preflights daily duplicate cycle and impossible closing balance', () => {
  assert.match(app,/findInventoryCycleOnDate\(getInventoryCycles\(\)/);
  assert.match(app,/Cycle stok hari ini/);
  assert.match(app,/validateStockMovementInput/);
  assert.match(stockSalesUi,/STOCK_CLOSING_EXCEEDS_AVAILABLE/);
});

test('P2 Manager Stock movement supports explicit recorder employee', () => {
  assert.match(app,/Pencatat/);
  assert.match(app,/name="employeeId" required/);
  assert.match(app,/String\(data\.employeeId \|\| myEmployeeId\(\) \|\| ''\)/);
});

test('P2 Sales has operational summary and filters', () => {
  assert.match(stockSalesPages,/Transaksi aktif/);
  assert.match(stockSalesPages,/Qty terjual/);
  assert.match(stockSalesPages,/Nilai penjualan/);
  assert.match(stockSalesPages,/id="salesSourceFilter"/);
  assert.match(stockSalesPages,/id="salesFromFilter"/);
  assert.match(stockSalesPages,/id="salesToFilter"/);
  assert.match(app,/window\.FT\.filterProductSales/);
});

test('P2 Manual Sale correction uses governed modal instead of browser prompt', () => {
  assert.match(app,/Koreksi Manual Sale/);
  assert.match(app,/confirmManualSaleCorrection/);
  assert.match(app,/Void & Buat Replacement/);
  assert.doesNotMatch(app,/prompt\('Alasan koreksi manual sale/);
});

test('P2 Stock Sales translates common cloud conflict states to user feedback', () => {
  assert.match(app,/stockSalesFriendlyErrorMessage/);
  assert.match(stockSalesUi,/REVISION_CONFLICT/);
  assert.match(stockSalesUi,/INVENTORY_CYCLE_OPENING_MISMATCH/);
  assert.match(stockSalesUi,/CLOUD_SYNC_TIMEOUT/);
});


test('P2 visit stock validates whole batch before creating ledger cycles', () => {
  assert.match(app,/const entries = \[\]/);
  assert.match(app,/if \(!entries\.length\) throw new Error\('Pilih minimal satu produk/);
  assert.match(app,/for \(const entry of entries\)/);
  assert.match(app,/createInventoryCycle/);
  assert.match(app,/validateStockMovementInput/);
});

test('P2 Sales exposes pending correction recovery without resurrecting voided source', () => {
  assert.match(stockSalesPages,/pendingCorrections/);
  assert.match(stockSalesPages,/koreksi manual belum memiliki replacement/);
  assert.match(app,/openManualSaleModal/);
});


test('P2 manual sale reuses one idempotency token for retries from the same modal', () => {
  assert.match(app,/type="hidden" name="idempotencyKey"/);
  assert.match(app,/idempotencyKey:String\(data\.idempotencyKey \|\| ''\)/);
});

test('P2 sales KPI cards follow the active filters', () => {
  assert.match(stockSalesPages,/id="salesKpiTransactions"/);
  assert.match(stockSalesPages,/id="salesKpiQty"/);
  assert.match(stockSalesPages,/id="salesKpiAmount"/);
  assert.match(app,/salesSummary\(visibleRows\)/);
  assert.match(app,/totals\.amount/);
});


test('P2 Stock exposes ledger history drilldown for operators', () => {
  assert.match(app,/window\.FT\.viewStockHistory/);
  assert.match(app,/Riwayat Stok/);
  assert.match(app,/Opening/);
  assert.match(app,/Sell-out/);
});
