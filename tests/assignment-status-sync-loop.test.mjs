import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('local DB canonicalizes legacy removed assignment status forward to ended', async () => {
  const db = await read('src/lib/db.js');
  assert.match(db, /if \(row\.status === 'removed'\) row\.status = 'ended'/);
  assert.doesNotMatch(db, /if \(row\.status === 'ended'\) row\.status = 'removed'/);
  assert.match(db, /a\.status = 'ended'/);
});

test('server ignores replay of already-final assignment from legacy clients', async () => {
  const worker = await read('worker/operations.js');
  const start = worker.indexOf("if (entity === 'projectAssignments' && op === 'upsert' && existing)");
  const end = worker.indexOf('let existingProjectIds = []', start);
  assert.ok(start >= 0 && end > start, 'final-assignment replay guard must exist');
  const block = worker.slice(start, end);
  assert.match(block, /removed:'ended'/);
  assert.match(block, /existingStatus === 'ended'/);
  assert.match(block, /incomingStatus === 'ended'/);
  assert.match(block, /sameIdentity/);
  assert.match(block, /sync_final_assignment_replay_ignored/);
  assert.match(block, /continue;/);
});

test('ended assignment UI remains compatible with legacy removed labels', async () => {
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(helper, /normalizeAssignmentStatus/);
  assert.match(helper, /removed.*ended/);
  assert.match(helper, /ended:'Selesai'/);
});
