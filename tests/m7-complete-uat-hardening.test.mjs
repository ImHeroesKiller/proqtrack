import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as accountServer } from '../worker/accounts.js';
import { __test as bulkServer } from '../worker/bulk-employees.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('M7 UAT hardening migration stores only hashed field-device identity', async () => {
  const sql = await read('migrations/0013_m7_uat_hardening.sql');
  assert.match(sql, /core_auth_devices/);
  assert.match(sql, /device_id_hash/);
  assert.match(sql, /device_proof_hash/);
  assert.doesNotMatch(sql, /device_secret/i);
  assert.match(sql, /FOREIGN KEY \(user_id, organization_id\)/);
});

test('account administration hierarchy matches authoritative organization roles', () => {
  assert.equal(accountServer.permittedRole('superadmin','head'), true);
  assert.equal(accountServer.permittedRole('head','admin'), true);
  assert.equal(accountServer.permittedRole('admin','manager'), true);
  assert.equal(accountServer.permittedRole('admin','head'), false);
  assert.equal(accountServer.permittedRole('manager','employee'), false);
  assert.equal(accountServer.canManageTarget('admin','admin','A','B'), false);
  assert.equal(accountServer.canManageTarget('admin','manager','A','B'), true);
  assert.equal(accountServer.validEmail(' User@Example.com '), 'user@example.com');
});

test('frontend admin role parity matches broad server authorization', async () => {
  const [db, app, cutover, offline, settings] = await Promise.all([
    read('src/lib/db.js'), read('src/app.js'), read('src/cloud-cutover.js'),
    read('src/lib/offline-login.js'), read('src/account-settings.js'),
  ]);
  assert.match(db, /role === 'head' \|\| role === 'admin' \|\| role === 'superadmin'/);
  assert.match(app, /account\?\.role === 'admin'.*Admin/);
  assert.match(cutover, /account\?\.role === 'admin'.*Admin/);
  assert.match(offline, /account\?\.role === 'admin'.*Admin/);
  assert.match(settings, /\['head','admin','superadmin'\]/);
});

test('superadmin organization switch changes bearer session before local workspace', async () => {
  const [uploads, cloud, org] = await Promise.all([
    read('src/lib/uploads.js'), read('src/lib/cloud-data.js'), read('src/organization.js'),
  ]);
  assert.match(uploads, /\/api\/auth\/switch-organization/);
  assert.match(cloud, /await switchApiOrganization\(target\)/);
  assert.match(cloud, /organization_switch_rollback_failed/);
  const switchStart = org.indexOf('async switchTo');
  const cloudIndex = org.indexOf('await switchCloudOrganization', switchStart);
  const localIndex = org.indexOf('setCurrentOrgId(target)', switchStart);
  assert.ok(cloudIndex > switchStart && localIndex > cloudIndex, 'local tenant changes only after authoritative cloud switch');
});

test('field login is globally device-bound and supports first cloud pairing', async () => {
  const [authz, uploads, cutover, db] = await Promise.all([
    read('worker/authz.js'), read('src/lib/uploads.js'), read('src/cloud-cutover.js'), read('src/lib/db.js'),
  ]);
  assert.match(authz, /enforceFieldDevice/);
  assert.match(authz, /DEVICE_ACCESS_DENIED/);
  assert.match(authz, /core_auth_devices/);
  assert.match(uploads, /deviceProofFor/);
  assert.match(cutover, /pairCloudAuthenticatedSalesDevice/);
  assert.doesNotMatch(cutover, /Perangkat Field Sales belum lolos verifikasi lokal/);
  assert.match(db, /export function pairCloudAuthenticatedSalesDevice/);
});

