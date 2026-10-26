import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('employee delete is rejected before D1 when historical references exist', async () => {
  const worker = await read('worker/operations.js');
  const start = worker.indexOf('async function validateEmployeeMutation');
  const end = worker.indexOf('async function validateOutletMutation', start);
  const block = worker.slice(start, end);
  assert.match(block, /const op = str\(context\.op \|\| 'upsert'\)/);
  assert.match(block, /if \(op === 'delete'\)/);
  assert.match(block, /EMPLOYEE_REFERENCED_USE_INACTIVE/);
  assert.match(block, /core_visits/);
  assert.match(block, /core_attendance/);
  assert.match(block, /core_employee_project_assignments/);
  assert.match(block, /core_inventory_cycles/);

  const syncStart = worker.indexOf('async function handleSync');
  const syncEnd = worker.indexOf('export async function handleOperationalRoute', syncStart);
  const sync = worker.slice(syncStart, syncEnd);
  assert.match(sync, /if \(entity === 'employees'\)/);
  assert.match(sync, /validateEmployeeMutation\(env, organizationId, row, existing, \{ batchAssignments, op \}\)/);
});

test('background reference conflict restores authoritative baseline instead of looping', async () => {
  const [bridge, app] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('src/app.js'),
  ]);
  assert.match(bridge, /conflictKind:'reference'[\s\S]*recoverable:true[\s\S]*source:'background-sync'/);
  assert.match(app, /detail\.conflictKind === 'reference'/);
  assert.match(app, /detail\.source === 'background-sync'/);
  assert.match(app, /restoreOperationalBaseline\(getDB\(\)\)/);
  assert.match(app, /Perubahan lokal tidak lagi valid/);
});
