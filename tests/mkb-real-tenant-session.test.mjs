import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('MKB promotion removes only known synthetic tenant seed and preserves real Head', async () => {
  const sql = await read('migrations/0016_promote_mkb_real_tenant.sql');
  for (const id of [
    'EMP-MKB-BUDI','EMP-MKB-NADIA','EMP-MKB-RIZKY','EMP-MKB-MANAGER','EMP-MKB-HEAD',
    'PRJ-MKB-SALES-UAT','CL-MKB-FMCG-UAT','SURV-MKB-PERFECT-STORE',
  ]) assert.match(sql, new RegExp(id));
  assert.match(sql, /DELETE FROM core_organization_users/);
  assert.match(sql, /mkb-real-tenant-promotion-0016/);
  assert.doesNotMatch(sql, /DELETE FROM auth_users/);
  assert.match(sql, /Preserve all non-synthetic MKB records and the real Head account \(akbar@mkb\.com\)/);
  assert.doesNotMatch(sql, /lower\(email\)='akbar@mkb\.com'/);
});

test('production gate treats MKB as real tenant and rejects synthetic leftovers', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /Verify MKB real tenant isolation/);
  assert.match(workflow, /lower\(au\.email\)='akbar@mkb\.com'/);
  assert.match(workflow, /synthetic_employees/);
  assert.match(workflow, /synthetic_org_users/);
  assert.match(workflow, /Synthetic MKB UAT leftovers/);
  assert.match(workflow, /MKB real tenant PASS/);
  assert.doesNotMatch(workflow, /Verify M7 MKB tenant seed/);
  assert.doesNotMatch(workflow, /Diagnose M7 MKB identity readiness/);
});

test('browser refresh restores the authoritative bearer session before returning to login', async () => {
  const [cloudData, cutover, uploads] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('src/cloud-cutover.js'),
    read('src/lib/uploads.js'),
  ]);
  assert.match(cloudData, /export async function restoreCloudSession/);
  assert.match(cloudData, /apiJson\('\/api\/auth\/session'\)/);
  assert.match(cloudData, /bootstrapOperationalData\(localDb, session\)/);
  assert.match(cloudData, /applyRemoteDataToLocal\(localDb, bootstrap\.data\)/);
  assert.match(cutover, /restoreCloudSessionOnReload/);
  assert.match(cutover, /if \(restoreInFlight \|\| !getApiToken\(\) \|\| window\.FT\?\.state\?\.loggedIn\) return false/);
  assert.match(cutover, /state\.loggedIn = true/);
  assert.match(cutover, /queueMicrotask\(\(\) => restoreCloudSessionOnReload\(\)\)/);
  assert.match(uploads, /sessionStorage\.getItem\(TOKEN_KEY\)/);
});

test('refresh hotfix forces a new service-worker generation', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12/);
});


test('global superadmin login never auto-selects a tenant or bootstraps operational data before workspace selection', async () => {
  const [cloudData, cutover, gateway, sw] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('src/cloud-cutover.js'),
    read('worker/operations-gateway.js'),
    read('sw.js'),
  ]);
  assert.match(cloudData, /account\?\.role \|\| ''\)\.toLowerCase\(\) === 'superadmin' && !account\?\.organizationId/);
  assert.match(cloudData, /mode: 'global'/);
  assert.match(cutover, /globalSuperadmin \? '#\/organizations'/);
  assert.match(cutover, /db\.currentOrganizationId = null/);
  assert.doesNotMatch(cutover, /cloudAccount = await switchApiOrganization\(preferred\.id\)/);
  assert.match(gateway, /if \(!claims\?\.organizationId\)/);
  assert.match(sw, /proqtrack-v12\.10/);
});
