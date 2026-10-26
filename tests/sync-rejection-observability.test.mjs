import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sync rejection telemetry records only safe routing metadata', async () => {
  const worker = await read('worker/operations.js');
  const start = worker.indexOf("if (url.pathname === '/api/core/sync'");
  const end = worker.indexOf("return json({ error: 'NOT_FOUND'", start);
  assert.ok(start >= 0 && end > start);
  const block = worker.slice(start, end);
  assert.match(block, /sync_rejected/);
  assert.match(block, /organizationId:claims\.organizationId/);
  assert.match(block, /actorId:claims\.sub/);
  assert.match(block, /status:response\.status/);
  assert.match(block, /code:str\(payload\?\.error\)/);
  assert.match(block, /entity:str\(payload\?\.entity\)/);
  assert.doesNotMatch(block, /changes|row|email|password|body:/);
});
