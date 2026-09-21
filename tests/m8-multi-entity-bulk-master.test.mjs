import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as bulk } from '../worker/bulk-master.js';
import { normalizeMasterRows, masterTemplateCsv, MASTER_ENTITIES } from '../src/lib/bulk-master-upload.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('M8 migration adds cloud competitor authority and generic bulk audit', async () => {
  const sql = await read('migrations/0017_multi_entity_bulk_master.sql');
  for (const table of [
    'core_competitors','core_competitor_products','core_competitor_intel',
    'core_bulk_master_runs','core_bulk_master_chunks',
  ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /UNIQUE \(organization_id, competitor_id, sku\)/);
  assert.match(sql, /REFERENCES core_competitors\(id, organization_id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /password_hash|initial_password|plaintext/i);
});

test('master bulk supports intended entities and excludes transactional activity', () => {
  const expected = [
    'clients','projects','outlets','products','competitors','competitorProducts','projectAssignments',
  ];
  assert.deepEqual([...bulk.ENTITY_TYPES].sort(), expected.sort());
  assert.deepEqual([...MASTER_ENTITIES].sort(), expected.sort());
  for (const entity of ['visits','attendance','productSales','surveyResponses','competitorIntel','stocks','priceObservations']) {
    assert.equal(bulk.ENTITY_TYPES.has(entity), false);
  }
});

test('role matrix keeps org master and project-scoped master separated', () => {
  assert.equal(bulk.allowedEntity({role:'head'},'clients'), true);
  assert.equal(bulk.allowedEntity({role:'admin'},'projects'), true);
  assert.equal(bulk.allowedEntity({role:'manager'},'clients'), false);
  assert.equal(bulk.allowedEntity({role:'manager'},'projects'), false);
  assert.equal(bulk.allowedEntity({role:'manager'},'outlets'), true);
  assert.equal(bulk.allowedEntity({role:'manager'},'products'), true);
  assert.equal(bulk.allowedEntity({role:'manager'},'competitors'), true);
  assert.equal(bulk.allowedEntity({role:'manager'},'competitorProducts'), true);
  assert.equal(bulk.allowedEntity({role:'manager'},'projectAssignments'), true);
  assert.equal(bulk.allowedEntity({role:'employee'},'products'), false);
});

test('normalizers keep stable natural keys and typed values', () => {
  const product = bulk.normalize('products', {
    sku:' SKU-01 ', name:'Produk A', client_code:'CL-A', project_codes:'P1;P2',
    price:'12000', cost:'8000', margin:'25', status:'aktif',
  }, 0);
  assert.equal(product.sku,'SKU-01');
  assert.deepEqual(product.projectCodes,['P1','P2']);
  assert.equal(product.price,12000);
  assert.equal(product.cost,8000);
  assert.equal(product.status,'active');

  const outlet = bulk.normalize('outlets', {
    outlet_code:'OUT-1', name:'Outlet A', client_code:'CL-A', project_codes:'P1',
    latitude:'-6.2', longitude:'106.8', geofence_radius_m:'100',
  }, 1);
  assert.equal(outlet.rowNumber,3);
  assert.equal(outlet.lat,-6.2);
  assert.equal(outlet.lng,106.8);
  assert.equal(outlet.geofenceRadiusM,100);

  const assignment = bulk.normalize('projectAssignments', {
    project_code:'P1', employee_code:'EMP1', supervisor_email:' Spv@Example.com ',
    allocation_percent:'50',
  }, 2);
  assert.equal(assignment.supervisorEmail,'spv@example.com');
  assert.equal(assignment.allocationPercent,50);
});

test('CSV parser accepts aliases and enforces entity-specific required columns', () => {
  const rows = normalizeMasterRows([
    ['Kode Produk','Nama Produk','Kode Klien','Kode Project','Harga'],
    ['SKU-1','Produk A','CL-A','P1','10000'],
  ], 'products');
  assert.equal(rows.length,1);
  assert.equal(rows[0].sku,'SKU-1');
  assert.equal(rows[0].name,'Produk A');
  assert.equal(rows[0].client_code,'CL-A');
  assert.equal(rows[0].project_codes,'P1');

  assert.throws(() => normalizeMasterRows([
    ['name','client_code'],['Produk tanpa SKU','CL-A'],
  ], 'products'), /Kolom wajib tidak ditemukan: sku/);

  assert.match(masterTemplateCsv('competitors'), /^\uFEFFcompetitor_code,name,category,color,status,notes/m);
});

