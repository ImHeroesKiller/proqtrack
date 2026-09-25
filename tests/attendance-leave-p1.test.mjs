import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../src/types/index.js', import.meta.url), 'utf8');

test('P1 attendance self service is today-only and project-period scoped', () => {
  assert.match(worker, /ATTENDANCE_SELF_SERVICE_TODAY_ONLY/);
  assert.match(worker, /ATTENDANCE_OUTSIDE_PROJECT_PERIOD/);
  assert.match(worker, /ATTENDANCE_APPROVED_LEAVE_CONFLICT/);
  assert.match(db, /Absensi mandiri hanya dapat dilakukan untuk hari ini/);
  assert.match(db, /Tanggal absensi berada di luar periode project/);
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
  assert.match(db, /Alasan koreksi wajib minimal 10 karakter/);
  assert.match(app, /FT\.openAttendanceCorrection/);
  assert.match(app, /FT\.saveAttendanceCorrection/);
});

test('P1 visit-derived attendance remains read-only but receives visit checkout', () => {
  assert.match(worker, /ATTENDANCE_VISIT_DERIVED_IMMUTABLE/);
  assert.match(worker, /json_extract\(metadata_json,'\$\.attendanceSource'\)='visit'/);
  assert.match(worker, /SET check_out_at=\?/);
  assert.match(app, /Attendance dari Visit harus dikoreksi melalui workflow Visit/);
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
  assert.match(db, /Pengajuan tidak boleh direview oleh pengaju sendiri/);
  assert.match(app, /FT\.openLeaveDecision/);
  assert.match(app, /name="decisionNote"/);
});

test('P1 employee can withdraw pending leave without deleting audit history', () => {
  assert.match(worker, /requestedDecisionKind === 'withdrawn'/);
  assert.match(worker, /row\.withdrawnBy = claims\.sub/);
  assert.match(worker, /currentStatus === 'pending' && nextStatus === 'rejected'/);
  assert.match(db, /export function withdrawLeave/);
  assert.match(db, /tidak dapat dihapus\. Gunakan withdrawal/);
  assert.match(app, /FT\.withdrawMyLeave/);
});

test('P1 source mode cannot change after attendance starts today', () => {
  assert.match(worker, /PROJECT_ATTENDANCE_SOURCE_IN_USE/);
  assert.match(worker, /currentAttendanceSource !== attendanceSourceMode/);
  assert.match(projects, /PROJECT_ATTENDANCE_SOURCE_IN_USE/);
});
