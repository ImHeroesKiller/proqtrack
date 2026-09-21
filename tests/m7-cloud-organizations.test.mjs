import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as orgServer } from '../worker/organizations.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organization admin normalizes codes and preserves profile metadata', () => {
  assert.equal(orgServer.normalizeCode(' mkb sales 01 '), 'MKBSALES01');
  assert.equal(orgServer.normalizeCode('MKB-01_test'), 'MKB-01_TEST');
  const meta = JSON.parse(orgServer.metadata({
    legalName:'PT Mitra Kreasi Bersama',
    industry:'Outsourcing',
    city:'Jakarta',
    notes:'Tenant production',
  }));
  assert.equal(meta.legalName, 'PT Mitra Kreasi Bersama');
  assert.equal(meta.city, 'Jakarta');
});

test('organization create is D1 authoritative and starts cloud cutover', async () => {
  const worker = await read('worker/organizations.js');
  assert.match(worker, /INSERT INTO core_organizations/);
  assert.match(worker, /INSERT INTO core_sync_state/);
  assert.match(worker, /VALUES\(\?,0,'cloud'/);
  assert.match(worker, /ORGANIZATION_ADMIN_FORBIDDEN/);
  assert.match(worker, /ACTIVE_ORGANIZATION_CANNOT_BE_DISABLED/);
  assert.doesNotMatch(worker, /localStorage/);
});

test('organization UI no longer writes local-only organization records', async () => {
  const ui = await read('src/organization.js');
  assert.match(ui, /await createCloudOrganization/);
  assert.match(ui, /await updateCloudOrganization/);
  assert.match(ui, /await this\.switchTo\(org\.id/);
  assert.doesNotMatch(ui, /createOrganization\(data\)/);
  assert.doesNotMatch(ui, /updateOrganization\(id, data\)/);
});

test('M7 health, PWA and deployment smoke include organization authority', async () => {
  const [hardening, sw, main, workflow, migration] = await Promise.all([
    read('worker/hardening.js'),
    read('sw.js'),
    read('worker/main.js'),
    read('.github/workflows/cloudflare-mvp.yml'),
    read('migrations/0014_cloud_organization_admin.sql'),
  ]);
  assert.match(hardening, /metadata_json/);
  assert.match(sw, /proqtrack-v12/);
  assert.match(sw, /cloud-organizations\.js/);
  assert.match(main, /handleOrganizationAdminRoute/);
  assert.match(workflow, /\/api\/admin\/organizations/);
  assert.match(migration, /ALTER TABLE core_organizations ADD COLUMN metadata_json/);
});
