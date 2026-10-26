import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const attendanceDomain = readFileSync(new URL('../src/lib/db-attendance-leave.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../src/types/index.js', import.meta.url), 'utf8');

test('P0 project config fixes attendance to explicit employee check-in', () => {
  assert.match(projects, /name="attendanceSourceMode" value="manual"/);
  assert.doesNotMatch(projects, /Otomatis dari Visit/);
  assert.match(projects, /name="attendanceLateAfter"/);
  assert.match(projects, /attendanceSourceMode: "manual"/);
  assert.match(worker, /row\.attendanceSourceMode = 'manual'/);
  assert.match(worker, /PROJECT_INVALID_ATTENDANCE_CUTOFF/);
});

test('P0 employee attendance is project-scoped explicit and cloud-confirmed', () => {
  assert.match(db, /getProjectAttendancePolicy\(projectId\)/);
  assert.match(db, /getEmployeeAttendanceProjects/);
  assert.doesNotMatch(attendanceDomain, /Absensi project ini dihitung otomatis dari kunjungan/);
  assert.match(field, /Check In Karyawan/);
  assert.match(field, /await waitForOperationalSync\(\)/);
  assert.match(field, /await refreshOperationalData\(getDB\(\), getActor\(\)\)/);
});

test('P0 server accepts explicit employee attendance independently from Visit', () => {
  assert.doesNotMatch(worker, /ATTENDANCE_VISIT_DERIVED_ONLY/);
  assert.match(worker, /ATTENDANCE_EMPLOYEE_PROJECT_MISMATCH/);
  assert.match(worker, /ATTENDANCE_SELF_ONLY/);
  assert.match(worker, /attendance:manual:/);
});

test('P0 visit check-in never creates employee attendance', () => {
  assert.match(worker, /async function visitAttendanceStatements\(\) \{[\s\S]*return \[\]/);
  assert.doesNotMatch(worker, /attendance:visit:/);
  assert.match(worker, /statements\.push\(\.\.\.await visitAttendanceStatements/);
});

test('P0 attendance round-trip preserves check-in aliases and coordinates', () => {
  assert.match(worker, /checkInTime:checkInAt/);
  assert.match(worker, /checkInLatitude:dbRow\.check_in_latitude/);
  assert.match(worker, /checkInLongitude:dbRow\.check_in_longitude/);
  assert.match(worker, /canonicalAttendanceStatus/);
});

test('P0 leave create cannot forge approval metadata', () => {
  const createStart = attendanceDomain.indexOf('function createLeave(data)');
  const createEnd = attendanceDomain.indexOf('function updateLeave', createStart);
  const createBlock = attendanceDomain.slice(createStart, createEnd);
  assert.match(createBlock, /\.\.\.withOrg\(data\)/);
  assert.match(createBlock, /status:'pending'/);
  assert.match(createBlock, /approverId:null/);
  assert.match(createBlock, /approvedAt:null/);
  assert.ok(createBlock.indexOf("status:'pending'") > createBlock.indexOf('...withOrg(data)'));
  assert.match(worker, /row\.status = 'pending'/);
  assert.match(worker, /row\.approverId = null/);
});

test('P0 leave review stamps approver on server and is cloud-confirmed', () => {
  assert.match(worker, /row\.approverId = claims\.sub/);
  assert.match(worker, /LEAVE_REVIEW_DECISION_REQUIRED/);
  assert.match(worker, /LEAVE_FINAL_IMMUTABLE/);
  assert.match(app, /updateLeave\(id,\s*\{\s*status(?:,\s*decisionNote)?\s*\}\)/);
  assert.match(app, /await waitForOperationalSync\(\)/);
  assert.doesNotMatch(app, /updateLeave\(id, \{ status: 'approved', approverId:/);
});

test('P0 leave overlap and invalid periods fail closed', () => {
  assert.match(worker, /LEAVE_PERIOD_INVALID/);
  assert.match(worker, /LEAVE_PERIOD_CONFLICT/);
  assert.match(worker, /NOT\(end_date<\? OR start_date>\?\)/);
  assert.match(worker, /LEAVE_DELETE_FORBIDDEN/);
});
