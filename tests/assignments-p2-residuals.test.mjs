import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignment residual enforces manager staffing scope in UI and Worker', async () => {
  const src = await read('src/types/index.js');
  const worker = await read('worker/operations.js');
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(src, /const staffingScope = role\(\) === "project-manager"/);
  assert.match(src, /eligibleAssignmentEmployees/);
  assert.match(helper, /allowed\.has\(String\(employee\.id\)\)/);
  assert.match(src, /Karyawan berada di luar staffing scope Anda/);
  assert.match(worker, /entity === 'projectAssignments'/);
  assert.match(worker, /projectAllowed\(claims, projectId\) && !!employeeId && context\.accessibleEmployeeIds\?\.has\(employeeId\)/);
});

test('Assignment residual filters supervisors by selected period and role', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(helper, /assignment\.roleOnProject === 'supervisor'/);
  assert.match(helper, /assignment\.startDate <= startDate/);
  assert.match(helper, /assignment\.endDate >= endDate/);
  assert.match(src, /supervisorSelect\.disabled = roleOnProject === 'supervisor'/);
  assert.match(src, /data-pqt-onchange="PM\.refreshAssignmentCapacity\(\)"/);
});

test('Assignment residual adds direct create flow from Assignment page', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /Tambah Assignment/);
  assert.match(src, /openAssignmentCreate\(\)/);
  assert.match(src, /openSelectedAssignmentProject\(\)/);
  assert.match(src, /assignmentCreateProject/);
  assert.match(src, /this\.openAssign\(projectId\)/);
});

test('Assignment residual advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.43/);
});
