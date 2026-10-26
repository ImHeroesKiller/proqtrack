import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('sync maps D1 foreign-key failures to recoverable 409 instead of HTTP 500', async () => {
  const operations = await read('worker/operations.js');
  assert.match(operations, /function isForeignKeyConstraintError\(error\)/);
  assert.match(operations, /SQLITE_CONSTRAINT_FOREIGNKEY/);
  assert.match(operations, /error:'SYNC_REFERENCE_CONFLICT'/);
  assert.match(operations, /return json\(\{[\s\S]*SYNC_REFERENCE_CONFLICT[\s\S]*\},409\)/);
  assert.match(operations, /sync_reference_conflict/);
});

test('broad-role sync skips full employee access scans', async () => {
  const operations = await read('worker/operations.js');
  const start = operations.indexOf('async function handleSync');
  const end = operations.indexOf('export async function handleOperationalRoute', start);
  const sync = operations.slice(start, end);
  assert.match(sync, /BROAD_ROLES\.has\(roleOf\(claims\)\)[\s\S]*new Set\(\)[\s\S]*employeeAccess\(env, claims\)/);
});

test('client uses smaller bounded sync chunks and shorter debounce', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  assert.match(bridge, /const SYNC_CHUNK_SIZE = 50/);
  assert.match(bridge, /const SYNC_DEBOUNCE_MS = 100/);
  assert.match(bridge, /changes\.slice\(offset, offset \+ SYNC_CHUNK_SIZE\)/);
  assert.doesNotMatch(bridge, /changes\.slice\(offset, offset \+ 200\)/);
});

test('reference conflicts enter authoritative conflict recovery instead of generic error', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const flushStart = bridge.indexOf('async function flush');
  const commitStart = bridge.indexOf('export async function commitOperationalChanges', flushStart);
  const flush = bridge.slice(flushStart, commitStart);
  const commitEnd = bridge.indexOf('export function scheduleOperationalSync', commitStart);
  const commit = bridge.slice(commitStart, commitEnd);
  assert.match(flush, /SYNC_REFERENCE_CONFLICT/);
  assert.match(flush, /conflictKind:'reference'/);
  assert.match(commit, /SYNC_REFERENCE_CONFLICT/);
  assert.match(commit, /recoverable:true/);
});


test('employee sync never links a global auth user outside the active organization', async () => {
  const operations = await read('worker/operations.js');
  const start = operations.indexOf('// Preserve an existing tenant-scoped auth link');
  const end = operations.indexOf("statements.push(...upsertStatements", start);
  assert.ok(start >= 0 && end > start, 'employee auth resolution block must exist');
  const employeeAuth = operations.slice(start, end);
  assert.match(employeeAuth, /existingAuthUserId/);
  assert.match(employeeAuth, /JOIN core_organization_users ou/);
  assert.match(employeeAuth, /ou\.user_id=au\.id AND ou\.organization_id=\?/);
  assert.doesNotMatch(employeeAuth, /SELECT id FROM auth_users WHERE lower\(email\)=lower\(\?\) LIMIT 1/);
});
