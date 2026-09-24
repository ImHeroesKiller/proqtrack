import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignment residual allows ending inactive or loginless employee assignments', async () => {
  const worker = await read('worker/operations.js');
  const endGuard = worker.indexOf("if (currentStatus === 'active' && status === 'ended'");
  const inactiveCheck = worker.indexOf("ASSIGNMENT_EMPLOYEE_INACTIVE");
  const loginCheck = worker.indexOf("ASSIGNMENT_EMPLOYEE_LOGIN_REQUIRED");
  assert.ok(endGuard >= 0);
  assert.ok(inactiveCheck > endGuard);
  assert.ok(loginCheck > endGuard);
  assert.match(worker, /if \(status === 'active'\) \{\n    if \(str\(employee\.employment_status\) !== 'active'\)/);
});

test('Assignment residual blocks ending supervisor while active subordinates remain', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /ASSIGNMENT_SUPERVISOR_HAS_ACTIVE_SUBORDINATES/);
  assert.match(worker, /str\(meta\.supervisorId\) === employeeId/);
  assert.match(worker, /context\.batchAssignments/);
  assert.match(worker, /remainingSubordinates/);
});

test('Assignment residual permits same-batch subordinate closure', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /const closingIds = new Set\(\(context\.batchAssignments \|\| \[\]\)/);
  assert.match(worker, /str\(item\.status\) === 'ended'/);
  assert.match(worker, /dependentIds\.filter\(dependentId => !closingIds\.has\(dependentId\)\)/);
});

test('Assignment residual exposes user-facing supervisor hierarchy error', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /ASSIGNMENT_SUPERVISOR_HAS_ACTIVE_SUBORDINATES/);
  assert.match(src, /Akhiri atau pindahkan subordinate terlebih dahulu/);
});

test('Assignment residual advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.38/);
});
