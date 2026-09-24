import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Team P1 derives supervisor hierarchy from canonical assignments', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/team-employee-ui.js');
  assert.match(src, /subordinateEmployeeIds/);
  assert.match(helper, /assignment\.supervisorId/);
  assert.match(helper, /assignment\.supervisorUserId/);
  assert.match(src, /subordinateIds/);
  assert.doesNotMatch(src, /e\.supervisorId === me\?\.id/);
  assert.match(helper, /new Set\(assignments\.filter/);
});

test('Employee P1 supports Manager multi-project create scope', async () => {
  const app = await read('src/app.js');
  assert.match(app, /Array\.isArray\(actor\.projectIds\)/);
  assert.match(app, /managerProjects\.has\(String\(p\.id\)\)/);
});

test('Employee P1 edits do not pick an arbitrary active assignment', async () => {
  const app = await read('src/app.js');
  assert.match(app, /data\.projectId = ''/);
  assert.match(app, /projectId: ''/);
  assert.doesNotMatch(app, /const assignment = \(getDB\(\)\.projectAssignments \|\| \[\]\)\.find\(a => a\.employeeId === id && a\.status === 'active'\)/);
});

test('Employee P1 requires canonical supervisor for new Field Sales', async () => {
  const app = await read('src/app.js');
  const bulk = await read('worker/bulk-employees.js');
  assert.match(app, /Supervisor wajib dipilih untuk Field Sales/);
  assert.match(bulk, /SUPERVISOR_REQUIRED/);
  assert.match(bulk, /supervisorEmployeeId/);
  assert.match(bulk, /roleOnProject/);
  assert.match(bulk, /supervisorId:/);
});

test('Employee P1 deactivation closes every active assignment and access membership', async () => {
  const bulk = await read('worker/bulk-employees.js');
  assert.match(bulk, /WHERE organization_id=\? AND employee_id=\? AND status='active'/);
  assert.match(bulk, /SET status='ended'/);
  assert.match(bulk, /UPDATE core_project_memberships/);
  assert.match(bulk, /UPDATE core_auth_sessions/);
  assert.match(bulk, /EMPLOYEE_ACTIVE_SUBORDINATES/);
  assert.match(bulk, /EMPLOYEE_HAS_OUT_OF_SCOPE_ASSIGNMENTS/);
});

test('Employee P1 core sync has defensive employee mutation validator', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /validateEmployeeMutation/);
  for (const code of [
    'EMPLOYEE_ID_REQUIRED',
    'EMPLOYEE_CODE_REQUIRED',
    'EMPLOYEE_NAME_REQUIRED',
    'EMPLOYEE_INVALID_STATUS',
    'EMPLOYEE_INVALID_EMAIL',
    'EMPLOYEE_CODE_CONFLICT',
    'EMPLOYEE_EMAIL_CONFLICT',
    'EMPLOYEE_AUTH_LINK_IMMUTABLE',
    'EMPLOYEE_TERMINATED_FINAL',
    'EMPLOYEE_ACTIVE_ASSIGNMENTS_REMAIN',
  ]) assert.match(worker, new RegExp(code));
  assert.doesNotMatch(worker, /name: str\(row\.name \|\| row\.fullName \|\| 'Employee'\)/);
});

test('Team Employees P1 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.41/);
});
