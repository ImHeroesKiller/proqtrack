import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CSP keeps executable scripts self-hosted with no inline event execution', async () => {
  const [headers, hardening, html] = await Promise.all([read('_headers'), read('worker/hardening.js'), read('index.html')]);
  for (const source of [headers, hardening]) {
    assert.match(source, /https:\/\/fonts\.googleapis\.com/);
    assert.match(source, /https:\/\/fonts\.gstatic\.com/);
    assert.match(source, /script-src 'self'/);
    assert.match(source, /script-src-elem 'self'/);
    assert.doesNotMatch(source, /script-src-attr 'unsafe-inline'/);
    assert.doesNotMatch(source, /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)/);
    assert.doesNotMatch(source, /script-src 'self' 'unsafe-inline'/);
  }
  assert.match(html, /\.\/assets\/vendor\/leaflet\/leaflet\.js/);
  assert.doesNotMatch(html, /<script type="module">/);
  assert.match(headers, /Content-Security-Policy:/);
  assert.doesNotMatch(headers, /Content-Security-Policy-Report-Only/);
  assert.match(hardening, /headers\.set\('content-security-policy'/);
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

test('every cloud login attempt invalidates stale bearer state and ignores superseded responses', async () => {
  const uploads = await read('src/lib/uploads.js');
  assert.match(uploads, /let tokenGeneration = 0/);
  assert.match(uploads, /function clearApiTokenIfCurrent\(generation\)/);
  const start = uploads.indexOf('export async function issueUploadSession');
  const end = uploads.indexOf('export async function revokeApiSession', start);
  const login = uploads.slice(start, end);
  const clearIndex = login.indexOf('clearApiToken();');
  const validationIndex = login.indexOf("if (!account?.id && !credentials.email)");
  assert.ok(clearIndex >= 0 && validationIndex > clearIndex);
  assert.match(login, /const generation = tokenGeneration/);
  assert.match(login, /if \(generation !== tokenGeneration\) return null/);
  assert.match(login, /clearApiTokenIfCurrent\(generation\)/);
});

test('partial cloud session is revoked when authoritative session lookup fails', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  const start = bridge.indexOf('export async function establishCloudSession');
  const end = bridge.indexOf('// Legacy migration', start);
  const establish = bridge.slice(start, end);
  assert.match(establish, /apiJson\('\/api\/auth\/session'\)/);
  assert.match(establish, /revokeApiSession\(\)/);
});

test('online M7 login is cloud-authoritative and single-flight', async () => {
  const cutover = await read('src/cloud-cutover.js');
  assert.match(cutover, /let loginInFlight = false/);
  assert.match(cutover, /if \(loginInFlight\) return/);
  assert.match(cutover, /clearApiToken\(\)/);
  assert.match(cutover, /localCandidate\?\.role === 'superadmin'/);
  assert.match(cutover, /\? ''/);
  assert.match(cutover, /if \(!cloudAccount\) \{/);
  assert.match(cutover, /Login gagal\. Periksa email, password, dan koneksi/);
  assert.doesNotMatch(cutover, /sesi lokal sementara dipertahankan/);
  assert.match(cutover, /await logoutCloudSession\(\)\.catch/);
});

test('stale tenant rejection is surfaced instead of hidden as a generic login failure', async () => {
  const uploads = await read('src/lib/uploads.js');
  assert.match(uploads, /data\.error === 'ORGANIZATION_ACCESS_DENIED'/);
  assert.match(uploads, /Organisasi tersimpan sudah tidak aktif/);
});

test('superadmin login hotfix forces a fresh service-worker cache', async () => {
  const serviceWorker = await read('sw.js');
  assert.match(serviceWorker, /proqtrack-v12\.8/);
});

test('global superadmin session selects an active tenant before bootstrap', async () => {
  const cutover = await read('src/cloud-cutover.js');
  const selectIndex = cutover.indexOf("cloudAccount.role === 'superadmin' && !cloudAccount.organizationId");
  const bootstrapIndex = cutover.indexOf('bootstrapOperationalData(db, cloudAccount)', selectIndex);
  assert.ok(selectIndex >= 0 && bootstrapIndex > selectIndex);
  assert.match(cutover, /syncCloudOrganizations\(\)/);
  assert.match(cutover, /switchApiOrganization\(preferred\.id\)/);
  assert.match(cutover, /db\.currentOrganizationId = preferred\.id/);
});

test('successful cloud login refreshes only the hashed offline credential', async () => {
  const [bridge, cutover] = await Promise.all([read('src/lib/cloud-data.js'), read('src/cloud-cutover.js')]);
  assert.match(bridge, /verifiedPassword = ''/);
  assert.match(bridge, /next\.password = hashPassword\(verifiedPassword\)/);
  assert.match(cutover, /ensureCloudIdentity\(db, cloudAccount, localAccount \|\| localCandidate, password\)/);
  assert.doesNotMatch(bridge, /next\.password = verifiedPassword/);
});
