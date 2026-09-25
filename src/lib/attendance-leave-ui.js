import { normalizeAttendanceStatus } from './utils.js';

const text = value => String(value ?? '').trim();

const ERROR_MESSAGES = Object.freeze({
  ATTENDANCE_VISIT_DERIVED_IMMUTABLE:'Attendance dari Visit tidak dapat dikoreksi manual.',
  ATTENDANCE_VISIT_DERIVED_ONLY:'Attendance project ini dihitung otomatis dari Visit.',
  ATTENDANCE_CORRECTION_REASON_REQUIRED:'Alasan koreksi wajib minimal 10 karakter.',
  ATTENDANCE_CORRECTION_STATUS_INVALID:'Status koreksi attendance tidak valid.',
  ATTENDANCE_CHECKIN_INVALID:'Waktu check-in tidak valid.',
  ATTENDANCE_CHECKOUT_INVALID:'Waktu check-out tidak valid.',
  ATTENDANCE_CHECKOUT_BEFORE_CHECKIN:'Check-out tidak boleh lebih awal dari check-in.',
  ATTENDANCE_CHECKOUT_IMMUTABLE:'Check-out attendance sudah tercatat.',
  ATTENDANCE_SELF_SERVICE_TODAY_ONLY:'Attendance mandiri hanya dapat dilakukan pada hari yang sama.',
  ATTENDANCE_APPROVED_LEAVE_CONFLICT:'Attendance tidak dapat dibuat karena terdapat ijin/cuti yang sudah disetujui.',
  ATTENDANCE_EMPLOYEE_PROJECT_MISMATCH:'Karyawan tidak memiliki assignment aktif pada project ini.',
  ATTENDANCE_PROJECT_NOT_ACTIVE:'Project attendance tidak aktif.',
  ATTENDANCE_OUTSIDE_PROJECT_PERIOD:'Tanggal attendance berada di luar periode project.',
  ATTENDANCE_DIRECT_STATUS_CHANGE_FORBIDDEN:'Gunakan workflow koreksi untuk mengubah Attendance yang sudah tercatat.',
  LEAVE_PERIOD_INVALID:'Periode ijin/cuti tidak valid.',
  LEAVE_PERIOD_CONFLICT:'Periode ijin/cuti bertabrakan dengan pengajuan lain.',
  LEAVE_TYPE_REQUIRED:'Tipe ijin/cuti wajib dipilih.',
  LEAVE_REASON_REQUIRED:'Alasan ijin/cuti wajib minimal 5 karakter.',
  LEAVE_PAST_PERIOD_SELF_SERVICE_FORBIDDEN:'Pengajuan yang seluruh periodenya sudah lewat tidak dapat dibuat.',
  LEAVE_SELF_ONLY:'Pengajuan hanya dapat dibuat untuk akun sendiri.',
  LEAVE_SELF_REVIEW_FORBIDDEN:'Pengaju tidak boleh mereview pengajuannya sendiri.',
  LEAVE_REJECTION_NOTE_REQUIRED:'Alasan penolakan wajib minimal 5 karakter.',
  LEAVE_ATTENDANCE_CONFLICT:'Pengajuan tidak dapat disetujui karena sudah ada attendance pada periode tersebut.',
  LEAVE_FINAL_IMMUTABLE:'Pengajuan sudah final dan tidak dapat diubah.',
  LEAVE_EDIT_AFTER_START_FORBIDDEN:'Pengajuan yang sudah mulai tidak dapat diedit.',
  LEAVE_DECISION_FORBIDDEN:'Pengaju tidak dapat menentukan keputusan approval.',
  LEAVE_REVIEW_DECISION_REQUIRED:'Keputusan approval tidak valid.',
  REVISION_CONFLICT:'Data berubah dari perangkat lain. Muat ulang lalu coba kembali.',
  CLOUD_SYNC_TIMEOUT:'Sinkronisasi belum selesai. Periksa koneksi lalu coba kembali.',
  CLOUD_SYNC_UNAVAILABLE:'Sinkronisasi online belum siap. Muat ulang aplikasi lalu coba kembali.',
});

