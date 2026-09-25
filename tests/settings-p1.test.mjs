import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Settings P1 migration adds authoritative profile display name', async () => {
  const sql = await read('migrations/0028_settings_p1_profile_identity.sql');
  assert.match(sql, /ALTER TABLE auth_users ADD COLUMN display_name TEXT/);
});

test('Settings P1 profile persists name email phone and area in cloud authority', async () => {
  const [authz, client, settings] = await Promise.all([
    read('worker/authz.js'),
    read('src/lib/cloud-accounts.js'),
    read('src/account-settings.js'),
  ]);
  assert.match(authz, /UPDATE auth_users SET email=\?,display_name=\?/);
  assert.match(authz, /SET email=\?,full_name=\?,phone=\?,metadata_json=\?/);
  assert.match(authz, /metadata\.area = area/);
  assert.match(authz, /PROFILE_NAME_REQUIRED/);
  assert.match(client, /updateCloudProfile\(\{ email, name, phone = '', area = '' \}/);
  assert.match(client, /body:JSON\.stringify\(\{ email, name, phone, area \}\)/);
  assert.match(settings, /phone:data\.phone \|\| ''/);
  assert.match(settings, /area:data\.area \|\| ''/);
  assert.doesNotMatch(settings, /updateOwnProfile\(/);
});

test('Settings P1 device tab uses server binding and cloud login cannot be vetoed locally', async () => {
  const [authz, cloud, db, settings] = await Promise.all([
    read('worker/authz.js'),
    read('src/lib/cloud-data.js'),
    read('src/lib/db.js'),
    read('src/account-settings.js'),
  ]);
  assert.match(authz, /async function deviceSnapshot/);
  assert.match(authz, /deviceBound:row\?\.status === 'active'/);
  assert.match(cloud, /deviceBound: cloudAccount\.deviceBound === true/);
  assert.match(db, /if \(acc\.cloudIdentity\)[\s\S]*Local device fields are compatibility cache only/);
  assert.match(settings, /acc\.deviceBound/);
  assert.match(settings, /deviceLastSeenAt/);
  assert.doesNotMatch(settings, /Fingerprint/);
  assert.doesNotMatch(settings, /Superadmin test device/);
});

test('Settings P1 display preferences are valid for non-admin roles', async () => {
  const [db, settings] = await Promise.all([
    read('src/lib/db.js'),
    read('src/account-settings.js'),
  ]);
  const updateStart = db.indexOf('export function updateAppSettings');
  const updateEnd = db.indexOf('export function createAccount', updateStart);
  const body = db.slice(updateStart, updateEnd);
  assert.doesNotMatch(body, /'notifyLeave'/);
  assert.doesNotMatch(body, /'notifyLowStock'/);
  assert.match(settings, /notifyLeave: form\.notifyLeave\.checked/);
  assert.match(settings, /notifyLowStock: form\.notifyLowStock\.checked/);
});

test('Settings P1 exposes verified logout-all session control', async () => {
  const [uploads, settings, authz] = await Promise.all([
    read('src/lib/uploads.js'),
    read('src/account-settings.js'),
    read('worker/authz.js'),
  ]);
  assert.match(uploads, /all \? '\/api\/auth\/logout-all' : '\/api\/auth\/logout'/);
  assert.match(uploads, /if \(!res\.ok\)/);
  assert.match(settings, /async logoutAllSessions\(\)/);
  assert.match(settings, /await revokeApiSession\(\{ all:true \}\)/);
  assert.match(settings, /Keluar dari semua perangkat/);
  assert.match(authz, /revokeAllSessions\(env, claims\.sub\)/);
});

test('Settings P1 account management cannot mutate existing identity or employee name', async () => {
  const [server, settings] = await Promise.all([
    read('worker/accounts.js'),
    read('src/account-settings.js'),
  ]);
  assert.match(server, /u\.display_name/);
  assert.match(server, /row\.full_name \|\| row\.display_name \|\| row\.email/);
  assert.doesNotMatch(server, /full_name=CASE WHEN \?<>'' THEN \? ELSE full_name END/);
  assert.match(settings, /Nama profil diubah oleh pemilik akun/);
  assert.match(settings, /Email adalah identitas global/);
  assert.match(settings, /Credential global tidak dapat diubah oleh admin tenant/);
});

test('Settings P1 duplicate-submit guards cover profile password and session actions', async () => {
  const settings = await read('src/account-settings.js');
  assert.match(settings, /let profileSaveInFlight = false/);
  assert.match(settings, /let passwordSaveInFlight = false/);
  assert.match(settings, /let sessionActionInFlight = false/);
  assert.match(settings, /if \(profileSaveInFlight\) return/);
  assert.match(settings, /if \(passwordSaveInFlight\) return/);
  assert.match(settings, /if \(sessionActionInFlight\) return/);
});
