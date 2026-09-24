import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRODUCT_PAGE_SIZE,
  productOperationalModel,
  productFilterOptions,
  productFilterSnapshot,
  productMatchesFilters,
  paginateProducts,
  productSyncPresentation,
} from '../src/lib/product-ui.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Products P2 builds project/client operational context', () => {
  const model = productOperationalModel(
    { id:'PRD-1', sku:'SKU-1', name:'Produk A', brand:'Brand X', category:'Snack', unit:'pcs', clientId:'CL-1', projectIds:['PRJ-1','PRJ-2'] },
    {
      projects:[
        {id:'PRJ-1',code:'P1',name:'Alpha',clientId:'CL-1'},
        {id:'PRJ-2',code:'P2',name:'Beta',clientId:'CL-1'},
      ],
      clients:[{id:'CL-1',name:'Client A'}],
    },
  );
  assert.equal(model.shared,true);
  assert.equal(model.projectLabel,'P1, P2');
  assert.equal(model.clientLabel,'Client A');
  assert.match(model.search,/produk a/);
  assert.match(model.search,/client a/);
});

test('Products P2 derives filters from actual visible product data', () => {
  const options = productFilterOptions(
    [
      {id:'1',brand:'B',category:'Z',clientId:'CL-1',projectIds:['PRJ-1']},
      {id:'2',brand:'A',category:'A',clientId:'CL-2',projectIds:['PRJ-2']},
    ],
    {
      projects:[{id:'PRJ-1'},{id:'PRJ-2'},{id:'PRJ-3'}],
      clients:[{id:'CL-1'},{id:'CL-2'},{id:'CL-3'}],
    },
  );
  assert.deepEqual(options.brands,['A','B']);
  assert.deepEqual(options.categories,['A','Z']);
  assert.deepEqual(options.projects.map(row=>row.id),['PRJ-1','PRJ-2']);
  assert.deepEqual(options.clients.map(row=>row.id),['CL-1','CL-2']);
});

test('Products P2 combines filters and pagination deterministically', () => {
  const model = {
    search:'sku-1 produk a brand x snack pcs p1 client a',
    projectIds:['PRJ-1'],
    clientId:'CL-1',
    product:{category:'Snack',brand:'Brand X',status:'active'},
  };
  assert.equal(productMatchesFilters(model,{
    search:'produk a',projectId:'PRJ-1',clientId:'CL-1',category:'Snack',brand:'Brand X',status:'active'
  }),true);
  assert.equal(productMatchesFilters(model,{projectId:'PRJ-2'}),false);
  assert.deepEqual(productFilterSnapshot({search:' A ',status:'active'}),{
    search:'a',projectId:'',clientId:'',category:'',brand:'',status:'active'
  });
  const rows=Array.from({length:PRODUCT_PAGE_SIZE+2},(_,i)=>i);
  const page=paginateProducts(rows,2,PRODUCT_PAGE_SIZE);
  assert.equal(page.items.length,2);
  assert.equal(page.from,PRODUCT_PAGE_SIZE+1);
  assert.equal(page.to,PRODUCT_PAGE_SIZE+2);
});

test('Products P2 exposes sync state presentation', () => {
  assert.deepEqual(productSyncPresentation({error:'FAIL'}),{label:'Sync bermasalah',className:'status-inactive'});
  assert.deepEqual(productSyncPresentation({queued:true}),{label:'Sinkronisasi…',className:'status-pending'});
  assert.deepEqual(productSyncPresentation({}),{label:'Cloud synced',className:'status-active'});
});

test('Products P2 page wires filters, pagination, refresh and shared context', () => {
  for (const marker of [
    'productProjectFilter','productClientFilter','productResultSummary','productPager',
    'FT.refreshProducts','Shared product','productSyncState','FT.resetProductFilters',
    'Menampilkan ${state.from}–${state.to} dari ${state.total} produk',
  ]) assert.ok(app.includes(marker),marker);
});

test('Products P2 edit form preserves multi-project relationships explicitly', () => {
  assert.match(app,/name="projectIds" multiple/);
  assert.match(app,/fd\.getAll\('projectIds'\)/);
  assert.match(app,/Bisa memilih beberapa project, tetapi seluruh project harus berasal dari client yang sama/);
  assert.match(app,/option\.selected\?'selected':''/);
});

test('Products P2 helper is available to PWA runtime', () => {
  assert.match(sw,/\.\/src\/lib\/product-ui\.js/);
});
