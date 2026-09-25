import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  productAvailableProjects,
  productFormModel,
  normalizeProductFormPayload,
  productStatusSummary,
  productLifecycleAction,
} from '../src/lib/product-ui.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Products P3 centralizes project availability by actor scope', () => {
  const projects = [
    { id:'P1', status:'active' },
    { id:'P2', status:'planning' },
    { id:'P3', status:'completed' },
  ];
  assert.deepEqual(
    productAvailableProjects(projects,{projectIds:['P1']},false).map(p=>p.id),
    ['P1'],
  );
  assert.deepEqual(
    productAvailableProjects(projects,{projectIds:['P1']},true).map(p=>p.id),
    ['P1','P2'],
  );
});

test('Products P3 form model preserves scoped legacy project relationships', () => {
  const model = productFormModel(
    { id:'PRD-1', name:'A', projectIds:['P1','P3'], status:'active' },
    {
      projects:[
        {id:'P1',status:'active',clientId:'C1',code:'P1',name:'Active'},
        {id:'P3',status:'completed',clientId:'C1',code:'P3',name:'Legacy'},
      ],
      clients:[{id:'C1',name:'Client A'}],
      actor:{projectIds:['P1','P3']},
      isOrgAdmin:false,
    },
  );
  assert.deepEqual(model.projectOptions.map(x=>x.id),['P1','P3']);
  assert.equal(model.projectOptions.find(x=>x.id==='P3')?.selected,true);
  assert.match(model.projectOptions.find(x=>x.id==='P3')?.label || '',/existing/);
});

test('Products P3 form model does not expose foreign legacy project to manager', () => {
  const model = productFormModel(
    { id:'PRD-1', projectIds:['P1','FOREIGN'] },
    {
      projects:[
        {id:'P1',status:'active',clientId:'C1'},
        {id:'FOREIGN',status:'completed',clientId:'C1'},
      ],
      clients:[{id:'C1',name:'Client A'}],
      actor:{projectIds:['P1']},
      isOrgAdmin:false,
    },
  );
  assert.deepEqual(model.projectOptions.map(x=>x.id),['P1']);
});

test('Products P3 normalizes multi-project form payload deterministically', () => {
  assert.deepEqual(
    normalizeProductFormPayload({name:'A',projectId:'legacy'},['P2','P1','P2','']),
    {name:'A',projectIds:['P2','P1']},
  );
});

test('Products P3 centralizes KPI and lifecycle presentation', () => {
  assert.deepEqual(productStatusSummary([
    {status:'active',brand:'A'},
    {status:'inactive',brand:'A'},
    {status:'archived',brand:'B'},
  ]), {total:3,active:1,inactive:1,archived:1,brands:2});

  assert.deepEqual(productLifecycleAction({status:'active'},0),{
    action:'delete',
    label:'Hapus',
    confirm:'Hapus produk ini? Tindakan ini hanya berlaku jika produk belum memiliki histori operasional.',
  });
  const used = productLifecycleAction({status:'active'},4);
  assert.equal(used.action,'deactivate');
  assert.equal(used.label,'Nonaktifkan');
  assert.match(used.confirm,/4 data operasional/);
});

test('Products P3 page consumes centralized form lifecycle and status models', () => {
  assert.match(app,/productFormModel\(p\|\|\{\},\{/);
  assert.match(app,/normalizeProductFormPayload\(Object\.fromEntries\(fd\),fd\.getAll\('projectIds'\)\)/);
  assert.match(app,/productStatusSummary\(products\)/);
  assert.match(app,/productLifecycleAction\(p, referenceCounts\.get\(String\(p\.id\)\) \|\| 0\)/);
  assert.doesNotMatch(app,/function productAvailableProjects\(\)/);
});

test('Products P3 keeps product helper in PWA precache', () => {
  assert.match(sw,/\.\/src\/lib\/product-ui\.js/);
});
