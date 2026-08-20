import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword, distanceMeters } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB, resetDB, __resetForTests, authenticate,
  createVisit, getAttendance, getAttendanceEvents,
  detectAreaAttendance, updateAppSettings,
  createFieldPhoto, startRackEvidence, attachRackPhoto,
  getActivityEvidencePairs, rackPairStatus,
  getOutlets,
} = await import('../src/lib/db.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email, dev = device('DEV-EV-1')) {
  const acc = authenticate(email, TEST_PASSWORD, dev);
  assert.ok(acc, `login failed ${email}`);
  setSession(acc);
  return acc;
}

function outletAt(i = 0) {
  const o = getOutlets().find(x => Number.isFinite(Number(x.lat)));
  assert.ok(o, 'need a mapped outlet');
  return o;
}

test('distanceMeters is precise enough for a 50m geofence', () => {
  const m = distanceMeters(-6.2, 106.8, -6.2004, 106.8);
  assert.ok(m > 40 && m < 50);
});

test('entering 50m radius creates auto-geofence attendance and audit', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = outletAt();
  const result = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
  assert.equal(result.skipped, undefined);
  assert.equal(result.event.source, 'auto_geofence');
  assert.equal(result.attendance.source, 'auto_geofence');
  assert.equal(getAttendance().filter(a => a.employeeId === 'EMP001').length >= 1, true);
  assert.ok(getAttendanceEvents().some(e => e.outletId === o.id));
  assert.ok(getDB().auditLogs.some(a => a.action === 'auto_geofence'));
});

test('duplicate trigger while still inside the same outlet is skipped', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = outletAt();
  detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
  const second = detectAreaAttendance({ lat: Number(o.lat) + 0.00005, lng: o.lng, accuracy: 8 });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'still_inside');
  const events = getAttendanceEvents().filter(e => e.employeeId === 'EMP001' && e.outletId === o.id);
  assert.equal(events.length, 1);
});

test('outside radius does not create attendance', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = outletAt();
  const result = detectAreaAttendance({ lat: Number(o.lat) + 1, lng: Number(o.lng) + 1, accuracy: 8 });
  assert.equal(result.reason, 'outside');
  assert.equal(getAttendanceEvents().length, 0);
});

test('invalid GPS and stale/low-accuracy fixes are rejected', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  assert.throws(() => detectAreaAttendance({ lat: 'x', lng: 1 }), /Invalid GPS/);
  assert.throws(() => detectAreaAttendance({ lat: -6.2, lng: 106.8, accuracy: 250 }), /accuracy/);
  const old = new Date(Date.now() - 120_000).toISOString();
  assert.throws(() => detectAreaAttendance({ lat: -6.2, lng: 106.8, accuracy: 10, capturedAt: old }), /Stale/);
});

test('sales cannot run area detection for another employee session', () => {
  prepare();
  login('manager@proqtrack.id');
  const o = outletAt();
  assert.throws(() => detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 }), /Akses ditolak/);
});

test('rack pair requires before before after and binds to one visit', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = outletAt();
  const visit = createVisit({ employeeId: 'EMP001', outletId: o.id, date: '2026-08-20', status: 'checked-in' });
  const other = createVisit({ employeeId: 'EMP001', outletId: o.id, date: '2026-08-21', status: 'checked-in' });
  const before = createFieldPhoto({ employeeId: 'EMP001', visitId: visit.id, outletId: o.id, type: 'rack_before', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
  assert.throws(() => attachRackPhoto(visit.id, 'after', before.id), /before/i);
  const pair = attachRackPhoto(visit.id, 'before', before.id);
  assert.equal(rackPairStatus(pair), 'waiting_after');
  const after = createFieldPhoto({ employeeId: 'EMP001', visitId: visit.id, outletId: o.id, type: 'rack_after', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
  const done = attachRackPhoto(visit.id, 'after', after.id);
  assert.equal(done.status, 'completed');
  assert.throws(() => attachRackPhoto(other.id, 'before', before.id), /another visit/);
});

test('schema catalogs attendanceEvents and activityEvidencePairs', () => {
  prepare();
  const db = getDB();
  assert.equal(db._version, 18);
  assert.ok(Array.isArray(db.attendanceEvents));
  assert.ok(Array.isArray(db.activityEvidencePairs));
});
