import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { outletOperationalModel } from '../src/lib/outlet-ui.js';
import { productOperationalModel } from '../src/lib/product-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P0 refresh short-circuits unchanged revisions before loading bootstrap data', async () => {
  const [worker, cloud] = await Promise.all([
    read('worker/operations.js'),
    read('src/lib/cloud-data.js'),
  ]);
  const start = worker.indexOf('async function handleBootstrap');
  const end = worker.indexOf('async function handleImport', start);
  const body = worker.slice(start, end);
  assert.match(body, /requestedRevision === revision/);
  assert.match(body, /notModified:true/);
  assert.ok(body.indexOf('notModified:true') < body.indexOf('bootstrapData\(env, claims\)'));
  assert.match(cloud, /\/api\/core\/bootstrap\?revision=/);
  assert.match(cloud, /remote\.notModified === true/);
  assert.match(cloud, /reason:'not-modified'/);
});

test('P0 non-broad bootstrap queries are scoped before decode', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /rowsByProjectEmployee/);
  assert.match(worker, /rowsWhereIn\(env,'core_projects'/);
  assert.match(worker, /rowsWhereIn\(env,'core_outlets'/);
  assert.match(worker, /rowsWhereIn\(env,'core_products'/);
  assert.match(worker, /core_outlet_proposals'.*'submitted_by'/s);
  assert.match(worker, /role === 'employee'.*ownEmployeeId/s);
  assert.match(worker, /role === 'manager'.*a\.project_id IN/s);
  assert.match(worker, /role === 'supervisor'.*supervisor_user_id/s);
});

test('P0 large master pages render only active page rows into DOM', async () => {
  const app = await read('src/app.js');
  for (const marker of [
    'visitRowsCache',
    'employeeRowsCache',
    'outletRowsCache',
    'productRowsCache',
    "tbody.innerHTML = pageState.items.map(row => row.html).join('')",
  ]) assert.ok(app.includes(marker), marker);
  assert.match(app, /paginateVisits\(visitRowsCache/);
  assert.match(app, /paginateEmployees\(employeeRowsCache/);
  assert.match(app, /paginateOutlets\(outletRowsCache/);
  assert.match(app, /paginateProducts\(productRowsCache/);
});

test('P0 removes periodic full local DB parsing from offline observer', async () => {
  const [db, offline] = await Promise.all([
    read('src/lib/db.js'),
    read('src/lib/offline-engine.js'),
  ]);
  assert.match(db, /proqtrack:db-persisted/);
  assert.match(db, /scheduleLegacyMirror/);
  assert.match(db, /requestIdleCallback/);
  assert.match(offline, /proqtrack:db-persisted/);
  assert.doesNotMatch(offline, /setInterval\(observeLocalCache,\s*5000\)/);
});

test('P0 PWA cache is atomic and content versioned', async () => {
  const [sw, build] = await Promise.all([
    read('sw.js'),
    read('scripts/build.mjs'),
  ]);
  assert.match(sw, /const RELEASE = '__PROQTRACK_RELEASE__'/);
  assert.match(sw, /const CACHE = `proqtrack-shell-\$\{RELEASE\}`/);
  assert.match(sw, /const cached = await cache\.match\('\.\/index\.html'\)/);
  assert.doesNotMatch(sw, /cache\.put\('\.\/index\.html'/);
  assert.match(build, /createHash\("sha256"\)/);
  assert.match(build, /precache-manifest\.json/);
  assert.match(build, /replaceAll\("__PROQTRACK_RELEASE__", release\)/);
});

test('P0 outlet and product helpers reuse precomputed indexes', () => {
  const projectMap = new Map([['P1',{id:'P1',code:'P1',name:'Project',clientId:'C1'}]]);
  const clientMap = new Map([['C1',{id:'C1',name:'Client'}]]);
  const visitStats = new Map([['O1',{count:250,lastVisitDate:'2026-09-25'}]]);
  const outlet = outletOperationalModel(
    {id:'O1',name:'Outlet',clientId:'C1',projectIds:['P1']},
    {projectMap,clientMap,visitStats},
  );
  assert.equal(outlet.visitCount,250);
  assert.equal(outlet.lastVisitDate,'2026-09-25');

  const product = productOperationalModel(
    {id:'PR1',name:'Product',clientId:'C1',projectIds:['P1']},
    {projectMap,clientMap},
  );
  assert.equal(product.projectLabel,'P1');
  assert.equal(product.clientLabel,'Client');
});
