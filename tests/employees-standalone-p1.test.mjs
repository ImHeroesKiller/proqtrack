import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employees standalone P1 locks status lifecycle in edit UI and backend', async () => {
  const app = await read('src/app.js');
  const bulk = await read('worker/bulk-employees.js');
  const core = await read('worker/operations.js');
  assert.match(app, /Status tidak diubah dari form Edit/);
  const editStart = app.indexOf("window.FT.editEmployee = function(id)");
  const editEnd = app.indexOf("window.FT.updateEmployee = async function", editStart);
  const editBlock = app.slice(editStart, editEnd);
  assert.doesNotMatch(editBlock, /name="status"/);
  assert.match(editBlock, /Status tidak diubah dari form Edit/);
  assert.match(app, /data\.status = current\.status/);
  assert.match(bulk, /EMPLOYEE_REACTIVATION_REQUIRES_STAFFING_FLOW/);
  assert.match(core, /EMPLOYEE_REACTIVATION_REQUIRES_STAFFING_FLOW/);
});

test('Employees standalone P1 escapes stored employee detail output', async () => {
  const app = await read('src/app.js');
  assert.match(app, /<div class="detail-label">ID<\/div><div class="detail-value">\$\{esc\(emp\.id\)\}<\/div>/);
  assert.match(app, /<div class="detail-label">Telepon<\/div><div class="detail-value">\$\{esc\(emp\.phone \|\| '—'\)\}<\/div>/);
  assert.match(app, /outletIcon\(o\.type\)\+' '\+esc\(o\.name\)/);
  assert.match(app, /esc\(v\.checkInTime \|\| '-'\)/);
  assert.match(app, /safePhotoUrl\(e\.photo\)/);
});

test('Employees standalone P1 stores profile photos in R2 and cleans failed uploads', async () => {
  const app = await read('src/app.js');
  const bulk = await read('worker/bulk-employees.js');
  assert.match(app, /category:'employee-profile'/);
  assert.match(app, /await uploadAsset\(uploadFile/);
  assert.match(app, /await deleteUploadedAsset\(key\)/);
  assert.match(app, /if \(uploadedPhoto\?\.uploaded\) await cleanupEmployeePhoto\(uploadedPhoto\.key\)/);
  assert.match(app, /String\(stored\)\.startsWith\('data:image\/'\)/);
  assert.match(bulk, /EMPLOYEE_PHOTO_MUST_USE_STORAGE/);
});

test('Employees standalone P1 makes password conditional on account preflight', async () => {
  const app = await read('src/app.js');
  const bulkUi = await read('src/bulk-employees.js');
  assert.match(app, /previewSingleEmployee/);
  assert.match(app, /checked\.loginAction === 'create'/);
  assert.match(app, /Password wajib untuk akun baru/);
  assert.doesNotMatch(app, /name="password"[^>]*required/);
  assert.match(bulkUi, /export async function previewSingleEmployee/);
  assert.match(bulkUi, /window\.BulkEmployees = \{[^}]*previewSingleEmployee/);
});

test('Employees standalone P1 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.43/);
});
