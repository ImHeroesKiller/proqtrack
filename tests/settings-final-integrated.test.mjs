import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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


test('final Settings production smoke scripts pass syntax checks', () => {
  execFileSync('bash',['-n','scripts/settings-admin-smoke.sh'],{ stdio:'pipe' });
  execFileSync(process.execPath,['--check','scripts/attendance-leave-production-uat.mjs'],{ stdio:'pipe' });
});