test('generic bulk API is server validated, locked, chunk-idempotent and revision aware', async () => {
  const source = await read('worker/bulk-master.js');
  assert.match(source, /CORE_BULK_API_ENABLED/);
  assert.match(source, /BULK_VALIDATION_FAILED/);
  assert.match(source, /IMPORT_OWNERSHIP_MISMATCH/);
  assert.match(source, /core_bulk_master_chunks/);
  assert.match(source, /replayed:true/);
  assert.match(source, /core_sync_mutations/);
  assert.match(source, /UPDATE core_sync_state SET revision=/);
  assert.match(source, /core_bulk_revision_guards/);
  assert.match(source, /REVISION_CONFLICT/);
  assert.match(source, /PROJECT_CLIENT_MISMATCH/);
  assert.match(source, /PROJECT_OUT_OF_SCOPE/);
  assert.match(source, /DUPLICATE_KEY_ROW_/);
});

test('competitor CRUD is included in operational D1 bootstrap and client cloud collections', async () => {
  const [ops,cloud,db] = await Promise.all([
    read('worker/operations.js'), read('src/lib/cloud-data.js'), read('src/lib/db.js'),
  ]);
  for (const key of ['competitors','competitorProducts','competitorIntel']) {
    assert.match(ops, new RegExp(`${key}: 'core_`));
    assert.match(cloud, new RegExp(`'${key}'`));
  }
  assert.match(ops, /SELECT \* FROM core_competitors WHERE organization_id=/);
  assert.match(ops, /SELECT \* FROM core_competitor_products WHERE organization_id=/);
  assert.match(ops, /SELECT \* FROM core_competitor_intel WHERE organization_id=/);
  assert.match(db, /db\.competitorIntel = .*filter/);
});

test('all requested master pages expose bulk upload without replacing employee specialized flow', async () => {
  const [app,pm,employeeBulk] = await Promise.all([
    read('src/app.js'), read('src/types/index.js'), read('src/bulk-employees.js'),
  ]);
  for (const entity of ['outlets','products','competitors','competitorProducts']) {
    assert.match(app, new RegExp(`BulkMaster\\.open\\('${entity}'\\)`));
  }
  for (const entity of ['clients','projects','projectAssignments']) {
    assert.match(pm, new RegExp(`BulkMaster\\.open\\('${entity}'\\)`));
  }
  assert.match(app, /BulkEmployees\.open\(\)/);
  assert.match(employeeBulk, /Bulk Upload Karyawan/);
});

test('M8 release gate requires competitor/bulk schema and protects generic bulk endpoint', async () => {
  const [hardening,workflow,main] = await Promise.all([
    read('worker/hardening.js'), read('.github/workflows/cloudflare-mvp.yml'), read('worker/main.js'),
  ]);
  assert.match(hardening, /bulkMasterSchemaReady/);
  assert.match(hardening, /core_bulk_master_runs/);
  assert.match(workflow, /bulkMasterSchema/);
  assert.match(workflow, /\/api\/bulk\/master\/products\/preview/);
  assert.match(main, /handleBulkMasterRoute/);
  assert.match(main, /pathname\.startsWith\('\/api\/bulk\/'\)/);
});

test('manual retry reuses the same import id for chunk replay safety', async () => {
  const ui = await read('src/bulk-master.js');
  assert.match(ui, /let currentImportId=''/);
  assert.match(ui, /currentImportId=currentImportId \|\|/);
  assert.match(ui, /const importId=currentImportId/);
  assert.match(ui, /currentImportId=''/);
});

test('PWA cache includes generic bulk UI/parser at generation v12', async () => {
  const sw = await read('sw.js');
  assert.match(sw,/proqtrack-v12/);
  assert.match(sw,/\.\/src\/bulk-master\.js/);
  assert.match(sw,/\.\/src\/lib\/bulk-master-upload\.js/);
});
