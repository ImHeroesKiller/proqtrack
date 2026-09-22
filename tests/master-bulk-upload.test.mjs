import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as server } from '../worker/bulk-master.js';
import { __test as client } from '../src/bulk-master.js';
import { normalizeRowsForSchema, parseDelimited } from '../src/lib/bulk-upload.js';
import { legacyMasterMigrationChanges } from '../src/lib/cloud-data.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function context() {
  const clientRow = { id:'CL-1', code:'CLIENT1', name:'Client One' };
  const projectRow = { id:'PRJ-1', code:'PROJECT1', name:'Project One', client_id:'CL-1' };
  const competitorRow = { id:'CMP-REAL', code:'COMP1', name:'Competitor One' };
  const outletRow = { id:'OUT-1', code:'OUT1', name:'Outlet One' };
  return {
    clients:[clientRow],
    projects:[projectRow],
    outlets:[outletRow],
    products:[],
    competitors:[competitorRow],
    competitorProducts:[],
    attendancePoints:[],
    clientByRef:new Map([
      ['cl-1',clientRow],['client1',clientRow],['client one',clientRow],
    ]),
    projectByRef:new Map([
      ['prj-1',projectRow],['project1',projectRow],['project one',projectRow],
    ]),
    outletByRef:new Map([
      ['out-1',outletRow],['out1',outletRow],['outlet one',outletRow],
    ]),
    competitorByRef:new Map([
      ['cmp-real',competitorRow],['comp1',competitorRow],['competitor one',competitorRow],
    ]),
    clientByCode:new Map([['client1',clientRow]]),
    projectByCode:new Map([['project1',projectRow]]),
    competitorByCode:new Map([['comp1',competitorRow]]),
    attendancePointByCode:new Map(),
  };
}

test('bulk master exposes all requested master schemas', () => {
  for (const entity of [
    'clients','projects','outlets','products',
    'competitors','competitorProducts','attendancePoints',
  ]) assert.ok(client.SCHEMAS[entity], entity);
  assert.equal(client.MAX_FILE_ROWS, 1000);
  assert.equal(server.MAX_PREVIEW_ROWS, 100);
  assert.equal(server.MAX_COMMIT_ROWS, 50);
});

test('generic CSV normalizer supports entity-specific aliases and required fields', () => {
  const matrix = parseDelimited('SKU,Name,Project,Brand\nSKU-1,Product A,PROJECT1,Brand A\n');
  const rows = normalizeRowsForSchema(matrix, client.SCHEMAS.products);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, 'SKU-1');
  assert.equal(rows[0].project_code, 'PROJECT1');
  assert.equal(rows[0]._row_number, 2);
});

test('product and outlet bulk rows resolve project scope authoritatively', () => {
  const ctx = context();
  const broad = { role:'head', projectIds:[] };
  const product = server.normalizeMaster('products', {
    sku:'SKU-1', name:'Product A', project_code:'PROJECT1', price:'12000',
  }, 0, ctx, broad);
  assert.equal(product.valid, true);
  assert.equal(product.canonical.clientId, 'CL-1');
  assert.deepEqual(product.canonical.projectIds, ['PRJ-1']);

  const outlet = server.normalizeMaster('outlets', {
    code:'OUT-X', name:'Outlet X', project_code:'PROJECT1', latitude:'999', longitude:'106.8',
  }, 0, ctx, broad);
  assert.equal(outlet.valid, false);
  assert.ok(outlet.errors.includes('LATITUDE_INVALID'));
});

test('manager may update scoped project but cannot create clients or new projects', () => {
  const ctx = context();
  const manager = { role:'manager', projectIds:['PRJ-1'] };
  const existing = server.normalizeMaster('projects', {
    code:'PROJECT1', name:'Updated Project', client_code:'CLIENT1', status:'on_hold',
  }, 0, ctx, manager);
  assert.equal(existing.valid, true);
  assert.equal(existing.action, 'update');
  assert.equal(existing.canonical.status, 'on_hold');

  const fresh = server.normalizeMaster('projects', {
    code:'PROJECT2', name:'New Project', client_code:'CLIENT1',
  }, 0, ctx, manager);
  assert.ok(fresh.errors.includes('PROJECT_CREATE_REQUIRES_ORG_ADMIN'));

  const client = server.normalizeMaster('clients', {
    code:'CLIENT2', name:'Client Two',
  }, 0, ctx, manager);
  assert.ok(client.errors.includes('CLIENT_BULK_REQUIRES_ORG_ADMIN'));
});

