import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateInventoryCycleMutation,
  validateProductSaleAuthorityMutation,
} from '../worker/operations.js';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../worker/reports.js', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../worker/analytics.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0026_stock_sales_p1_hardening.sql', import.meta.url), 'utf8');

function saleEnv({ duplicateKey=null, correctionSource=null }={}) {
  return {
    DB:{
      prepare(sql){
        return {
          bind(){
            return {
              async first(){
                if (/core_project_outlets/.test(sql)) return { ok:1 };
                if (/core_project_products/.test(sql)) return { ok:1 };
                if (/JOIN core_employee_project_assignments/.test(sql)) return { id:'EMP-1' };
                if (/idempotency_key/.test(sql)) return duplicateKey;
                if (/FROM core_product_sales/.test(sql) && /id=\?/.test(sql)) return correctionSource;
                return null;
              },
            };
          },
        };
      },
    },
  };
}

function manualSale(overrides={}) {
  return {
    id:'SALE-MANUAL-1',
    projectId:'PRJ-1',
    outletId:'OUT-1',
    employeeId:'EMP-1',
    productId:'PRD-1',
    quantity:2,
    unitPrice:10000,
    soldAt:'2026-09-25T10:00:00+07:00',
    idempotencyKey:'manual-sale:1',
    manualReason:'Koreksi transaksi khusus outlet',
    ...overrides,
  };
}

test('P1 manual sale requires manager/admin governance', async () => {
  const denied = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'employee', sub:'USR-1' },null,manualSale(),'upsert'
  );
  assert.equal(denied.error,'MANUAL_SALE_GOVERNANCE_REQUIRED');

  const row = manualSale();
  const ok = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },null,row,'upsert'
  );
  assert.equal(ok,null);
  assert.equal(row.provenance,'manual_override');
  assert.equal(row.lifecycleStatus,'active');
  assert.equal(row.totalAmount,20000);
  assert.equal(row.createdBy,'USR-MGR');
});

test('P1 manual sale requires reason and idempotency', async () => {
  const reason = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },null,manualSale({manualReason:'pendek'}),'upsert'
  );
  assert.equal(reason.error,'MANUAL_SALE_REASON_REQUIRED');

  const idem = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },null,manualSale({idempotencyKey:''}),'upsert'
  );
  assert.equal(idem.error,'MANUAL_SALE_IDEMPOTENCY_REQUIRED');
});

test('P1 derived sale remains immutable and manual correction is void-not-delete', async () => {
  const derived = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },
    { id:'SALE-CYCLE-1', metadata_json:JSON.stringify({provenance:'derived_stock'}) },
    {},'upsert'
  );
  assert.equal(derived.error,'DERIVED_SALE_IMMUTABLE');

  const existing = {
    id:'SALE-MANUAL-OLD',project_id:'PRJ-1',outlet_id:'OUT-1',employee_id:'EMP-1',product_id:'PRD-1',
    quantity:2,unit_price:10000,total_amount:20000,sold_at:'2026-09-24T03:00:00.000Z',
    idempotency_key:'manual-sale:old',
    metadata_json:JSON.stringify({provenance:'manual_override',lifecycleStatus:'active',manualReason:'Input manual sebelumnya'}),
  };
  const row = { id:existing.id, lifecycleStatus:'voided', correctionReason:'Nominal salah dan harus diganti' };
  const ok = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },existing,row,'upsert'
  );
  assert.equal(ok,null);
  assert.equal(row.lifecycleStatus,'voided');
  assert.equal(row.quantity,2);
  assert.equal(row.voidedBy,'USR-MGR');

  const deleted = await validateProductSaleAuthorityMutation(
    saleEnv(),'ORG-1',{ role:'manager', sub:'USR-MGR' },existing,{},'delete'
  );
  assert.equal(deleted.error,'MANUAL_SALE_DELETE_FORBIDDEN');
});

function cycleEnv({ sourceCycle=null }={}) {
  return {
    DB:{
      prepare(sql){
        return {
          bind(){
            return {
              async first(){
                if (/core_project_outlets/.test(sql)) return { ok:1 };
                if (/core_project_products/.test(sql)) return { ok:1 };
                if (/JOIN core_employee_project_assignments/.test(sql)) return { id:'EMP-1' };
                if (/FROM core_inventory_cycles/.test(sql) && /AND id=\? LIMIT 1/.test(sql)) return sourceCycle;
                if (/FROM core_inventory_cycles/.test(sql)) return null;
                if (/FROM core_products/.test(sql)) return { id:'PRD-1', metadata_json:JSON.stringify({price:10000}) };
                if (/FROM core_product_sales/.test(sql)) return null;
                return null;
              },
              async all(){
                if (/FROM core_stocks/.test(sql)) return { results:[{id:'STK-1',quantity:100,min_stock:5}] };
                return { results:[] };
              },
            };
          },
        };
      },
    },
  };
}

