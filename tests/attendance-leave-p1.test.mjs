import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const attendanceDomain = readFileSync(new URL('../src/lib/db-attendance-leave.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../src/types/index.js', import.meta.url), 'utf8');

test('P1 attendance self service is today-only and project-period scoped', () => {
  assert.match(worker, /ATTENDANCE_SELF_SERVICE_TODAY_ONLY/);
  assert.match(worker, /ATTENDANCE_OUTSIDE_PROJECT_PERIOD/);
  assert.match(worker, /ATTENDANCE_APPROVED_LEAVE_CONFLICT/);
  assert.match(attendanceDomain, /Absensi mandiri hanya dapat dilakukan untuk hari ini/);
  assert.match(attendanceDomain, /Tanggal absensi berada di luar periode project/);
});

test('P1 manual attendance supports one-way checkout lifecycle', () => {
  assert.match(db, /export function checkOutAttendance/);
  assert.match(worker, /ATTENDANCE_CHECKOUT_BEFORE_CHECKIN/);
  assert.match(worker, /ATTENDANCE_CHECKOUT_IMMUTABLE/);
  assert.match(worker, /row\.checkedOutBy = claims\.sub/);
  assert.match(field, /FS\.checkOutAttendance/);
  assert.match(field, /Check-out attendance tercatat/);
});

test('P1 attendance correction requires governed audit trail', () => {
  assert.match(worker, /ATTENDANCE_CORRECTION_REASON_REQUIRED/);
  assert.match(worker, /correctionPrevious/);
  assert.match(worker, /correctionCount/);
  assert.match(worker, /row\.correctedBy = claims\.sub/);
  assert.match(attendanceDomain, /Alasan koreksi wajib minimal 10 karakter/);
  assert.match(app, /FT\.openAttendanceCorrection/);
  assert.match(app, /FT\.saveAttendanceCorrection/);
});

test('P1 Visit lifecycle is independent from employee attendance', () => {
  assert.match(worker, /async function visitAttendanceStatements\(\) \{[\s\S]*return \[\]/);
  assert.match(worker, /sourceMode:'manual'/);
  assert.doesNotMatch(worker, /ATTENDANCE_VISIT_DERIVED_ONLY/);
  assert.match(field, /Check In Karyawan/);
  assert.match(field, /Attendance karyawan terpisah dari Visit/);
});

test('P1 approved leave blocks attendance and visit check-in', () => {
  assert.match(worker, /ATTENDANCE_APPROVED_LEAVE_CONFLICT/);
  assert.match(worker, /VISIT_APPROVED_LEAVE_CONFLICT/);
  assert.match(app, /ijin\/cuti pada tanggal ini sudah disetujui/);
});

test('P1 leave governance prevents self review and requires rejection reason', () => {
  assert.match(worker, /LEAVE_SELF_REVIEW_FORBIDDEN/);
  assert.match(worker, /LEAVE_REJECTION_NOTE_REQUIRED/);
  assert.match(worker, /LEAVE_ATTENDANCE_CONFLICT/);
  assert.match(attendanceDomain, /Pengajuan tidak boleh direview oleh pengaju sendiri/);
  assert.match(app, /FT\.openLeaveDecision/);
  assert.match(app, /name="decisionNote"/);
});

test('P1 employee can withdraw pending leave without deleting audit history', () => {
  assert.match(worker, /requestedDecisionKind === 'withdrawn'/);
  assert.match(worker, /row\.withdrawnBy = claims\.sub/);
  assert.match(worker, /currentStatus === 'pending' && nextStatus === 'rejected'/);
  assert.match(db, /export function withdrawLeave/);
  assert.match(attendanceDomain, /tidak dapat dihapus\. Gunakan withdrawal/);
  assert.match(app, /FT\.withdrawMyLeave/);
});

test('P1 attendance source is fixed to explicit employee check-in', () => {
  assert.match(worker, /row\.attendanceSourceMode = 'manual'/);
  assert.match(db, /const sourceMode = 'manual'/);
  assert.doesNotMatch(worker, /PROJECT_ATTENDANCE_SOURCE_IN_USE/);
});
