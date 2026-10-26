import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProjectManagementMigration } from '../src/types/project-management-migration.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy project migration never closes cloud assignment because account cache is partial', () => {
  const db = {
    employees:[{ id:'EMP-1', organizationId:'ORG-1', status:'active' }],
    accounts:[],
    clients:[],
    projects:[{ id:'PRJ-1', organizationId:'ORG-1', startDate:'2026-01-01', endDate:'2026-12-31' }],
    projectAssignments:[{
      id:'ASN-1',
      organizationId:'ORG-1',
      projectId:'PRJ-1',
      employeeId:'EMP-1',
      roleOnProject:'sales',
      supervisorId:'EMP-SUP',
      allocationPercent:100,
      startDate:'2026-01-01',
      endDate:'2026-12-31',
      status:'active',
    }],
    projectSettings:[],
    visits:[], competitorIntel:[], fieldPhotos:[], priceObservations:[], stocks:[],
  };
  const migration = createProjectManagementMigration({
    readDB:() => db,
    writeDB:() => {},
    DEFAULT_ORG_ID:'ORG-1',
    allModules:['visits'],
    now:() => '2026-10-26T00:00:00.000Z',
  });
  migration.migrateV7();
  assert.equal(db.projectAssignments[0].status, 'active');
  assert.equal('removedAt' in db.projectAssignments[0], false);
  assert.equal('removalReason' in db.projectAssignments[0], false);
});

test('legacy removed assignment only canonicalizes forward to ended', () => {
  const db = {
    employees:[], accounts:[], clients:[],
    projects:[{ id:'PRJ-1', organizationId:'ORG-1', startDate:'2026-01-01', endDate:'2026-12-31' }],
    projectAssignments:[{
      id:'ASN-1', organizationId:'ORG-1', projectId:'PRJ-1', employeeId:'EMP-1',
      roleOnProject:'sales', status:'removed', startDate:'2026-01-01', endDate:'2026-12-31',
    }],
    projectSettings:[], visits:[], competitorIntel:[], fieldPhotos:[], priceObservations:[], stocks:[],
  };
  const migration = createProjectManagementMigration({
    readDB:() => db, writeDB:() => {}, DEFAULT_ORG_ID:'ORG-1',
    allModules:[], now:() => '2026-10-26T00:00:00.000Z',
  });
  migration.migrateV7();
  assert.equal(db.projectAssignments[0].status, 'ended');
});

test('logout treats already revoked session as idempotent success', async () => {
  const uploads = await read('src/lib/uploads.js');
  assert.match(uploads, /res\.status === 401/);
  assert.match(uploads, /SESSION_REVOKED/);
  assert.match(uploads, /return true;/);

  const cutover = await read('src/cloud-cutover.js');
  assert.match(cutover, /SESSION_REVOKED/);
  assert.match(cutover, /cloud_logout_failed/);
});

test('account creation refreshes authoritative list before duplicate check', async () => {
  const settings = await read('src/account-settings.js');
  const start = settings.indexOf('async saveAccount');
  const end = settings.indexOf('async resetDevice', start);
  const block = settings.slice(start, end);
  const refresh = block.indexOf('await syncCloudAccounts()');
  const duplicate = block.indexOf('const duplicate = getAccounts()');
  const create = block.indexOf('createCloudAccount(data)');
  assert.ok(refresh >= 0 && duplicate > refresh && create > duplicate);
});

test('service worker registration bypasses cache and reloads once on controller change', async () => {
  const bootstrap = await read('src/m4-bootstrap.js');
  assert.match(bootstrap, /updateViaCache:'none'/);
  assert.match(bootstrap, /registration\.update\(\)/);
  assert.match(bootstrap, /controllerchange/);
  assert.match(bootstrap, /location\.reload\(\)/);

  const headers = await read('_headers');
  assert.match(headers, /\/sw\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
});

test('employees and project management templates contain no executable inline event attributes', async () => {
  const sources = await Promise.all([
    read('src/routes/employees-page.js'),
    read('src/types/index.js'),
    read('src/app.js'),
    read('src/account-settings.js'),
  ]);
  const inline = /\s(?:onclick|onchange|onsubmit|oninput|onkeydown)\s*=/i;
  for (const source of sources) assert.doesNotMatch(source, inline);
});
