// ProQTrack P2 route chunk: attendance + leave manager pages
import { getAttendance, getDB, getEmployees, getLeaves, getAccounts } from '../lib/db.js';
import { todayISO, esc, getInitials, formatDateShort, statusBadge } from '../lib/utils.js';
import {
  attendanceSourceLabel, attendanceStatusKey, attendanceSourceKey, attendanceOperationalSummary,
  leaveOperationalSummary, leavePendingAgeDays, leaveDisplayStatus,
} from '../lib/attendance-leave-ui.js';

const state = () => window.FT?.state || {};

function leaveStatusHtml(row) {
  if (leaveDisplayStatus(row) === 'withdrawn') return '<span class="status-badge ops-withdrawn-badge">Dibatalkan</span>';
  return statusBadge(row?.status);
}

export function renderAttendanceManager() {
  const attendance = getAttendance().slice().sort((a,b) => String(b.date || b.workDate || '').localeCompare(String(a.date || a.workDate || '')));
  const db = getDB();
  const today = todayISO();
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const projects = (db.projects || []).filter(project => attendance.some(row => String(row.projectId) === String(project.id)));
  const projectMap = Object.fromEntries((db.projects || []).map(project => [String(project.id), project]));
  const summary = attendanceOperationalSummary(attendance,today);
  return `
    <div class="ops-kpi-grid">
      <div class="ops-kpi"><span>Hari ini</span><strong>${summary.today}</strong><small>attendance tercatat</small></div>
      <div class="ops-kpi"><span>Belum check-out</span><strong>${summary.openCheckout}</strong><small>manual hari ini</small></div>
      <div class="ops-kpi"><span>Koreksi</span><strong>${summary.corrected}</strong><small>memiliki audit correction</small></div>
      <div class="ops-kpi"><span>Total</span><strong>${summary.total}</strong><small>record terlihat</small></div>
    </div>
    <div class="card ops-card">
      <div class="ops-toolbar">
        <div class="ops-toolbar-main">
          <input class="input search-input" id="attSearch" placeholder="Cari karyawan / project..." data-pqt-oninput="FT.filterAttendance()">
          <select class="select" id="attProjectFilter" data-pqt-onchange="FT.filterAttendance()">
            <option value="">Semua Project</option>
            ${projects.map(project => `<option value="${esc(project.id)}">${esc(project.code || project.id)} — ${esc(project.name || '')}</option>`).join('')}
          </select>
          <select class="select" id="attStatusFilter" data-pqt-onchange="FT.filterAttendance()">
            <option value="">Semua Status</option>
            <option value="hadir">Hadir</option><option value="terlambat">Terlambat</option><option value="tidak hadir">Tidak Hadir</option>
          </select>
          <select class="select" id="attSourceFilter" data-pqt-onchange="FT.filterAttendance()">
            <option value="">Semua Source</option><option value="manual">Manual</option><option value="visit">Visit</option>
          </select>
          <input class="input" id="attDateFrom" type="date" aria-label="Tanggal attendance dari" data-pqt-onchange="FT.filterAttendance()">
          <input class="input" id="attDateTo" type="date" aria-label="Tanggal attendance sampai" data-pqt-onchange="FT.filterAttendance()">
        </div>
        <div class="ops-toolbar-actions">
          <span class="ops-result-count" id="attResultCount" aria-live="polite">${attendance.length} record</span>
          <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetAttendanceFilters()">Reset</button>
          <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.openAttendancePointModal()">+ Titik absensi</button>
        </div>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="attTable">
          <thead><tr><th>Karyawan</th><th>Project</th><th>Tanggal</th><th>Check In</th><th>Check Out</th><th>Source</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${attendance.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">✅</div><h3>Belum ada data absensi</h3></div></td></tr>` :
            attendance.map(a => {
              const emp = empMap[a.employeeId];
              if (!emp) return '';
              const project = projectMap[String(a.projectId)] || {};
              const source = attendanceSourceLabel(a);
              const corrected = a.correctionCount ? `<div class="am-muted">Koreksi ${a.correctionCount}x</div>` : '';
              return `
                <tr data-att-row="1" data-project="${esc(String(a.projectId || ''))}" data-status="${esc(attendanceStatusKey(a))}" data-source="${attendanceSourceKey(a)}" data-date="${esc(String(a.date || a.workDate || ''))}">
                  <td><div class="ops-employee-cell"><div class="avatar ops-avatar-sm">${getInitials(emp.name)}</div><span class="ops-employee-name">${esc(emp.name)}</span></div></td>
                  <td><strong>${esc(project.code || a.projectId || '-')}</strong><div class="am-muted">${esc(project.name || '')}</div></td>
                  <td>${formatDateShort(a.date || a.workDate)}</td>
                  <td>${esc(a.checkInTime || a.checkInAt || '—')}</td>
                  <td>${esc(a.checkOutTime || a.checkOutAt || '—')}</td>
                  <td>${esc(source)}${corrected}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td><div class="ops-row-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewAttendance('${a.id}')">Detail</button>
                    ${attendanceSourceKey(a) === 'visit'
                      ? '<span class="ops-chip">Visit read-only</span>'
                      : `<button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openAttendanceCorrection('${a.id}')">Koreksi</button>`}
                  </div></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


export function renderLeavesManager() {
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const leaves = getLeaves().filter(l => empMap[l.employeeId]).sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));
  const accMap = Object.fromEntries(getAccounts().map(a => [a.id, a.name || a.email]));
  const summary = leaveOperationalSummary(leaves);
  const leaveTypes = [...new Set(leaves.map(l => String(l.type || '')).filter(Boolean))].sort();
  return `
    <div class="ops-kpi-grid">
      <div class="ops-kpi"><span>Menunggu</span><strong>${summary.pending}</strong><small>butuh keputusan</small></div>
      <div class="ops-kpi"><span>Disetujui</span><strong>${summary.approved}</strong><small>approved</small></div>
      <div class="ops-kpi"><span>Ditolak</span><strong>${summary.rejected}</strong><small>rejected</small></div>
      <div class="ops-kpi"><span>Dibatalkan</span><strong>${summary.withdrawn}</strong><small>oleh pengaju</small></div>
    </div>
    <div class="card ops-card">
      <div class="ops-toolbar">
        <div class="ops-toolbar-main">
          <input class="input search-input" id="leaveSearch" placeholder="Cari karyawan / alasan..." data-pqt-oninput="FT.filterLeaves()">
          <select class="select" id="leaveStatusFilter" data-pqt-onchange="FT.filterLeaves()">
            <option value="">Semua Status</option>
            <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Dibatalkan</option>
          </select>
          <select class="select" id="leaveTypeFilter" data-pqt-onchange="FT.filterLeaves()">
            <option value="">Semua Tipe</option>
            ${leaveTypes.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join('')}
          </select>
          <input class="input" id="leaveDateFrom" type="date" aria-label="Periode leave dari" data-pqt-onchange="FT.filterLeaves()">
          <input class="input" id="leaveDateTo" type="date" aria-label="Periode leave sampai" data-pqt-onchange="FT.filterLeaves()">
        </div>
        <div class="ops-toolbar-actions">
          <span class="ops-result-count" id="leaveResultCount" aria-live="polite">${leaves.length} pengajuan</span>
          <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetLeaveFilters()">Reset</button>
        </div>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="leaveTable">
          <thead><tr><th>Karyawan</th><th>Tipe</th><th>Periode</th><th>Hari</th><th>Alasan</th><th>Status</th><th>Approver</th><th></th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><h3>Belum ada pengajuan</h3></div></td></tr>` :
            leaves.map(l => {
              const emp=empMap[l.employeeId];
              if(!emp) return '';
              const selfReview = state().account?.employeeId && String(state().account.employeeId) === String(l.employeeId);
              const pendingDays = leavePendingAgeDays(l,todayISO());
              const filterStatus = leaveDisplayStatus(l);
              return `<tr data-leave-row="1" data-status="${esc(filterStatus)}" data-type="${esc(String(l.type || ''))}" data-start="${esc(String(l.startDate || ''))}" data-end="${esc(String(l.endDate || ''))}">
                <td><strong>${esc(emp.name)}</strong>${pendingDays >= 3 ? `<div class="ops-priority-note">Menunggu ${pendingDays} hari</div>` : ''}</td>
                <td>${esc(l.type)}</td>
                <td>${formatDateShort(l.startDate)} – ${formatDateShort(l.endDate)}</td>
                <td>${l.days}</td>
                <td class="ops-reason-cell">${esc(l.reason)}</td>
                <td>${leaveStatusHtml(l)}</td>
                <td>${l.status === 'pending' ? '—' : esc(accMap[l.approverId] || (l.decisionKind === 'withdrawn' ? 'Pengaju' : '—'))}</td>
                <td><div class="ops-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewLeave('${l.id}')">Detail</button>
                  ${l.status === 'pending' && !selfReview
                    ? `<button type="button" class="btn btn-primary btn-sm" data-pqt-onclick="FT.openLeaveDecision('${l.id}','approved')">Setujui</button><button type="button" class="btn btn-danger btn-sm" data-pqt-onclick="FT.openLeaveDecision('${l.id}','rejected')">Tolak</button>`
                    : ''}
                </div></td>
              </tr>`;
            }).join('')}
            ${leaves.length ? '<tr id="leaveFilteredEmpty" hidden><td colspan="8"><div class="empty-state"><h3>Tidak ada pengajuan sesuai filter</h3><p>Ubah atau reset filter Leave.</p></div></td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>`;
}