test('competitor product and attendance point references are resolved before commit', () => {
  const ctx = context();
  const head = { role:'head', projectIds:[] };
  const product = server.normalizeMaster('competitorProducts', {
    competitor_code:'COMP1', sku:'CP-1', name:'Competitor Product', typical_price:'9000',
  }, 0, ctx, head);
  assert.equal(product.valid, true);
  assert.equal(product.canonical.competitorId, 'CMP-REAL');

  const point = server.normalizeMaster('attendancePoints', {
    code:'APT-1', name:'Outlet meeting point', type:'store', outlet_code:'OUT1',
    latitude:'-6.2', longitude:'106.8', radius_m:'50',
  }, 0, ctx, head);
  assert.equal(point.valid, true);
  assert.equal(point.canonical.outletId, 'OUT-1');
});

test('client prospect and project lifecycle status survive D1 normalization contract', async () => {
  const [bulk, operations] = await Promise.all([
    read('worker/bulk-master.js'),
    read('worker/operations.js'),
  ]);
  assert.match(bulk, /'prospect'/);
  assert.equal(server.normalizeProjectStatus('hold'), 'on_hold');
  assert.equal(server.normalizeProjectStatus('completed'), 'completed');
  assert.match(operations, /uiStatus/);
  assert.match(operations, /meta\.uiStatus \|\| dbRow\.status/);
});

test('legacy master migration promotes custom rows only and excludes built-in demo seed', () => {
  const local = {
    competitors:[
      { id:'CMP001', organizationId:'ORG-X', name:'Demo' },
      { id:'CMP-CUSTOM', organizationId:'ORG-X', code:'CUSTOM', name:'Custom' },
      { id:'CMP-OTHER', organizationId:'ORG-Y', code:'OTHER', name:'Other tenant' },
    ],
    competitorProducts:[
      { id:'CPD001', organizationId:'ORG-X', competitorId:'CMP001', sku:'DEMO', name:'Demo' },
      { id:'CPD-CUSTOM', organizationId:'ORG-X', competitorId:'CMP-CUSTOM', sku:'C-1', name:'Custom Product' },
    ],
    attendancePoints:[
      { id:'APT-OFFICE', organizationId:'ORG-X', builtIn:true, name:'Office' },
      { id:'APT-CUSTOM', organizationId:'ORG-X', code:'APT-C', name:'Custom point', lat:-6.2, lng:106.8 },
    ],
  };
  const changes = legacyMasterMigrationChanges(local, { competitors:[], competitorProducts:[], attendancePoints:[], outlets:[] }, 'ORG-X');
  assert.deepEqual(changes.map(x=>x.entity).sort(), ['attendancePoints','competitorProducts','competitors']);
  assert.ok(!changes.some(x=>x.row.id === 'CMP001' || x.row.id === 'CPD001' || x.row.id === 'APT-OFFICE'));
});

test('master data cloud authority is wired through operations, health and migration', async () => {
  const [operations, cloud, migration, hardening, workflow] = await Promise.all([
    read('worker/operations.js'),
    read('src/lib/cloud-data.js'),
    read('migrations/0017_master_bulk_cloud_authority.sql'),
    read('worker/hardening.js'),
    read('.github/workflows/cloudflare-mvp.yml'),
  ]);
  for (const table of ['core_competitors','core_competitor_products','core_attendance_points']) {
    assert.match(operations, new RegExp(table));
    assert.match(migration, new RegExp(table));
  }
  for (const collection of ['competitors','competitorProducts','attendancePoints']) {
    assert.match(cloud, new RegExp("'" + collection + "'"));
  }
  assert.match(hardening, /core_competitors/);
  assert.match(workflow, /\/api\/bulk\/master\/preview/);
});

test('all master pages expose bulk upload and UI permissions match server roles', async () => {
  const [app, projectUi, settings] = await Promise.all([
    read('src/app.js'), read('src/types/index.js'), read('src/account-settings.js'),
  ]);
  assert.match(app, /BulkMaster\.open\('outlets'\)/);
  assert.match(app, /BulkMaster\.open\('products'\)/);
  assert.match(app, /BulkMaster\.open\('competitors'\)/);
  assert.match(app, /BulkMaster\.open\('competitorProducts'\)/);
  assert.match(projectUi, /BulkMaster\.open\('clients'\)/);
  assert.match(projectUi, /BulkMaster\.open\('projects'\)/);
  assert.match(settings, /BulkMaster\.open\('attendancePoints'\)/);
  assert.match(projectUi, /a\?\.role === "admin"/);
  assert.match(projectUi, /function canManageClients/);
  assert.match(projectUi, /function canCreateProject/);
});

test('PWA refreshes bulk master client generation', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12/);
  assert.match(sw, /\.\/src\/bulk-master\.js/);
});
