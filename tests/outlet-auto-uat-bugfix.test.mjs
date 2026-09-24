import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');

test('outlet acquisition only offers active assigned projects with new outlet enabled', () => {
  assert.match(db, /export function outletProjectsForEmployee/);
  assert.match(db, /filter\(project => project\.status === 'active'\)/);
  assert.match(db, /assignment\.employeeId === employeeId && assignment\.status === 'active'/);
  assert.match(db, /filter\(project => getProjectStoreSettings\(project\.id\)\.allowNewOutlet\)/);
});

test('employee cannot submit outlet into arbitrary or inactive project', () => {
  assert.match(db, /allowedProjectIds = new Set\(outletProjectsForEmployee\(actor\.employeeId\)/);
  assert.match(db, /Project outlet tidak valid atau tidak aktif untuk akun ini/);
  assert.match(worker, /OUTLET_PROPOSAL_PROJECT_FORBIDDEN/);
});

test('multi-project field sales gets explicit project selector', () => {
  assert.match(field, /outletProjects\.length > 1/);
  assert.match(field, /name="projectId" id="outletProjectSelect"/);
  assert.match(field, /Pilih project tujuan outlet/);
  assert.match(field, /FS\.changeOutletProject\(this\.value\)/);
});

test('approval copy follows the selected project mode', () => {
  assert.match(field, /storeCatalogForEmployee\(empId\(\), projectId\)/);
  assert.match(field, /manual \? 'Ajukan toko baru' : 'Tambah Outlet'/);
  assert.match(field, /manual \? 'Submit for Approval' : 'Tambah Outlet'/);
  assert.match(field, /const catalog = storeCatalogForEmployee\(empId\(\), data\.projectId\)/);
});
