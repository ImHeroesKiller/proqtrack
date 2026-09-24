import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  stockSalesFriendlyErrorMessage,
  inventoryCycleOnDate,
  commonProjectIds,
  stockSummary,
  stockFilterSnapshot,
  stockMatchesFilters,
  salesSummary,
  salesFilterSnapshot,
  salesMatchesFilters,
  pendingManualCorrections,
  validateStockMovementInput,
} from '../src/lib/stock-sales-ui.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('P3 stock-sales helpers keep project intersection deterministic', () => {
  assert.deepEqual(commonProjectIds({projectIds:['P1','P2']},{projectIds:['P2','P3','P2']}),['P2']);
});

test('P3 stock summary is pure and numeric-safe', () => {
  assert.deepEqual(stockSummary([
    {quantity:0,minStock:5},{quantity:3,minStock:5},{quantity:8,minStock:5},
  ]),{total:3,low:2,empty:1});
});

test('P3 stock filters are normalized and testable outside DOM', () => {
  const filters=stockFilterSnapshot({search:'  outlet a ',projectId:'P1',outletId:'O1',status:'low'});
  assert.equal(stockMatchesFilters({search:'Outlet A Product X',projectId:'P1',outletId:'O1',status:'low'},filters),true);
  assert.equal(stockMatchesFilters({search:'Outlet B',projectId:'P1',outletId:'O1',status:'low'},filters),false);
});

test('P3 sales summary preserves derived/manual accounting', () => {
  assert.deepEqual(salesSummary([
    {quantity:2,totalAmount:100,provenance:'derived_stock'},
    {qty:1,amount:50,provenance:'manual_override'},
  ]),{transactions:2,quantity:3,amount:150,manual:1});
});

test('P3 sales filters are pure and period-aware', () => {
  const filters=salesFilterSnapshot({search:'sku-1',source:'derived',from:'2026-09-01',to:'2026-09-30'});
  assert.equal(salesMatchesFilters({search:'Outlet SKU-1',source:'derived',date:'2026-09-25'},filters),true);
  assert.equal(salesMatchesFilters({search:'Outlet SKU-1',source:'manual',date:'2026-09-25'},filters),false);
});

test('P3 pending correction recovery excludes completed replacement chains', () => {
  const rows=[
    {id:'S1',lifecycleStatus:'voided',provenance:'manual_override'},
    {id:'S2',lifecycleStatus:'voided',provenance:'manual_override'},
    {id:'S3',lifecycleStatus:'active',provenance:'manual_override',correctionOfSaleId:'S2'},
  ];
  assert.deepEqual(pendingManualCorrections(rows).map(row=>row.id),['S1']);
});

test('P3 stock movement validator returns canonical values and sell-out', () => {
  assert.deepEqual(validateStockMovementInput({openingQty:'10',stockInQty:'5',closingQty:'9',minStock:'3'}),{
    ok:true,openingQty:10,stockInQty:5,closingQty:9,minStock:3,available:15,sellOutQty:6,
  });
  assert.deepEqual(validateStockMovementInput({openingQty:10,stockInQty:1,closingQty:12,minStock:3}),{
    ok:false,error:'STOCK_CLOSING_EXCEEDS_AVAILABLE',available:11,
  });
});

test('P3 inventory cycle lookup is scope exact', () => {
  const cycles=[{id:'C1',projectId:'P1',outletId:'O1',productId:'SKU1',cycleDate:'2026-09-25'}];
  assert.equal(inventoryCycleOnDate(cycles,'P1','O1','SKU1','2026-09-25')?.id,'C1');
  assert.equal(inventoryCycleOnDate(cycles,'P2','O1','SKU1','2026-09-25'),null);
});

test('P3 friendly errors retain domain-specific operator guidance', () => {
  assert.match(stockSalesFriendlyErrorMessage({code:'REVISION_CONFLICT'}),/Data cloud berubah/);
});

test('P3 app delegates stock-sales domain logic and mutation lifecycle', () => {
  assert.match(app,/from '\.\/lib\/stock-sales-ui\.js'/);
  assert.match(app,/async function runStockSalesMutation/);
  assert.match(app,/runStockSalesMutation\(\(\) => createProductSale/);
  assert.match(app,/runStockSalesMutation\(\(\) => createInventoryCycle/);
  assert.doesNotMatch(app,/function stockSalesFriendlyError\(/);
  assert.doesNotMatch(app,/function stockProjectFor\(/);
});
