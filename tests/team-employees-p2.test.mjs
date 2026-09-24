import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Team Employees P2 adds combined employee filters pagination and sync state', async () => {
  const app = await read('src/app.js');
  const helper = await read('src/lib/team-employee-ui.js');
  assert.match(helper, /EMPLOYEE_PAGE_SIZE = 15/);
  assert.match(app, /empRoleFilter/);
  assert.match(app, /empStatusFilter/);
  assert.match(app, /empProjectFilter/);
  assert.match(app, /employeeResultSummary/);
  assert.match(app, /employeePager/);
  assert.match(app, /employeeSyncState/);
  assert.match(app, /employeeSyncState/);
  assert.match(helper, /function employeeSyncState/);
});

test('Team Employees P2 renames destructive action to Nonaktifkan and hides it for inactive rows', async () => {
  const app = await read('src/app.js');
  assert.match(app, />Nonaktifkan<\/button>/);
  assert.match(app, /e\.status === 'active'/);
  assert.doesNotMatch(app, /FT\.deleteEmployee\('\$\{e\.id\}'\)[^\n]*>Hapus<\/button>/);
});

test('Team Employees P2 enriches employee detail with assignments, supervisor, capacity and login', async () => {
  const app = await read('src/app.js');
  assert.match(app, /Project & Assignment/);
  assert.match(app, /Project Aktif/);
  assert.match(app, /Kapasitas/);
  assert.match(app, /Login/);
  assert.match(app, /employeeMap\[a\.supervisorId\]/);
  assert.match(app, /getAccounts\(\)/);
});

test('Team Employees P2 makes employee and team tables responsive', async () => {
  const html = await read('index.html');
  assert.match(html, /\.employee-table thead \{ display:none; \}/);
  assert.match(html, /\.employee-table tbody tr td::before \{ content:attr\(data-label\)/);
  assert.match(html, /\.pm-team-table thead \{ display:none; \}/);
});

test('My Team P2 adds project filtering detail and operational context', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /teamProjectFilter/);
  assert.match(src, /teamSearch/);
  assert.match(src, /teamResultSummary/);
  assert.match(src, /filterMyTeam\(\)/);
  assert.match(src, /data-label="Kapasitas"/);
  assert.match(src, /location\.hash='#\/employee\/\$\{e\.id\}'/);
});

test('Supervisor Compare P2 is project-aware and exposes team denominator', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /supervisorCompareProject/);
  assert.match(src, /filterSupervisorCompare\(\)/);
  assert.match(src, /data-metric="team"/);
  assert.match(src, /Team menunjukkan jumlah anggota aktif sebagai denominator konteks/);
});

test('Team Employees P2 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.41/);
});
