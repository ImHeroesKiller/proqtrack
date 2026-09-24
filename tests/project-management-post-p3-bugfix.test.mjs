import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Post-P3 employee role lock falls back to canonical active assignment role', async () => {
  const bulk = await read('worker/bulk-employees.js');
  assert.match(bulk, /const assignmentRoles = new Set/);
  assert.match(bulk, /loginRole\(meta\.roleOnProject \|\| assignment\.position_name \|\| ''\)/);
  assert.match(bulk, /assignmentRoles\.size === 1 \? \[\.\.\.assignmentRoles\]\[0\] : ''/);
  assert.match(bulk, /EMPLOYEE_ROLE_CHANGE_REQUIRES_ASSIGNMENT_FLOW/);
});

test('Post-P3 employee deactivation ends assignment on actual deactivation date', async () => {
  const bulk = await read('worker/bulk-employees.js');
  assert.match(bulk, /ends_on=date\('now'\)/);
  assert.doesNotMatch(bulk, /ends_on=COALESCE\(ends_on,date\('now'\)\)/);
});

test('Post-P3 My Team KPI excludes supervisor own visits', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /const members = team\.filter\(\(e\) => e\.id !== me\?\.id\)/);
  assert.match(src, /const memberIds = new Set\(members\.map/);
  assert.match(src, /memberIds\.has\(String\(v\.employeeId\)\)/);
});

test('Post-P3 bugfix advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.42/);
});
