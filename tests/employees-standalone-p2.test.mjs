import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employees standalone P2 exposes operational health KPIs and filters', async () => {
  const [app, employeePage, helper] = await Promise.all([
    read('src/app.js'),
    read('src/routes/employees-page.js'),
    read('src/lib/team-employee-ui.js'),
  ]);
  assert.match(employeePage, /Belum Ditugaskan/);
  assert.match(employeePage, /Login Belum Terhubung/);
  assert.match(employeePage, /empAssignmentFilter/);
  assert.match(employeePage, /empLoginFilter/);
  assert.match(app, /resetEmployeeFilters/);
  assert.match(helper, /function employeeOperationalFlags/);
  assert.match(helper, /function employeeOperationalCounts/);
});

test('Employees standalone P2 surfaces assignment and login state per employee', async () => {
  const employeePage = await read('src/routes/employees-page.js');
  assert.match(employeePage, /data-assigned=/);
  assert.match(employeePage, /data-login=/);
  assert.match(employeePage, /assignmentLabel/);
  assert.match(employeePage, /loginLabel/);
  assert.match(employeePage, /data-label="Operational"/);
});

test('Employees standalone P2 improves operational actions and feedback', async () => {
  const [app, employeePage, helper] = await Promise.all([
    read('src/app.js'),
    read('src/routes/employees-page.js'),
    read('src/lib/team-employee-ui.js'),
  ]);
  assert.match(app, /refreshEmployees/);
  assert.match(employeePage, /employeeRefreshBtn/);
  assert.match(app, /Memeriksa…/);
  assert.match(app, /Mengunggah…/);
  assert.match(app, /Menyimpan…/);
  assert.match(app + helper, /assignment aktif yang akan ditutup/);
  assert.match(employeePage, /isProjectAdmin\(\) && e\.status === 'active'/);
});

test('Employees standalone P2 search covers employee identifiers and safe detail photo', async () => {
  const [app, employeePage, helper] = await Promise.all([
    read('src/app.js'),
    read('src/routes/employees-page.js'),
    read('src/lib/team-employee-ui.js'),
  ]);
  assert.match(helper, /employee\.employeeCode, employee\.code, employee\.id/);
  assert.match(employeePage, /Cari nama, email, kode, area, project/);
  assert.match(app, /safePhotoUrl\(emp\.photo\)/);
});

test('Employees standalone P2 touches service worker for client refresh', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /Employees P2 operational refresh/);
});