function cycle(overrides={}) {
  return {
    id:'IC-P1-1',projectId:'PRJ-1',outletId:'OUT-1',productId:'PRD-1',employeeId:'EMP-1',
    cycleDate:'2026-09-25',status:'draft',openingQty:100,stockInQty:0,adjustmentQty:0,
    returnQty:0,damagedQty:0,transferOutQty:0,closingQty:100,...overrides,
  };
}

test('P1 stock adjustment requires an auditable reason', async () => {
  const row = cycle({ adjustmentQty:5, closingQty:105 });
  const result = await validateInventoryCycleMutation(cycleEnv(),'ORG-1',row,null,{op:'upsert',claims:{role:'manager',sub:'USR-MGR'}});
  assert.equal(result.error,'INVENTORY_CYCLE_ADJUSTMENT_REASON_REQUIRED');
});

test('P1 correction cycle must reference finalized cycle in same scope', async () => {
  const row = cycle({
    adjustmentQty:-5,closingQty:95,
    adjustmentReason:'Koreksi salah hitung closing sebelumnya',
    correctionOfCycleId:'IC-OLD',
  });
  const ok = await validateInventoryCycleMutation(cycleEnv({
    sourceCycle:{
      id:'IC-OLD',status:'finalized',project_id:'PRJ-1',outlet_id:'OUT-1',product_id:'PRD-1',
      opening_qty:100,stock_in_qty:0,adjustment_qty:0,return_qty:0,damaged_qty:0,transfer_out_qty:0,
      closing_qty:100,sell_out_qty:0,unit_price:10000,sales_amount:0,sale_id:null,
    }
  }),'ORG-1',row,null,{op:'upsert',claims:{role:'manager',sub:'USR-MGR'}});
  assert.equal(ok,null);
  assert.equal(row.correctionOfCycleId,'IC-OLD');
  assert.equal(row.sellOutQty,5);
});

test('P1 migration removes duplicate legacy stock before unique authority index', () => {
  assert.match(migration,/ROW_NUMBER\(\) OVER/);
  assert.match(migration,/duplicate_rank > 1/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS uq_core_stocks_authoritative_balance/);
  assert.match(migration,/manual_legacy/);
});

test('P1 sync authority blocks direct stock and reporting excludes voided manual sales', () => {
  assert.match(worker,/STOCK_DIRECT_MUTATION_DISABLED/);
  assert.match(db,/Stok adalah read-model dari Inventory Cycle/);
  assert.match(db,/Penjualan tidak dapat dihapus\. Gunakan correction\/void/);
  assert.match(reports,/lifecycleStatus.*voided/);
  assert.match(analytics,/lifecycleStatus.*voided/);
});


test('P1 zero sell-out finalization does not create a fake sales transaction', async () => {
  const row = cycle({ status:'finalized', closingQty:100 });
  const result = await validateInventoryCycleMutation(cycleEnv(),'ORG-1',row,null,{op:'upsert'});
  assert.equal(result,null);
  assert.equal(row.sellOutQty,0);
  assert.equal(row.saleId,null);
  assert.match(worker,/if \(row\.saleId && Number\(row\.sellOutQty\) > 0\)/);
});

test('P1 monthly sales KPI accepts cloud-hydrated soldAt/totalAmount fields', () => {
  assert.match(db,/s\.soldAt \|\| s\.date/);
  assert.match(db,/s\.totalAmount \?\? s\.amount/);
});


test('P1 employee cannot forge stock adjustment/correction', async () => {
  const row = cycle({ adjustmentQty:5, closingQty:105, adjustmentReason:'Koreksi saldo manual outlet' });
  const result = await validateInventoryCycleMutation(
    cycleEnv(),'ORG-1',row,null,{op:'upsert',claims:{role:'employee',sub:'USR-EMP'}}
  );
  assert.equal(result.error,'INVENTORY_CYCLE_ADJUSTMENT_FORBIDDEN');
  assert.equal(result.status,403);
});

test('P1 frontend stock write paths use inventory cycle and rehydrate cloud authority', () => {
  assert.match(app,/createInventoryCycle\(/);
  assert.match(app,/await waitForOperationalSync\(\)/);
  assert.match(app,/await refreshOperationalData\(getDB\(\), getActor\(\)\)/);
  assert.doesNotMatch(app,/\bcreateStock\(data\)/);
  assert.doesNotMatch(app,/\bupdateStock\(existing\.id/);
  assert.doesNotMatch(app,/\bdeleteStock\(id\)/);
});


test('P1 Product Sales routes have an active renderer and governed correction UI', () => {
  assert.match(app,/function renderProductSales\(/);
  assert.match(app,/Manual sale hanya untuk Manager\/Admin/);
  assert.match(app,/voidProductSale\(id,reason\)/);
  assert.match(db,/export function voidProductSale\(/);
  assert.match(app,/Replacement Manual Sale/);
});


test('P1 stock and manual sales require explicit valid project scope in shared catalogs', () => {
  assert.match(app,/function stockCommonProjectIds\(/);
  assert.match(app,/name="projectId" required/);
  assert.match(app,/Project tidak sesuai dengan relasi outlet dan produk/);
});
