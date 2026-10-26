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

test('background reference conflict is auto-rebased and never opens a manual recovery path', async () => {
  const [bridge, app, bootstrap] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('src/app.js'),
    read('src/m4-bootstrap.js'),
  ]);
  assert.match(bridge, /syncTargetWithAutomaticRebase/);
  assert.match(bridge, /SYNC_REFERENCE_CONFLICT/);
  assert.match(bridge, /sync_invalid_reference_cloud_wins/);
  assert.match(bridge, /AUTO_REBASE_CONTENTION_RETRY/);
  assert.doesNotMatch(app, /detail\.conflictKind === 'reference'/);
  assert.doesNotMatch(app, /Perubahan lokal tidak lagi valid/);
  assert.doesNotMatch(bootstrap, /Perubahan perlu ditinjau/);
});
