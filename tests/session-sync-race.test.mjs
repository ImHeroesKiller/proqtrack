import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('login resets the cloud sync bridge before clearing or rotating bearer state', async () => {
  const cutover = await read('src/cloud-cutover.js');
  const start = cutover.indexOf('async function cloudFirstLogin');
  const end = cutover.indexOf('let restoreInFlight', start);
  const body = cutover.slice(start, end);
  const reset = body.indexOf('resetCloudDataBridge();');
  const clear = body.indexOf('clearApiToken();');
  const establish = body.indexOf('establishCloudSession');
  assert.ok(reset >= 0, 'bridge reset missing');
  assert.ok(clear > reset, 'token must be cleared after bridge reset');
  assert.ok(establish > clear, 'new session must be established after reset + clear');
});

test('protected cloud API calls never fetch without a bearer token', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const start = bridge.indexOf('async function apiJson');
  const end = bridge.indexOf('export async function restoreCloudSession', start);
  const api = bridge.slice(start, end);
  assert.match(api, /const token = getApiToken\(\)/);
  assert.match(api, /if \(!token\) throw bridgeError\('AUTH_REQUIRED', 401\)/);
  const guard = api.indexOf("if (!token) throw bridgeError('AUTH_REQUIRED', 401)");
  const fetch = api.indexOf('fetch(path');
  assert.ok(guard >= 0 && fetch > guard, 'missing-token guard must run before fetch');
  assert.match(api, /authorization: `Bearer \$\{token\}`/);
});

test('session context changes abort in-flight cloud requests and invalidate stale responses', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  assert.match(bridge, /let bridgeGeneration = 0/);
  assert.match(bridge, /const bridgeControllers = new Set\(\)/);
  assert.match(bridge, /function abortBridgeRequests\(\)/);
  assert.match(bridge, /controller\.abort\('SESSION_CONTEXT_CHANGED'\)/);
  assert.match(bridge, /generation !== bridgeGeneration \|\| getApiToken\(\) !== token/);
  const resetStart = bridge.indexOf('export function resetCloudDataBridge');
  const resetEnd = bridge.indexOf('export async function switchCloudOrganization', resetStart);
  assert.match(bridge.slice(resetStart, resetEnd), /abortBridgeRequests\(\)/);
});

test('401 session failures clear bearer state, stop the bridge, and notify the UI', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const cutover = await read('src/cloud-cutover.js');
  assert.match(bridge, /SESSION_AUTH_ERRORS/);
  assert.match(bridge, /res\.status === 401 && SESSION_AUTH_ERRORS\.has/);
  assert.match(bridge, /clearApiToken\(\);\s*resetCloudDataBridge\(\);\s*emitSessionInvalid/);
  assert.match(cutover, /proqtrack:session-invalid/);
  assert.match(cutover, /state\.loggedIn = false/);
  assert.match(cutover, /state\.account = null/);
  assert.match(cutover, /forceRoute\('#\/login'\)/);
});

test('authoritative auth errors survive bridge cancellation instead of being masked as SESSION_STALE', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const start = bridge.indexOf('async function apiJson');
  const end = bridge.indexOf('export async function restoreCloudSession', start);
  const api = bridge.slice(start, end);
  const preserve = api.indexOf("SESSION_AUTH_ERRORS.has(String(error?.code || ''))");
  const stale = api.indexOf("throw bridgeError('SESSION_STALE', 0)", preserve);
  assert.ok(preserve >= 0 && stale > preserve);
});
