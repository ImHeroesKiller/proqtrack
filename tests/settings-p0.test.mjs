import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Settings P0 blocks tenant admins from mutating global credentials', async () => {
  const [server, ui] = await Promise.all([
    read('worker/accounts.js'),
    read('src/account-settings.js'),
  ]);
  assert.match(server, /ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN/);
  assert.match(server, /ACCOUNT_GLOBAL_PASSWORD_EDIT_FORBIDDEN/);
  assert.doesNotMatch(server, /UPDATE auth_users SET email=\? WHERE id=\?/);
  assert.match(ui, /Email adalah identitas global/);
  assert.match(ui, /Credential global tidak dapat diubah oleh admin tenant/);
  assert.match(ui, /delete data\.email/);
  assert.match(ui, /delete data\.password/);
});

test('Settings P0 scopes account and device session revocation to organization', async () => {
  const server = await read('worker/accounts.js');
  const scoped = server.match(/WHERE user_id=\? AND organization_id=\?[^\n]*status='active'/g) || [];
  assert.ok(scoped.length >= 2, 'account mutation and device reset must both scope session revocation');
  assert.match(server, /bind\(userId,claims\.organizationId,String\(userId\)/);
  assert.match(server, /bind\(userId,claims\.organizationId\)/);
});

test('Settings P0 attendance UI uses authoritative project source and cutoff', async () => {
  const [ui, db] = await Promise.all([
    read('src/account-settings.js'),
    read('src/lib/db.js'),
  ]);
  assert.match(ui, /Attendance per project/);
  assert.match(ui, /saveAttendanceProjectSettings/);
  assert.match(ui, /commitOperationalChanges\(\[\{ entity:'projects', op:'upsert', row:nextProject \}\]\)/);
  assert.match(ui, /saveProjectAttendanceSettings/);
  assert.doesNotMatch(ui, /name="attendanceMode"/);
  assert.doesNotMatch(ui, /attendanceRadiusM/);
  assert.doesNotMatch(ui, /officeLat/);
  assert.match(ui, /async addAttendancePoint\(event\)/);
  assert.match(ui, /entity:'attendancePoints', op:'upsert'/);
  assert.match(ui, /Attendance point tersimpan di cloud/);
  assert.match(db, /export function saveProjectAttendanceSettings/);
});

test('Settings P0 outlet catalog persists through project cloud metadata', async () => {
  const [ui, db, worker] = await Promise.all([
    read('src/account-settings.js'),
    read('src/lib/db.js'),
    read('worker/operations.js'),
  ]);
  assert.match(ui, /const nextProject = \{[\s\S]*storeCatalog:catalog/);
  assert.match(ui, /commitOperationalChanges\(\[\{ entity:'projects', op:'upsert', row:nextProject \}\]\)/);
  assert.match(ui, /Outlet catalog tersimpan di cloud/);
  assert.match(db, /project\.storeCatalog && typeof project\.storeCatalog === 'object'/);
  assert.match(db, /project\.modules && typeof project\.modules === 'object'/);
  assert.match(db, /project\.storeCatalog = \{/);
  assert.doesNotMatch(db.slice(db.indexOf('export function saveProjectStoreSettings'), db.indexOf('export function outletProjectsForEmployee')), /db\.projectSettings\.push/);
  assert.match(worker, /Object\.assign\(row, parseMetadata\(existing\.metadata_json\), incoming\)/);
});

test('Settings P0 project writes keep duplicate-action guards', async () => {
  const ui = await read('src/account-settings.js');
  assert.match(ui, /const settingsProjectSaveInFlight = new Set\(\)/);
  assert.match(ui, /settingsProjectSaveInFlight\.has\(key\)/);
  assert.match(ui, /submit\.disabled = true/);
  assert.match(ui, /settingsProjectSaveInFlight\.delete\(key\)/);
});
