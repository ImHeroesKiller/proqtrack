import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const field = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const attendancePages = readFileSync(new URL('../src/routes/attendance-leave-pages.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/ui-2026.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/lib/attendance-leave-ui.js', import.meta.url), 'utf8');

test('P2 attendance manager exposes operational filters and result count', () => {
  assert.match(attendancePages, /id="attProjectFilter"/);
  assert.match(attendancePages, /id="attStatusFilter"/);
  assert.match(attendancePages, /id="attSourceFilter"/);
  assert.match(attendancePages, /id="attDateFrom"/);
  assert.match(attendancePages, /id="attDateTo"/);
  assert.match(attendancePages, /id="attResultCount"/);
  assert.match(app, /FT\.resetAttendanceFilters/);
});

test('P2 attendance detail exposes source and correction audit', () => {
  assert.match(app, /FT\.viewAttendance/);
  assert.match(app, /Audit koreksi terakhir/);
  assert.match(app, /correctionCount/);
  assert.match(app, /correctedBy/);
  assert.match(app, /ops-detail-grid/);
});

test('P2 leave queue can filter status type and overlapping period', () => {
  assert.match(attendancePages, /id="leaveStatusFilter"/);
  assert.match(attendancePages, /id="leaveTypeFilter"/);
  assert.match(attendancePages, /id="leaveDateFrom"/);
  assert.match(attendancePages, /id="leaveDateTo"/);
  assert.match(ui, /const overlaps = \(!filters\.from \|\| end >= filters\.from\)/);
  assert.match(app, /leaveMatchesFilters/);
  assert.match(attendancePages, /ops-priority-note/);
});

test('P2 leave decisions and withdrawals are guarded against duplicate actions', () => {
  assert.match(app, /const leaveDecisionInFlight = new Set\(\)/);
  assert.match(app, /const leaveWithdrawalInFlight = new Set\(\)/);
  assert.match(app, /leaveDecisionInFlight\.has\(key\)/);
  assert.match(app, /leaveWithdrawalInFlight\.has\(key\)/);
  assert.match(app, /FT\.openWithdrawMyLeave/);
  assert.doesNotMatch(app, /window\.confirm\('Batalkan pengajuan ijin\/cuti ini/);
});

test('P2 employee can edit pending future leave with cloud confirmation', () => {
  assert.match(app, /FT\.openEditMyLeave/);
  assert.match(app, /FT\.saveMyLeaveEdit/);
  assert.match(app, /canEditPendingLeave\(leave,todayISO\(\)\)/);
  assert.match(ui, /export function canEditPendingLeave/);
  assert.match(app, /updateLeave\(id, \{ type:data\.type, startDate:data\.startDate, endDate:data\.endDate, reason:data\.reason, status:'pending' \}\)/);
  assert.match(app, /await waitForOperationalSync\(\)/);
});

test('P2 manual checkout has an in-flight duplicate guard', () => {
  assert.match(field, /const attendanceCheckoutInFlight = new Set\(\)/);
  assert.match(field, /attendanceCheckoutInFlight\.has\(key\)/);
  assert.match(field, /attendanceCheckoutInFlight\.add\(key\)/);
  assert.match(field, /attendanceCheckoutInFlight\.delete\(key\)/);
});

test('P2 attendance and leave operational UI is responsive', () => {
  assert.match(css, /Attendance \+ Leave P2 operational hardening/);
  assert.match(css, /\.ops-kpi-grid/);
  assert.match(css, /\.ops-toolbar/);
  assert.match(css, /\.ops-row-actions/);
  assert.match(css, /\.ops-decision-summary/);
  assert.match(css, /@media \(max-width: 899px\)/);
});
