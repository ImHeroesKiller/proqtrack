import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword, todayISO } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB,
  resetDB,
  __resetForTests,
  authenticate,
  SCHEMA,
  createOvertime,
  getOvertimes,
  updateOvertime,
  createWfhRequest,
  getWfhRequests,
  createDailyReport,
  getDailyReports,
  clockInAttendance,
  clockOutAttendance,
  getAttendance,
} = await import('../src/lib/db.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email) {
  const acc = authenticate(email, TEST_PASSWORD, device('DEV-HR-1'));
  assert.ok(acc, `login failed for ${email}`);
  setSession(acc);
  return acc;
}

test('schema catalogs overtime, WFH, daily reports, news, and HR contacts', () => {
  prepare();
  const db = getDB();
  assert.ok(SCHEMA.tenantCollections.includes('overtimes'));
  assert.ok(SCHEMA.tenantCollections.includes('wfhRequests'));
  assert.ok(SCHEMA.tenantCollections.includes('dailyReports'));
  assert.ok(Array.isArray(db.overtimes));
  assert.ok(Array.isArray(db.wfhRequests));
  assert.ok(Array.isArray(db.dailyReports));
  assert.ok(db.newsItems.length >= 1);
  assert.ok(db.hrContacts.length >= 1);
});

test('sales can clock in and out once per day', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const inn = clockInAttendance('EMP001');
  assert.ok(inn.checkInTime);
  assert.match(inn.status, /hadir|terlambat/);
  assert.throws(() => clockInAttendance('EMP001'), /Sudah absen masuk/);
  const out = clockOutAttendance('EMP001');
  assert.ok(out.checkOutTime);
  assert.throws(() => clockOutAttendance('EMP001'), /Sudah absen pulang/);
  assert.equal(getAttendance().filter(a => a.employeeId === 'EMP001' && a.date === todayISO()).length, 1);
});

test('sales cannot submit overtime for another employee', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  assert.throws(() => createOvertime({
    employeeId: 'EMP002',
    date: todayISO(),
    hours: 2,
    reason: 'closing',
  }), /Akses ditolak/);
  const row = createOvertime({
    employeeId: 'EMP001',
    date: todayISO(),
    startTime: '18:00',
    endTime: '20:00',
    hours: 2,
    reason: 'stock opname',
  });
  assert.equal(row.status, 'pending');
  assert.equal(getOvertimes().length, 1);
});

test('sales cannot approve their own overtime; manager can', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const row = createOvertime({
    employeeId: 'EMP001',
    date: todayISO(),
    hours: 1.5,
    reason: 'inventory',
  });
  assert.throws(() => updateOvertime(row.id, { status: 'approved' }), /Akses ditolak/);
  login('manager@proqtrack.id');
  const approved = updateOvertime(row.id, { status: 'approved' });
  assert.equal(approved.status, 'approved');
});

test('WFH and daily reports persist through the live cache', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  createWfhRequest({ employeeId: 'EMP001', date: todayISO(), reason: 'anak sakit' });
  createDailyReport({ employeeId: 'EMP001', summary: 'Visit 3 toko', blockers: '', planTomorrow: 'follow up' });
  assert.equal(getWfhRequests().length, 1);
  assert.equal(getDailyReports()[0].status, 'submitted');
  assert.equal(getDailyReports()[0].summary, 'Visit 3 toko');
});
