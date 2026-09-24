import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateInventoryCycleMutation } from '../worker/operations.js';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0025_stock_ledger_derived_sales.sql', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('../src/lib/cloud-data.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');

function envFactory({
  opening = 100,
  minStock = 5,
  productPrice = 10000,
  duplicateCycle = null,
  saleCollision = null,
  stockCollision = null,
  balances = null,
} = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (/core_project_outlets/.test(sql)) return { ok:1 };
                if (/core_project_products/.test(sql)) return { ok:1 };
                if (/JOIN core_employee_project_assignments/.test(sql)) return { id:'EMP-1' };
                if (/FROM core_visits/.test(sql)) return { id:'VIS-1' };
                if (/FROM core_inventory_cycles/.test(sql)) return duplicateCycle;
                if (/FROM core_products/.test(sql)) return { id:'PRD-1', metadata_json:JSON.stringify({ price:productPrice }) };
                if (/FROM core_product_sales/.test(sql)) return saleCollision;
                if (/FROM core_stocks/.test(sql) && /AND id=\?/.test(sql)) return stockCollision;
                return null;
              },
              async all() {
                if (/FROM core_stocks/.test(sql)) {
                  const rows = balances ?? (opening == null ? [] : [{id:'STK-1',quantity:opening,min_stock:minStock}]);
                  return { results:rows };
                }
                return { results:[] };
              },
            };
          },
        };
      },
    },
  };
}

function baseCycle(overrides = {}) {
  return {
    id:'IC-1',
    projectId:'PRJ-1',
    outletId:'OUT-1',
    productId:'PRD-1',
    employeeId:'EMP-1',
    cycleDate:'2026-09-25',
    status:'finalized',
    openingQty:100,
    stockInQty:50,
    adjustmentQty:0,
    returnQty:5,
    damagedQty:2,
    transferOutQty:3,
    closingQty:20,
    unitPrice:1,
    sellOutQty:999,
    salesAmount:999,
    ...overrides,
  };
}

test('P0 inventory cycle derives sell-out and price from authoritative state', async () => {
  const row = baseCycle();
  const result = await validateInventoryCycleMutation(envFactory(), 'ORG-1', row, null, { op:'upsert' });
  assert.equal(result, null);
  assert.equal(row.sellOutQty, 120);
  assert.equal(row.unitPrice, 10000);
  assert.equal(row.salesAmount, 1200000);
  assert.equal(row.saleId, 'SALE-CYCLE-IC-1');
  assert.equal(row.stockBalanceId, 'STK-1');
  assert.equal(row.finalizedAt ? true : false, true);
});

test('P0 inventory cycle rejects stale or forged opening stock', async () => {
  const row = baseCycle({ openingQty:90 });
  const result = await validateInventoryCycleMutation(envFactory({ opening:100 }), 'ORG-1', row, null, { op:'upsert' });
  assert.equal(result.error, 'INVENTORY_CYCLE_OPENING_MISMATCH');
  assert.equal(result.status, 409);
  assert.equal(result.authoritativeOpening, 100);
});

test('P0 inventory cycle rejects impossible closing balance', async () => {
  const row = baseCycle({ stockInQty:0, returnQty:0, damagedQty:0, transferOutQty:0, closingQty:101 });
  const result = await validateInventoryCycleMutation(envFactory(), 'ORG-1', row, null, { op:'upsert' });
  assert.equal(result.error, 'INVENTORY_CYCLE_CLOSING_EXCEEDS_AVAILABLE');
});

test('P0 finalized inventory cycle is immutable', async () => {
  const row = baseCycle();
  const result = await validateInventoryCycleMutation(
    envFactory(),
    'ORG-1',
    row,
    { id:'IC-1', status:'finalized', project_id:'PRJ-1', outlet_id:'OUT-1', product_id:'PRD-1', employee_id:'EMP-1', cycle_date:'2026-09-25' },
    { op:'upsert' },
  );
  assert.equal(result.error, 'INVENTORY_CYCLE_FINAL');
  assert.equal(result.status, 409);
});

test('P0 stock ledger schema preserves cycle uniqueness and derived-sale link', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS core_inventory_cycles/);
  assert.match(migration, /UNIQUE \(organization_id, project_id, outlet_id, product_id, cycle_date\)/);
  assert.match(migration, /sale_id TEXT/);
  assert.match(migration, /status TEXT NOT NULL DEFAULT 'draft' CHECK\(status IN \('draft','finalized'\)\)/);
});

test('P0 finalization writes current stock, derived sale, then links cycle in one batch', () => {
  const stockPos = worker.indexOf("INSERT INTO core_stocks(id,organization_id,project_id,outlet_id,product_id,quantity");
  const salePos = worker.indexOf("INSERT INTO core_product_sales(id,organization_id,project_id,outlet_id,employee_id,product_id,quantity");
  const linkPos = worker.indexOf("UPDATE core_inventory_cycles SET sale_id=?");
  assert.ok(stockPos > 0 && salePos > stockPos && linkPos > salePos);
  assert.match(worker, /inventoryCycleFinalizationStatements\(env, organizationId, row\)/);
  assert.match(worker, /provenance:'derived_stock'/);
  assert.match(worker, /provenance:'inventory_cycle'/);
});

test('P0 protects ledger-managed stock and derived sales from direct mutation', () => {
  assert.match(worker, /STOCK_LEDGER_MANAGED/);
  assert.match(worker, /DERIVED_SALE_IMMUTABLE/);
  assert.match(worker, /DERIVED_SALE_SERVER_ONLY/);
  assert.match(worker, /INVENTORY_CYCLE_DELETE_FORBIDDEN/);
});

test('P0 inventory cycles sync and hydrate through cloud/local schema', () => {
  assert.match(cloud, /'inventoryCycles'/);
  assert.match(db, /inventoryCycles: \[\]/);
  assert.match(db, /export function getInventoryCycles\(\)/);
  assert.match(db, /export function createInventoryCycle\(data = \{\}\)/);
  assert.match(worker, /inventoryCycles: 'core_inventory_cycles'/);
  assert.match(worker, /inventoryCycles: decodeRows\('inventoryCycles', inventoryCycles\)/);
});
