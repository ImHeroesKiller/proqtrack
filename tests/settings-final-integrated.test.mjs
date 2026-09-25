import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authorizeOperationalChange } from '../worker/operations.js';
import { settingsTabsFor } from '../src/lib/settings-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('final Settings role matrix exposes only intended tabs', () => {
  const expected = {
    superadmin:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    head:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    admin:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    manager:['profil','keamanan','tampilan','katalog','sesi'],
    supervisor:['profil','keamanan','tampilan','sesi'],
    employee:['profil','keamanan','tampilan','perangkat','sesi'],
  };
  for (const [role,tabs] of Object.entries(expected)) {
    assert.deepEqual(settingsTabsFor({ role }).map(([id]) => id),tabs,role);
  }
});

test('manager project authority permits catalog metadata but blocks Attendance policy changes', () => {
  const claims = {
    sub:'USR-MANAGER',
    role:'manager',
    projectIds:['PRJ-1'],
    clientIds:['CL-1'],
  };
  const existing = {
    id:'PRJ-1',
    client_id:'CL-1',
    metadata_json:JSON.stringify({
      attendanceSourceMode:'manual',
      attendanceLateAfter:'09:00',
      storeCatalog:{ allowNewOutlet:true },
      modules:{ newOutlet:true },
    }),
  };

  const catalogRow = {
    id:'PRJ-1',
    clientId:'CL-1',
    attendanceSourceMode:'manual',
    attendanceLateAfter:'09:00',
    storeCatalog:{ allowNewOutlet:false },
    modules:{ newOutlet:false },
  };
  assert.equal(
    authorizeOperationalChange(claims,'projects',{ op:'upsert',row:catalogRow },{ existing }),
    true,
  );

  assert.equal(
    authorizeOperationalChange(claims,'projects',{
      op:'upsert',
      row:{ ...catalogRow, attendanceSourceMode:'visit' },
    },{ existing }),
    false,
  );
  assert.equal(
    authorizeOperationalChange(claims,'projects',{
      op:'upsert',
      row:{ ...catalogRow, attendanceLateAfter:'10:00' },
    },{ existing }),
    false,
  );
});

test('final Settings production UAT is a deployment release gate', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /Run Settings final integrated production UAT/);
  assert.match(workflow, /node scripts\/settings-production-uat\.mjs/);
  assert.match(workflow, /Cool down auth rate window before Settings UAT/);
});

test('Settings production UAT covers all roles and critical Settings boundaries', async () => {
  const script = await read('scripts/settings-production-uat.mjs');
  for (const role of ['superadmin','head','admin','manager','supervisor','employee']) {
    assert.match(script,new RegExp(`${role}:\\{id:`));
  }
  assert.match(script, /ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN/);
  assert.match(script, /ACCOUNT_GLOBAL_PASSWORD_EDIT_FORBIDDEN/);
  assert.match(script, /DEVICE_ACCESS_DENIED/);
  assert.match(script, /ORGANIZATION_PROFILE_FORBIDDEN/);
  assert.match(script, /manager-attendance-policy-denied/);
  assert.match(script, /logout-all/);
  assert.match(script, /assets\/settings\.css/);
});
