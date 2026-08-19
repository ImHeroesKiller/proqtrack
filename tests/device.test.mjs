import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword } from '../src/lib/utils.js';

installBrowserShim();

const {
  resetDB,
  __resetForTests,
  authenticate,
  resumeSession,
  resetSalesDevice,
  getDB,
} = await import('../src/lib/db.js');
const { markSuperadminHost, getDeviceIdentity } = await import('../src/lib/device.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

test('first sales login pairs the device; a second device is rejected', () => {
  prepare();
  const phone = device('DEV-BUDI', 'budi-secret');
  const acc = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, phone);
  assert.ok(acc.deviceId === 'DEV-BUDI' || getDB().accounts.find(a => a.id === acc.id).deviceId === 'DEV-BUDI');
  const row = getDB().accounts.find(a => a.email === 'budi.santoso@proqtrack.id');
  assert.equal(row.deviceId, 'DEV-BUDI');
  assert.ok(row.deviceBinding);
  assert.match(row.deviceBinding, /^sha256\$/);
  assert.throws(
    () => authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-OTHER', 'other-secret')),
    /perangkat lain/i,
  );
});

test('copying only the device id is not enough without the device secret', () => {
  prepare();
  authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-BUDI', 'real-secret'));
  assert.throws(
    () => authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-BUDI', 'spoofed-secret')),
    /Sidik perangkat/,
  );
});

test('legacy pairs without a binding are backfilled on the same device', () => {
  prepare();
  const phone = device('DEV-LEGACY', 'legacy-secret');
  authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, phone);
  const row = getDB().accounts.find(a => a.email === 'budi.santoso@proqtrack.id');
  row.deviceBinding = null;
  const again = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, phone);
  assert.ok(again);
  assert.ok(getDB().accounts.find(a => a.id === again.id).deviceBinding);
});

test('superadmin host on this machine can sign in as paired sales', () => {
  prepare();
  const host = device('DEV-HOST', 'host-secret');
  markSuperadminHost(host);
  localStorage.setItem('proqtrack_device_id_v1', host.id);
  authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-PHONE', 'phone-secret'));
  const bypass = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, host);
  assert.ok(bypass);
});

test('manager can reset a sales device so a new phone can pair', () => {
  prepare();
  authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-OLD', 'old-secret'));
  const manager = authenticate('manager@proqtrack.id', TEST_PASSWORD, device('DEV-MGR', 'mgr-secret'));
  setSession(manager);
  const sales = getDB().accounts.find(a => a.email === 'budi.santoso@proqtrack.id');
  resetSalesDevice(sales.id);
  const fresh = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, device('DEV-NEW', 'new-secret'));
  assert.ok(fresh);
  assert.equal(getDB().accounts.find(a => a.id === sales.id).deviceId, 'DEV-NEW');
});

test('one physical device cannot pair to two sales accounts', () => {
  prepare();
  const shared = device('DEV-SHARED', 'shared-secret');
  assert.ok(authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, shared));
  assert.throws(
    () => authenticate('siti.nurhaliza@proqtrack.id', TEST_PASSWORD, shared),
    /sudah terpasang ke akun sales lain/,
  );
});

test('getDeviceIdentity persists id and secret separately', () => {
  localStorage.removeItem('proqtrack_device_id_v1');
  localStorage.removeItem('proqtrack_device_secret_v1');
  const a = getDeviceIdentity();
  const b = getDeviceIdentity();
  assert.equal(a.id, b.id);
  assert.equal(a.secret, b.secret);
  assert.ok(a.id.startsWith('DEV-'));
  assert.ok(a.secret.startsWith('SEC-'));
});

test('resumeSession fails when the binding does not match', () => {
  prepare();
  const phone = device('DEV-RESUME', 'resume-secret');
  const acc = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, phone);
  assert.equal(resumeSession(acc.id, device('DEV-RESUME', 'wrong-secret')), null);
  assert.ok(resumeSession(acc.id, phone));
});