test('password and profile settings update server authority, not local storage only', async () => {
  const [authz, client, settings] = await Promise.all([
    read('worker/authz.js'), read('src/lib/cloud-accounts.js'), read('src/account-settings.js'),
  ]);
  assert.match(authz, /\/api\/auth\/change-password/);
  assert.match(authz, /\/api\/auth\/profile/);
  assert.match(client, /changeCloudPassword/);
  assert.match(client, /updateCloudProfile/);
  assert.match(settings, /await changeCloudPassword/);
  assert.match(settings, /await updateCloudProfile/);
  assert.doesNotMatch(settings, /changePassword\(account\(\)\.id/);
});

test('account management UI uses authoritative admin API for create update status and reset', async () => {
  const [main, server, client, settings, workflow] = await Promise.all([
    read('worker/main.js'), read('worker/accounts.js'), read('src/lib/cloud-accounts.js'),
    read('src/account-settings.js'), read('.github/workflows/cloudflare-mvp.yml'),
  ]);
  assert.match(main, /handleAccountAdminRoute/);
  assert.match(server, /reset-device/);
  assert.match(client, /\/api\/admin\/accounts/);
  assert.match(settings, /await createCloudAccount/);
  assert.match(settings, /await updateCloudAccount/);
  assert.match(settings, /await resetCloudAccountDevice/);
  assert.match(workflow, /\/api\/admin\/accounts/);
});

test('bulk UAT rejects cross-project supervisors and role downgrade ambiguity', async () => {
  const worker = await read('worker/bulk-employees.js');
  assert.match(worker, /SUPERVISOR_CANNOT_BE_SELF/);
  assert.match(worker, /SUPERVISOR_ASSIGNMENT_NOT_COVERING_PROJECT/);
  assert.match(worker, /LOGIN_ROLE_DOWNGRADE_REQUIRES_ACCOUNT_MANAGEMENT/);
  assert.match(worker, /LOGIN_ROLE_WILL_UPGRADE_SUPERVISOR/);
  assert.match(worker, /UPDATE core_auth_sessions[\s\S]*status='revoked'/);
  assert.equal(bulkServer.loginRole('SPG'), 'employee');
});

test('bulk retry replay preserves credentials and visible totals', async () => {
  const client = await read('src/bulk-employees.js');
  assert.match(client, /if \(!data\.replayed\)/);
  assert.match(client, /chunkPreview\.filter\(row => row\.action === 'create'\)/);
  assert.match(client, /for \(const credential of data\.credentials \|\| \[\]\)/);
  assert.match(client, /credentialKeys/);
});

test('single employee create edit and deactivate use authoritative bulk path', async () => {
  const [app, bulk] = await Promise.all([read('src/app.js'), read('src/bulk-employees.js')]);
  assert.match(app, /await window\.BulkEmployees\.createSingleEmployee/);
  assert.match(app, /await window\.BulkEmployees\.updateSingleEmployee/);
  assert.match(app, /Nonaktifkan karyawan ini\?/);
  assert.doesNotMatch(app, /Karyawan dan akun login berhasil dibuat/);
  assert.match(bulk, /sourceName: 'single-employee-form'/);
  assert.match(bulk, /sourceName: 'single-employee-edit'/);
});

test('M7 health and PWA require UAT hardening generation', async () => {
  const [hardening, sw, workflow] = await Promise.all([
    read('worker/hardening.js'), read('sw.js'), read('.github/workflows/cloudflare-mvp.yml'),
  ]);
  assert.match(hardening, /uatSchemaReady/);
  assert.match(hardening, /core_auth_devices/);
  assert.match(sw, /proqtrack-v12/);
  assert.match(sw, /\.\/src\/lib\/cloud-accounts\.js/);
  assert.match(workflow, /uatSchema/);
});


test('account create attaches an existing global identity without changing its password', async () => {
  const [server, client] = await Promise.all([
    read('worker/accounts.js'),
    read('src/lib/cloud-accounts.js'),
  ]);
  assert.match(server, /attachExisting = body\.attachExisting === true/);
  assert.match(server, /ACCOUNT_ALREADY_IN_ORGANIZATION/);
  assert.match(server, /ACCOUNT_IS_GLOBAL_SUPERADMIN/);
  assert.match(server, /EXISTING_ACCOUNT_DISABLED/);
  assert.match(server, /attach_existing_account/);
  assert.match(server, /passwordUnchanged:true/);
  assert.match(client, /attachExisting:true/);
  assert.match(client, /data\.passwordUnchanged !== true/);
});

test('account management UI mirrors server hierarchy and prevents duplicate mutations', async () => {
  const settings = await read('src/account-settings.js');
  assert.match(settings, /function managedRoles\(actorRole\)/);
  assert.match(settings, /function canManageAccount\(actor, target\)/);
  assert.match(settings, /function canChangeAccountStatus\(actor, target\)/);
  assert.match(settings, /let accountSaveInFlight = false/);
  assert.match(settings, /if \(accountSaveInFlight\) return/);
  assert.match(settings, /submit\.disabled = true/);
  assert.match(settings, /ACCOUNT_ALREADY_IN_ORGANIZATION/);
  assert.match(settings, /Akun existing ditautkan\. Password lama tetap berlaku\./);
  assert.match(settings, /data\.role = current\.role/);
  assert.match(settings, /data\.status = 'active'/);
});
