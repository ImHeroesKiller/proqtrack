import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OUTLET_PAGE_SIZE,
  outletOperationalModel,
  outletFilterOptions,
  outletMatchesFilters,
  outletFilterSnapshot,
  paginateOutlets,
} from '../src/lib/outlet-ui.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const fieldSales = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');

test('Outlets P2 builds operational context for project, client and visits', () => {
  const model = outletOperationalModel(
    { id:'OUT-1', name:'Toko A', code:'OA', clientId:'CL-1', projectIds:['PRJ-1','PRJ-2'], type:'GT', area:'Jakarta' },
    {
      projects:[{id:'PRJ-1',code:'P1',name:'Alpha',clientId:'CL-1'},{id:'PRJ-2',code:'P2',name:'Beta',clientId:'CL-1'}],
      clients:[{id:'CL-1',name:'Client A'}],
      visits:[{outletId:'OUT-1',date:'2026-09-20'},{outletId:'OUT-1',date:'2026-09-24'}],
    },
  );
  assert.equal(model.shared,true);
  assert.equal(model.visitCount,2);
  assert.equal(model.lastVisitDate,'2026-09-24');
  assert.equal(model.projectLabel,'P1, P2');
  assert.equal(model.clientLabel,'Client A');
  assert.match(model.search,/toko a/);
});

test('Outlets P2 derives filters from actual outlet data', () => {
  const opts = outletFilterOptions(
    [
      {type:'Custom B',area:'Bogor',clientId:'CL-1',projectIds:['PRJ-1']},
      {type:'Custom A',area:'Jakarta',clientId:'CL-2',projectIds:['PRJ-2']},
    ],
    {
      projects:[{id:'PRJ-1',name:'One'},{id:'PRJ-2',name:'Two'},{id:'PRJ-3',name:'Unused'}],
      clients:[{id:'CL-1',name:'A'},{id:'CL-2',name:'B'},{id:'CL-3',name:'Unused'}],
    },
  );
  assert.deepEqual(opts.types,['Custom A','Custom B']);
  assert.deepEqual(opts.areas,['Bogor','Jakarta']);
  assert.deepEqual(opts.projects.map(row=>row.id),['PRJ-1','PRJ-2']);
  assert.deepEqual(opts.clients.map(row=>row.id),['CL-1','CL-2']);
});

test('Outlets P2 supports combined filters and pagination', () => {
  const model = { search:'toko alpha jakarta p1 client', projectIds:['PRJ-1'], clientId:'CL-1', outlet:{type:'GT',area:'Jakarta',status:'active'} };
  assert.equal(outletMatchesFilters(model,{search:'alpha',projectId:'PRJ-1',clientId:'CL-1',type:'GT',area:'Jakarta',status:'active'}),true);
  assert.equal(outletMatchesFilters(model,{projectId:'PRJ-2'}),false);
  assert.deepEqual(outletFilterSnapshot({search:' x ',status:'active'}),{search:'x',type:'',area:'',status:'active',projectId:'',clientId:''});
  const rows=Array.from({length:OUTLET_PAGE_SIZE+3},(_,i)=>i);
  const page=paginateOutlets(rows,2,OUTLET_PAGE_SIZE);
  assert.equal(page.total,OUTLET_PAGE_SIZE+3);
  assert.equal(page.items.length,3);
  assert.equal(page.currentPage,2);
});

test('Outlets P2 wires operational filters refresh pagination and edit parity', () => {
  for (const marker of [
    'outletProjectFilter','outletClientFilter','outletStatusFilter','outletAreaFilter',
    'outletResultSummary','outletPager','FT.refreshOutlets','Shared outlet',
    'getProjectStoreSettings(projectId)',"outletNotesField(cat,model.notes)",
    'id="outletPickMap"','FT.syncManagerOutletCatalog(this.value)',
  ]) assert.ok(app.includes(marker), marker);
  assert.match(fieldSales,/const currentPair = validCoordinatePair\(/);
  assert.match(fieldSales,/const hasCurrent = Boolean\(currentPair\)/);
  assert.match(fieldSales,/Lokasi outlet saat ini/);
});
