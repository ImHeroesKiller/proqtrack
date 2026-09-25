import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3A attendance and leave API remains stable behind db facade', async () => {
  const [db, domain] = await Promise.all([
    read('src/lib/db.js'),
    read('src/lib/db-attendance-leave.js'),
  ]);

  assert.match(db, /createAttendanceLeaveDomain/);
  assert.match(db, /export function createAttendance\(data\) \{ return attendanceLeaveDomain\.createAttendance\(data\); \}/);
  assert.match(db, /export function updateLeave\(id, data\) \{ return attendanceLeaveDomain\.updateLeave\(id, data\); \}/);

  assert.match(domain, /function createAttendance\(data\)/);
  assert.match(domain, /function updateAttendance\(id, data\)/);
  assert.match(domain, /function createLeave\(data\)/);
  assert.match(domain, /function updateLeave\(id, data\)/);
});

test('P3A attendance leave domain preserves lifecycle and authority rules', async () => {
  const domain = await read('src/lib/db-attendance-leave.js');
  assert.match(domain, /assertCanAccessEmployee\(employeeId\)/);
  assert.match(domain, /sourceMode === 'visit'/);
  assert.match(domain, /Absensi turunan Visit harus dikoreksi dari workflow Visit/);
  assert.match(domain, /Pengajuan tidak boleh direview oleh pengaju sendiri/);
  assert.match(domain, /attendanceConflict/);
  assert.doesNotMatch(domain, /localStorage/);
  assert.doesNotMatch(domain, /window\.FT/);
});
