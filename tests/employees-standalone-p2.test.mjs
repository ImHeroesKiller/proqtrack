import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employees standalone P2 exposes operational health KPIs and filters', async () => {
  const app = await read('src/app.js');
  const helper = await read('src/lib/team-employee-ui.js');
  assert.match(app, /Belum Ditugaskan/);
  assert.match(app, /Login Belum Terhubung/);
  assert.match(app, /empAssignmentFilter/);
  assert.match(app, /empLoginFilter/);
  assert.match(app, /resetEmployeeFilters/);
  assert.match(helper, /function employeeOperationalFlags/);
  assert.match(helper, /function employeeOperationalCounts/);
});

test('Employees standalone P2 surfaces assignment and login state per employee', async () => {
  const app = await read('src/app.js');
  assert.match(app, /data-assigned=/);
  assert.match(app, /data-login=/);
  assert.match(app, /assignmentLabel/);
  assert.match(app, /loginLabel/);
  assert.match(app, /data-label="Operational"/);
});

test('Employees standalone P2 improves operational actions and feedback', async () => {
  const app = await read('src/app.js');
  const helper = await read('src/lib/team-employee-ui.js');
  assert.match(app, /refreshEmployees/);
  assert.match(app, /employeeRefreshBtn/);
  assert.match(app, /Memeriksa…/);
  assert.match(app, /Mengunggah…/);
  assert.match(app, /Menyimpan…/);
  assert.match(app + helper, /assignment aktif yang akan ditutup/);
  assert.match(app, /isProjectAdmin\(\) && e\.status === 'active'/);
});

test('Employees standalone P2 search covers employee identifiers and safe detail photo', async () => {
  const app = await read('src/app.js');
  const helper = await read('src/lib/team-employee-ui.js');
  assert.match(helper, /employee\.employeeCode, employee\.code, employee\.id/);
  assert.match(app, /Cari nama, email, kode, area, project/);
  assert.match(app, /safePhotoUrl\(emp\.photo\)/);
});

test('Employees standalone P2 touches service worker for client refresh', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /Employees P2 operational refresh/);
});
