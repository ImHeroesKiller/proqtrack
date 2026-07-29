import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/phase1-frontend-read.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../assets/logo.js', import.meta.url), 'utf8');

test('phase 1.5 frontend uses read-only identity endpoints', () => {
  assert.match(source, /\/api\/identity\/employees\?limit=200/);
  assert.match(source, /\/api\/identity\/accounts\?limit=200/);
  assert.match(source, /\/api\/identity\/employees\/\$\{encodeURIComponent\(id\)\}/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('phase 1.5 frontend provides localStorage fallback', () => {
  assert.match(source, /normalizeLocalEmployees/);
  assert.match(source, /normalizeLocalAccounts/);
  assert.match(source, /localStorage fallback/);
});

test('phase 1.5 frontend exposes user management navigation and orphan warning', () => {
  assert.match(source, /#\/users/);
  assert.match(source, /User Management/);
  assert.match(source, /role Employee harus terhubung ke employee/);
});

test('phase 1.5 uses bounded requests and cached read model', () => {
  assert.match(source, /CACHE_TTL_MS/);
  assert.match(source, /AbortController/);
  assert.match(source, /state\.loadPromise/);
});

test('phase 1.5 avoids global mutation observers and uses explicit route hooks', () => {
  assert.doesNotMatch(source, /MutationObserver/);
  assert.match(source, /addEventListener\('hashchange'/);
  assert.match(source, /scheduleHydrate/);
});

test('phase 1.5E renders employee photos with initials fallback', () => {
  assert.match(source, /photo_url/);
  assert.match(source, /p15-avatar-fallback/);
  assert.match(source, /onerror=/);
});

test('phase 1.5E provides read-only detail and disabled edit action', () => {
  assert.match(source, /data-detail-id/);
  assert.match(source, /showEmployeeDetail/);
  assert.match(source, /Detail Karyawan/);
  assert.match(source, /Edit tersedia pada Fase 2/);
  assert.match(source, /disabled/);
});

test('phase 1.5 module is loaded by the existing application bootstrap', () => {
  assert.match(bootstrap, /phase1-frontend-read\.js/);
});
