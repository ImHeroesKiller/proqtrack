import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('visit submit handlers resolve the actual form instead of delegated currentTarget', async () => {
  const app = await read('src/app.js');
  assert.match(app, /function submitFormFromEvent\(event\)/);
  assert.match(app, /if \(target\?\.tagName === 'FORM'\) return target;/);

  const createStart = app.indexOf('window.FT.createVisit = function');
  const createEnd = app.indexOf('window.FT.viewVisit', createStart);
  const createBlock = app.slice(createStart, createEnd);
  assert.match(createBlock, /const form = submitFormFromEvent\(e\)/);
  assert.doesNotMatch(createBlock, /currentTarget\s*\|\|/);
  assert.match(createBlock, /new FormData\(form\)/);

  const correctionStart = app.indexOf('window.FT.submitVisitCorrection = async function');
  const correctionEnd = app.indexOf('window.FT.openVisitCorrection', correctionStart + 1);
  const correctionBlock = app.slice(correctionStart, correctionEnd > correctionStart ? correctionEnd : correctionStart + 2600);
  assert.match(correctionBlock, /const form = submitFormFromEvent\(event\)/);
  assert.doesNotMatch(correctionBlock, /currentTarget\s*\|\|/);
});

test('server recognizes only the legacy assignment cache invalidation signature', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /function isLegacyAssignmentCacheInvalidation\(changes = \[\]\)/);
  assert.match(worker, /\['removed','ended'\]\.includes\(status\)/);
  assert.match(worker, /Karyawan atau akun login tidak aktif/);
  assert.match(worker, /recovery:'LEGACY_ASSIGNMENT_CACHE_INVALIDATION'/);
  assert.match(worker, /refreshRequired:true/);
  assert.match(worker, /sync_legacy_assignment_cache_invalidation_ignored/);
});

test('background sync refreshes silently when server neutralizes stale legacy assignment replay', async () => {
  const cloud = await read('src/lib/cloud-data.js');
  const start = cloud.indexOf('async function syncTargetWithAutomaticRebase');
  const end = cloud.indexOf('async function flush', start);
  const block = cloud.slice(start, end);
  assert.match(block, /if \(result\?\.refreshRequired\)/);
  assert.match(block, /latestCloudSnapshot\(\)/);
  assert.match(block, /sync_auto_recovered_server_refresh/);
  assert.match(block, /recovery:result\.recovery/);
  assert.doesNotMatch(block, /emitStatus\('conflict'/);
});