export function attendanceLeaveFriendlyErrorMessage(error = '', fallback = 'Proses gagal disimpan.') {
  const code = text(error?.code || error?.message || error);
  return ERROR_MESSAGES[code] || error?.message || String(error || fallback) || fallback;
}

export function attendanceSourceKey(row = {}) {
  return text(row?.attendanceSource) === 'visit' ? 'visit' : 'manual';
}

export function attendanceSourceLabel(row = {}) {
  return attendanceSourceKey(row) === 'visit' ? 'Visit' : 'Manual';
}

export function attendanceStatusKey(row = {}) {
  return normalizeAttendanceStatus(row?.status);
}

export function attendanceOperationalSummary(rows = [], today = '') {
  const all = Array.isArray(rows) ? rows : [];
  const currentDate = text(today);
  const todayRows = currentDate
    ? all.filter(row => text(row?.date || row?.workDate) === currentDate)
    : [];
  return {
    total:all.length,
    today:todayRows.length,
    openCheckout:todayRows.filter(row =>
      attendanceSourceKey(row) === 'manual'
      && !text(row?.checkOutAt || row?.checkOutTime)
    ).length,
    corrected:all.filter(row => Number(row?.correctionCount || 0) > 0).length,
  };
}

export function attendanceFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function' ? text(source(key)) : text(source?.[key]);
  return {
    search:get('search').toLowerCase(),
    projectId:get('projectId'),
    status:get('status'),
    source:get('source'),
    from:get('from'),
    to:get('to'),
  };
}

export function attendanceMatchesFilters(row = {}, filters = {}) {
  const date = text(row?.date);
  const haystack = text(row?.search || row?.text).toLowerCase();
  return (!filters.search || haystack.includes(filters.search))
    && (!filters.projectId || text(row?.projectId) === filters.projectId)
    && (!filters.status || text(row?.status) === filters.status)
    && (!filters.source || text(row?.source) === filters.source)
    && (!filters.from || date >= filters.from)
    && (!filters.to || date <= filters.to);
}

export function attendanceTimeValue(value = '') {
  const match = text(value).match(/(?:T|^)(\d{2}:\d{2})/);
  return match?.[1] || '';
}

export function leaveDisplayStatus(row = {}) {
  return text(row?.decisionKind) === 'withdrawn' ? 'withdrawn' : text(row?.status || 'pending');
}

export function leavePendingAgeDays(row = {}, today = '') {
  if (text(row?.status) !== 'pending') return 0;
  const submittedAt = text(row?.submittedAt).slice(0,10);
  const currentDate = text(today).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return 0;
  const diff = Date.parse(currentDate + 'T00:00:00Z') - Date.parse(submittedAt + 'T00:00:00Z');
  return Math.max(0,Math.floor(diff / 86400000));
}

export function leaveOperationalSummary(rows = []) {
  const summary = { total:0, pending:0, approved:0, rejected:0, withdrawn:0 };
  for (const row of rows || []) {
    summary.total += 1;
    const status = leaveDisplayStatus(row);
    if (status in summary) summary[status] += 1;
  }
  return summary;
}

export function leaveFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function' ? text(source(key)) : text(source?.[key]);
  return {
    search:get('search').toLowerCase(),
    status:get('status'),
    type:get('type'),
    from:get('from'),
    to:get('to'),
  };
}

export function leaveMatchesFilters(row = {}, filters = {}) {
  const start = text(row?.start);
  const end = text(row?.end);
  const overlaps = (!filters.from || end >= filters.from)
    && (!filters.to || start <= filters.to);
  return (!filters.search || text(row?.search || row?.text).toLowerCase().includes(filters.search))
    && (!filters.status || text(row?.status) === filters.status)
    && (!filters.type || text(row?.type) === filters.type)
    && overlaps;
}

export function canEditPendingLeave(row = {}, today = '') {
  return text(row?.status) === 'pending'
    && !!text(row?.startDate)
    && text(row.startDate) > text(today);
}

export function leaveDecisionLabel(row = {}) {
  const status = leaveDisplayStatus(row);
  return ({
    pending:'Pending',
    approved:'Disetujui',
    rejected:'Ditolak',
    withdrawn:'Dibatalkan',
  })[status] || status || '-';
}
