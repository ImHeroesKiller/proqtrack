import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('background business 409 becomes a cloud-win recovery instruction, not an HTTP error', async () => {
  const worker = await read('worker/operations.js');
  const start = worker.indexOf("if (url.pathname === '/api/core/sync'");
  const end = worker.indexOf("return json({ error: 'NOT_FOUND'", start);
  const block = worker.slice(start, end);

  assert.match(block, /request\.clone\(\)\.json\(\)/);
  assert.match(block, /syncMode === 'background-sync'/);
  assert.match(block, /response\.status === 409/);
  assert.match(block, /!\['REVISION_CONFLICT','SYNC_REFERENCE_CONFLICT'\]\.includes/);
  assert.match(block, /BACKGROUND_BUSINESS_CONFLICT_CLOUD_WINS/);
  assert.match(block, /refreshRequired:true/);
  assert.match(block, /conflict:\{/);
  assert.match(block, /\},200\)/);
});

test('explicit direct project edits keep authoritative business-rule rejection semantics', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /PROJECT_ATTENDANCE_SOURCE_IN_USE/);

  const cloud = await read('src/lib/cloud-data.js');
  assert.match(cloud, /source:'direct-commit'/);
  assert.match(cloud, /syncMode:source/);
  assert.doesNotMatch(cloud, /syncMode:'background-sync'/);
});

test('background recovery replaces only the rejected record with cloud state and retries other intent', async () => {
  const cloud = await read('src/lib/cloud-data.js');
  const start = cloud.indexOf('async function syncTargetWithAutomaticRebase');
  const end = cloud.indexOf('async function flush', start);
  const block = cloud.slice(start, end);

  assert.match(block, /result\?\.conflict\?\.entity/);
  assert.match(block, /result\?\.conflict\?\.id/);
  assert.match(block, /chunk\.find\(change =>/);
  assert.match(block, /cloudWinTargetForChange\(target, latest\.snapshot, rejected\)/);
  assert.match(block, /sync_background_business_conflict_cloud_wins/);
  assert.match(block, /totalDroppedChanges \+= 1/);
  assert.match(block, /continue;/);
});
