import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Manager session payload preserves complete project/client scope', async () => {
  const worker = await read('worker/index.js');
  const cloud = await read('src/lib/cloud-data.js');
  assert.match(worker, /projectIds: claims\.projectIds \|\| \[\]/);
  assert.match(worker, /clientIds: claims\.clientIds \|\| \[\]/);
  assert.match(cloud, /projectIds: cloudAccount\.role === 'superadmin'/);
  assert.match(cloud, /Array\.isArray\(cloudAccount\.projectIds\)/);
  assert.match(cloud, /clientIds: cloudAccount\.role === 'superadmin'/);
});

test('Manager frontend scope uses projectIds array with legacy projectId fallback', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/project-ui.js');
  assert.match(src, /managerProjectIds\(account\(\)\)/);
  assert.match(helper, /Array\.isArray\(account\?\.projectIds\)/);
  assert.match(helper, /account\?\.projectId \? \[account\.projectId\] : \[\]/);
  assert.match(src, /const projectIds = accessibleProjectIds\(\)/);
});

test('Project finalization closes active assignments in same authoritative batch', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/project-ui.js');
  assert.match(src, /closingProjectAssignments/);
  assert.match(helper, /status:'ended'/);
  assert.match(src, /const authoritativeChanges = \[/);
  assert.match(src, /\.\.\.closingAssignments\.map\(\(row\) => \(\{ entity:'projectAssignments', op:'upsert', row \}\)\)/);
  assert.match(src, /await commitOperationalChanges\(authoritativeChanges\)/);
  assert.match(src, /closedById/);
});

test('Worker rejects finalization if active assignments are not closed in batch', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /core_employee_project_assignments/);
  assert.match(worker, /PROJECT_ACTIVE_ASSIGNMENTS_REMAIN/);
  assert.match(worker, /context\.batchAssignments/);
  assert.match(worker, /remainingAssignments/);
});

test('Projects residual fix advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.41/);
});
