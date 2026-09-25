import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attendanceLeaveFriendlyErrorMessage,
  attendanceSourceKey,
  attendanceSourceLabel,
  attendanceStatusKey,
  attendanceOperationalSummary,
  attendanceFilterSnapshot,
  attendanceMatchesFilters,
  attendanceTimeValue,
  leaveDisplayStatus,
  leavePendingAgeDays,
  leaveOperationalSummary,
  leaveFilterSnapshot,
  leaveMatchesFilters,
  canEditPendingLeave,
} from '../src/lib/attendance-leave-ui.js';

test('P3 attendance helper normalizes source status and summary', () => {
  const rows = [
    { date:'2026-09-25', status:'present', attendanceSource:'manual', checkInAt:'08:00', correctionCount:1 },
    { date:'2026-09-25', status:'terlambat', attendanceSource:'visit', checkInAt:'09:15', checkOutAt:'10:00' },
    { date:'2026-09-24', status:'absent', attendanceSource:'manual' },
  ];
  assert.equal(attendanceSourceKey(rows[0]),'manual');
  assert.equal(attendanceSourceKey(rows[1]),'visit');
  assert.equal(attendanceSourceLabel(rows[1]),'Visit');
  assert.equal(attendanceStatusKey(rows[0]),'hadir');
  assert.deepEqual(attendanceOperationalSummary(rows,'2026-09-25'),{
    total:3,
    today:2,
    openCheckout:1,
    corrected:1,
  });
});

test('P3 attendance filters are pure and deterministic', () => {
  const filters = attendanceFilterSnapshot({
    search:'Ary',
    projectId:'PRJ-1',
    status:'hadir',
    source:'manual',
    from:'2026-09-01',
    to:'2026-09-30',
  });
  assert.equal(filters.search,'ary');
  assert.equal(attendanceMatchesFilters({
    text:'Ary Wibowo PRJ-1',
    projectId:'PRJ-1',
    status:'hadir',
    source:'manual',
    date:'2026-09-25',
  },filters),true);
  assert.equal(attendanceMatchesFilters({
    text:'Ary Wibowo PRJ-2',
    projectId:'PRJ-2',
    status:'hadir',
    source:'manual',
    date:'2026-09-25',
  },filters),false);
  assert.equal(attendanceTimeValue('2026-09-25T08:31:00+07:00'),'08:31');
});

test('P3 leave helper distinguishes withdrawn from rejected', () => {
  const rows = [
    { status:'pending', submittedAt:'2026-09-22' },
    { status:'approved' },
    { status:'rejected' },
    { status:'rejected', decisionKind:'withdrawn' },
  ];
  assert.equal(leaveDisplayStatus(rows[2]),'rejected');
  assert.equal(leaveDisplayStatus(rows[3]),'withdrawn');
  assert.equal(leavePendingAgeDays(rows[0],'2026-09-25'),3);
  assert.deepEqual(leaveOperationalSummary(rows),{
    total:4,
    pending:1,
    approved:1,
    rejected:1,
    withdrawn:1,
  });
});

test('P3 leave filters use overlap semantics and normalized search', () => {
  const filters = leaveFilterSnapshot({
    search:'annual',
    status:'pending',
    type:'Cuti Tahunan',
    from:'2026-09-20',
    to:'2026-09-30',
  });
  assert.equal(leaveMatchesFilters({
    text:'Annual leave Ary',
    status:'pending',
    type:'Cuti Tahunan',
    start:'2026-09-24',
    end:'2026-09-26',
  },filters),true);
  assert.equal(leaveMatchesFilters({
    text:'Annual leave Ary',
    status:'pending',
    type:'Cuti Tahunan',
    start:'2026-10-01',
    end:'2026-10-02',
  },filters),false);
});

test('P3 pending leave edit eligibility is centralized', () => {
  assert.equal(canEditPendingLeave({status:'pending',startDate:'2026-09-26'},'2026-09-25'),true);
  assert.equal(canEditPendingLeave({status:'pending',startDate:'2026-09-25'},'2026-09-25'),false);
  assert.equal(canEditPendingLeave({status:'approved',startDate:'2026-09-26'},'2026-09-25'),false);
});

test('P3 attendance and leave errors share one friendly mapping', () => {
  assert.equal(
    attendanceLeaveFriendlyErrorMessage({code:'ATTENDANCE_CHECKOUT_BEFORE_CHECKIN'}),
    'Check-out tidak boleh lebih awal dari check-in.'
  );
  assert.equal(
    attendanceLeaveFriendlyErrorMessage({code:'LEAVE_SELF_REVIEW_FORBIDDEN'}),
    'Pengaju tidak boleh mereview pengajuannya sendiri.'
  );
  assert.equal(
    attendanceLeaveFriendlyErrorMessage({code:'UNKNOWN',message:'Custom'}),
    'Custom'
  );
});
