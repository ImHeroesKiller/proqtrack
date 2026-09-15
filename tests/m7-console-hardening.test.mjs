import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CSP is enforced with only the intentional Google Fonts and Leaflet origins', async () => {
  const [headers, hardening] = await Promise.all([read('_headers'), read('worker/hardening.js')]);
  for (const source of [headers, hardening]) {
    assert.match(source, /https:\/\/fonts\.googleapis\.com/);
    assert.match(source, /https:\/\/fonts\.gstatic\.com/);
    assert.match(source, /https:\/\/unpkg\.com/);
  }
  assert.match(headers, /Content-Security-Policy:/);
  assert.doesNotMatch(headers, /Content-Security-Policy-Report-Only/);
  assert.match(hardening, /headers\.set\('content-security-policy'/);
  assert.doesNotMatch(hardening, /headers\.set\('content-security-policy-report-only'/);
});

test('M7 health still requires the M6 reporting schema', async () => {
  const hardening = await read('worker/hardening.js');
  assert.match(hardening, /\['M6', 'M7'\]\.includes\(milestone\.toUpperCase\(\)\)/);
});

test('post-import identity reconciliation cannot turn a committed import into HTTP 500', async () => {
  const gateway = await read('worker/operations-gateway.js');
  assert.match(gateway, /bestEffortReconcile/);
  assert.match(gateway, /operational_membership_reconcile_failed/);
  assert.match(gateway, /operational_manager_repair_failed/);
  assert.match(gateway, /payload\?\.error === 'ALREADY_CUT_OVER'/);
  assert.match(gateway, /alreadyCutOver: true/);
});

test('normal M7 bootstrap never performs implicit legacy import', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  assert.match(bridge, /export async function importLegacySnapshotForAdmin/);
  assert.match(bridge, /implicitLegacyImportDisabled: true/);
  const bootstrapStart = bridge.indexOf('export async function bootstrapOperationalData');
  const flushStart = bridge.indexOf('async function flush', bootstrapStart);
  const bootstrapBody = bridge.slice(bootstrapStart, flushStart);
  assert.doesNotMatch(bootstrapBody, /\/api\/core\/import/);
  assert.doesNotMatch(bootstrapBody, /importLegacySnapshotForAdmin\(/);
});
