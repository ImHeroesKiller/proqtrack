import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Team Employee residual locks active operational role changes to staffing flow', async () => {
  const bulk = await read('worker/bulk-employees.js');
  assert.match(bulk, /EMPLOYEE_ROLE_CHANGE_REQUIRES_ASSIGNMENT_FLOW/);
  assert.match(bulk, /existingActiveAssignments\.length/);
  assert.match(bulk, /row\.role !== existingRole/);
});

test('Team Employee residual validates supervisor through canonical active assignment coverage', async () => {
  const bulk = await read('worker/bulk-employees.js');
  assert.match(bulk, /supervisorAssignment/);
  assert.match(bulk, /assignment\.status !== 'active'/);
  assert.match(bulk, /assignmentRole === 'supervisor'/);
  assert.match(bulk, /assignmentStart <= projectStart/);
  assert.match(bulk, /assignmentEnd >= projectEnd/);
  assert.match(bulk, /SUPERVISOR_ASSIGNMENT_NOT_COVERING_PROJECT/);
  assert.doesNotMatch(bulk, /SUPERVISOR_NOT_ASSIGNED_TO_PROJECT/);
});

test('Employee edit UI keeps operational role read-only', async () => {
  const app = await read('src/app.js');
  assert.match(app, /name="role" value="\$\{esc\(emp\.role\)\}" readonly/);
  assert.match(app, /Ubah role dari Manajemen Akun/);
});

test('Team Employee residual advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.40/);
});
