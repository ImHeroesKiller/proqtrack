import {
  getEmployees, getAttendance, getLeaves, getLeavesByEmployee, getLeaveTypes, createLeave,
  getAppSettings, getOrganization, clockInAttendance, clockOutAttendance,
  getOvertimes, getOvertimesByEmployee, createOvertime,
  getWfhRequests, getWfhRequestsByEmployee, createWfhRequest,
  getDailyReports, getDailyReportsByEmployee, createDailyReport,
  getNewsItems, getHrContacts, updateOvertime, updateWfhRequest,
} from './lib/db.js';
import {
  esc, formatDateShort, getInitials, statusBadge, todayISO, normalizeAttendanceStatus, safePhotoUrl,
} from './lib/utils.js';
import { iconSvg } from '../assets/icons.js';
import { workedHours, currentMonthKey, jakartaNowParts } from './lib/hr.js';

function empId() {
  return window.FT?.state?.account?.employeeId || null;
}

function me() {
  return getEmployees().find(e => e.id === empId()) || null;
}

function companyLabel() {
  const settings = getAppSettings();
  if (settings.companyName && settings.companyName !== 'ProQTrack') return settings.companyName;
  const org = getOrganization();
  return org?.legalName || settings.companyName || 'PT. ProQ Indonesia';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Karyawan';
}

function monthAttendance(employeeId) {
  const month = currentMonthKey();
  const rows = getAttendance().filter(a => a.employeeId === employeeId && String(a.date || '').startsWith(month));
  return {
    hadir: rows.filter(r => normalizeAttendanceStatus(r.status) === 'hadir').length,
    terlambat: rows.filter(r => normalizeAttendanceStatus(r.status) === 'terlambat').length,
    tidakHadir: rows.filter(r => normalizeAttendanceStatus(r.status) === 'tidak hadir').length,
    rows,
  };
}

function todayAtt(employeeId) {
  return getAttendance().find(a => a.employeeId === employeeId && a.date === todayISO()) || null;
}

function hoursLabel(value) {
  const n = Number(value) || 0;
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1).replace('.', ',');
}

function tile(label, tone, icon, href) {
  return `<a class="pq-tile pq-tile-${tone}" href="${href}" onclick="return FT.goNav(event,'${href}')">
    <span class="pq-tile-ico">${iconSvg(icon)}</span>
    <span>${label}</span>
  </a>`;
}

function pageHead(title, back = '#/myday') {
  return `<header class="pq-subhead">
    <button type="button" class="mq-icon-btn" onclick="location.hash='${back}'" aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 6-6 6 6 6"/></svg>
    </button>
    <h1>${esc(title)}</h1>
    <span></span>
  </header>`;
}

function emptyState(title, text) {
  return `<div class="empty-state" style="padding:28px 12px"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function requestRows(rows, fields) {
  if (!rows.length) return emptyState('Belum ada data', 'Pengajuan baru akan tampil di sini.');
  return rows.map(row => `
    <article class="pq-list-card">
      <div>
        <strong>${esc(fields.title(row))}</strong>
        <p>${esc(fields.meta(row))}</p>
      </div>
      ${statusBadge(row.status)}
    </article>`).join('');
}

export function renderHrHome() {
  const emp = me();
  if (!emp) return `<div class="empty-state"><h3>Data karyawan tidak ditemukan</h3></div>`;
  const att = todayAtt(emp.id);
  const month = monthAttendance(emp.id);
  const hours = workedHours(att);
  const pct = Math.min(100, Math.round((hours / 8) * 100));
  const inDone = Boolean(att?.checkInTime);
  const outDone = Boolean(att?.checkOutTime);
  const date = jakartaNowParts().longDate;

  return `
    <div class="pq-home">
      <header class="pq-head">
        <button type="button" class="mq-icon-btn" onclick="FT.toggleSidebar()" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <div class="pq-hello">
          <h1>Hai ${esc(firstName(emp.name))}!</h1>
          <p>${esc(companyLabel())}</p>
        </div>
        <div class="pq-date">${esc(date)}</div>
      </header>

      <section class="pq-att-card">
        <div class="pq-att-kicker">${iconSvg('attendance')} Absensi Hari Ini</div>
        <div class="pq-att-row">
          <div>
            <div class="pq-hours">${hoursLabel(hours)}<small>/8 jam</small></div>
          </div>
          <div class="pq-month-stats">
            <div><b>${month.hadir}</b><span>Hadir</span></div>
            <div><b class="warn">${month.terlambat}</b><span>Terlambat</span></div>
            <div><b class="bad">${month.tidakHadir}</b><span>Tidak Hadir</span></div>
          </div>
        </div>
        <div class="pq-bar"><i style="width:${pct}%"></i></div>
        <div class="pq-bar-label">${pct}%</div>
        ${inDone ? `<p class="pq-att-note">Masuk ${esc(att.checkInTime)}${outDone ? ` · Pulang ${esc(att.checkOutTime)}` : ''} · ${esc(att.checkInLocation || 'Kantor')}</p>` : ''}
        <div class="pq-att-actions">
          <button type="button" class="pq-btn-in" ${inDone ? 'disabled' : ''} onclick="HR.clockIn()">Absen Masuk</button>
          <button type="button" class="pq-btn-out" ${!inDone || outDone ? 'disabled' : ''} onclick="HR.clockOut()">Absen Pulang</button>
        </div>
      </section>

      <section class="pq-grid">
        ${tile('Attendance', 'teal', 'attendance', '#/myattendance')}
        ${tile('Request Overtime', 'orange', 'overtime', '#/lembur')}
        ${tile('Request Time Off', 'amber', 'edit', '#/izin')}
        ${tile('Request Leave', 'green', 'leaves', '#/cuti')}
        ${tile('Work From Home', 'blue', 'home', '#/wfh')}
        ${tile('Daily Report', 'purple', 'accounts', '#/laporan-harian')}
        ${tile('Calendar', 'cyan', 'calendar', '#/kalender')}
        ${tile('Overtime Recap', 'orange', 'chart', '#/rekap-lembur')}
        ${tile('Monthly Attendance', 'rose', 'analysis', '#/rekap-absensi')}
        ${tile('News', 'slate', 'news', '#/berita')}
        ${tile('Contact HR', 'brown', 'phone', '#/hubungi-hrd')}
      </section>
    </div>
  `;
}

export function renderPengajuanHub() {
  const id = empId();
  const leaves = getLeavesByEmployee(id);
  const ots = getOvertimesByEmployee(id);
  const wfhs = getWfhRequestsByEmployee(id);
  const pending = [...leaves, ...ots, ...wfhs].filter(r => r.status === 'pending').length;
  return `
    <div class="pq-page">
      ${pageHead('Requests')}
      <div class="pq-stat-row">
        <div><b>${pending}</b><span>Pending</span></div>
        <div><b>${leaves.length}</b><span>Leave</span></div>
        <div><b>${ots.length}</b><span>Overtime</span></div>
        <div><b>${wfhs.length}</b><span>WFH</span></div>
      </div>
      <div class="pq-grid pq-grid-2">
        ${tile('Request Overtime', 'orange', 'overtime', '#/lembur')}
        ${tile('Request Time Off', 'amber', 'edit', '#/izin')}
        ${tile('Request Leave', 'green', 'leaves', '#/cuti')}
        ${tile('Work From Home', 'blue', 'home', '#/wfh')}
      </div>
    </div>`;
}

export function renderLaporanHub() {
  return `
    <div class="pq-page">
      ${pageHead('Reports')}
      <div class="pq-grid pq-grid-2">
        ${tile('Daily Report', 'purple', 'accounts', '#/laporan-harian')}
        ${tile('Overtime Recap', 'orange', 'chart', '#/rekap-lembur')}
        ${tile('Attendance Recap', 'rose', 'analysis', '#/rekap-absensi')}
        ${tile('Calendar', 'cyan', 'calendar', '#/kalender')}
        ${tile('My Visits', 'teal', 'visits', '#/myvisits')}
        ${tile('Field Photos', 'slate', 'photos', '#/myphotos')}
      </div>
    </div>`;
}

export function renderAkunPage() {
  const emp = me();
  const acc = window.FT?.state?.account;
  const colors = ['#ea580c', '#7c3aed', '#059669', '#d97706'];
  const color = colors[(emp?.name || 'A').charCodeAt(0) % colors.length];
  const photo = safePhotoUrl(emp?.photo);
  return `
    <div class="pq-page">
      ${pageHead('Account')}
      <section class="pq-att-card pq-profile">
        <div class="pq-avatar" style="background:${color}${photo ? `;background-image:url('${photo}');background-size:cover` : ''}">${photo ? '' : esc(getInitials(emp?.name || acc?.name || '?'))}</div>
        <h2>${esc(emp?.name || acc?.name || 'Employee')}</h2>
        <p>${esc(emp?.role || 'Field Sales')} · ${esc(emp?.area || companyLabel())}</p>
        <p class="pq-att-note">${esc(emp?.email || acc?.email || '')}</p>
      </section>
      <div class="pq-list">
        <a class="pq-list-card" href="#/settings" onclick="return FT.goNav(event,'#/settings')"><strong>Account settings</strong><span>›</span></a>
        <a class="pq-list-card" href="#/myattendance" onclick="return FT.goNav(event,'#/myattendance')"><strong>Attendance history</strong><span>›</span></a>
        <a class="pq-list-card" href="#/myleaves" onclick="return FT.goNav(event,'#/myleaves')"><strong>My leave</strong><span>›</span></a>
        <button type="button" class="pq-list-card pq-danger" onclick="FT.logout()"><strong>Sign out</strong></button>
      </div>
    </div>`;
}

export function renderOvertimePage() {
  const rows = getOvertimesByEmployee(empId()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <div class="pq-page">
      ${pageHead('Request Overtime', '#/pengajuan')}
      <form class="pq-form" onsubmit="HR.submitOvertime(event)">
        <label>Tanggal<input class="input" type="date" name="date" value="${todayISO()}" required></label>
        <div class="pq-form-row">
          <label>Mulai<input class="input" type="time" name="startTime" value="18:00" required></label>
          <label>Selesai<input class="input" type="time" name="endTime" value="21:00" required></label>
        </div>
        <label>Jam lembur<input class="input" type="number" name="hours" min="0.5" step="0.5" value="3" required></label>
        <label>Alasan<textarea class="textarea" name="reason" required placeholder="Kenapa perlu lembur?"></textarea></label>
        <button class="pq-btn-in" type="submit">Kirim pengajuan</button>
      </form>
      <h3 class="pq-block-title">Overtime history</h3>
      ${requestRows(rows, {
        title: r => `${r.hours} jam · ${formatDateShort(r.date)}`,
        meta: r => `${r.startTime || '—'}–${r.endTime || '—'} · ${r.reason || ''}`,
      })}
    </div>`;
}

function leaveForm(kind) {
  const types = getLeaveTypes().filter(t => {
    const name = String(t.name || '').toLowerCase();
    return kind === 'cuti' ? name.includes('cuti') : !name.includes('cuti');
  });
  const rows = getLeavesByEmployee(empId())
    .filter(l => kind === 'cuti' ? /cuti/i.test(l.type) : !/cuti/i.test(l.type))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const title = kind === 'cuti' ? 'Request Leave' : 'Request Time Off';
  return `
    <div class="pq-page">
      ${pageHead(title, '#/pengajuan')}
      <form class="pq-form" onsubmit="HR.submitLeave(event)">
        <label>Tipe
          <select class="select" name="type" required>
            ${types.map(t => `<option>${esc(t.name)}</option>`).join('')}
          </select>
        </label>
        <div class="pq-form-row">
          <label>Mulai<input class="input" type="date" name="startDate" value="${todayISO()}" required></label>
          <label>Selesai<input class="input" type="date" name="endDate" value="${todayISO()}" required></label>
        </div>
        <label>Alasan<textarea class="textarea" name="reason" required placeholder="Alasan pengajuan"></textarea></label>
        <button class="pq-btn-in" type="submit">Kirim pengajuan</button>
      </form>
      <h3 class="pq-block-title">History</h3>
      ${requestRows(rows, {
        title: r => r.type,
        meta: r => `${formatDateShort(r.startDate)} – ${formatDateShort(r.endDate)} · ${r.reason || ''}`,
      })}
    </div>`;
}

export function renderIzinPage() { return leaveForm('izin'); }
export function renderCutiPage() { return leaveForm('cuti'); }

export function renderWfhPage() {
  const rows = getWfhRequestsByEmployee(empId()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <div class="pq-page">
      ${pageHead('Work From Home', '#/pengajuan')}
      <form class="pq-form" onsubmit="HR.submitWfh(event)">
        <label>Tanggal<input class="input" type="date" name="date" value="${todayISO()}" required></label>
        <label>Alasan / rencana kerja<textarea class="textarea" name="reason" required placeholder="Apa yang akan dikerjakan dari rumah?"></textarea></label>
        <button class="pq-btn-in" type="submit">Ajukan WFH</button>
      </form>
      <h3 class="pq-block-title">WFH history</h3>
      ${requestRows(rows, {
        title: r => formatDateShort(r.date),
        meta: r => r.reason || '',
      })}
    </div>`;
}

export function renderDailyReportPage() {
  const rows = getDailyReportsByEmployee(empId()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const today = rows.find(r => r.date === todayISO());
  return `
    <div class="pq-page">
      ${pageHead('Daily Report', '#/laporan')}
      ${today ? `<div class="pq-note">Laporan hari ini sudah terkirim pukul ${esc((today.submittedAt || '').slice(0, 10))}.</div>` : ''}
      <form class="pq-form" onsubmit="HR.submitDaily(event)">
        <label>Ringkasan hari ini<textarea class="textarea" name="summary" required placeholder="Apa yang sudah dikerjakan?"></textarea></label>
        <label>Hambatan<textarea class="textarea" name="blockers" placeholder="Opsional"></textarea></label>
        <label>Rencana besok<textarea class="textarea" name="planTomorrow" placeholder="Opsional"></textarea></label>
        <button class="pq-btn-in" type="submit">Kirim laporan</button>
      </form>
      <h3 class="pq-block-title">Arsip</h3>
      ${requestRows(rows, {
        title: r => formatDateShort(r.date),
        meta: r => r.summary || '',
      })}
    </div>`;
}

export function renderCalendarPage() {
  const id = empId();
  const month = currentMonthKey();
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const attMap = Object.fromEntries(getAttendance().filter(a => a.employeeId === id && String(a.date).startsWith(month)).map(a => [Number(a.date.slice(8, 10)), a]));
  const leaveDays = new Set();
  getLeavesByEmployee(id).filter(l => l.status === 'approved').forEach(l => {
    const from = new Date(l.startDate);
    const to = new Date(l.endDate);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === y && d.getMonth() === m - 1) leaveDays.add(d.getDate());
    }
  });
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<span></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const att = attMap[d];
    const status = leaveDays.has(d) ? 'leave' : att ? (normalizeAttendanceStatus(att.status) === 'terlambat' ? 'late' : att.checkInTime ? 'ok' : 'miss') : '';
    cells.push(`<span class="pq-cal-day ${status}">${d}</span>`);
  }
  return `
    <div class="pq-page">
      ${pageHead('Calendar', '#/laporan')}
      <section class="pq-att-card">
        <div class="pq-cal-week">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<span>${d}</span>`).join('')}</div>
        <div class="pq-cal-grid">${cells.join('')}</div>
        <div class="pq-cal-legend">
          <span><i class="ok"></i> Hadir</span>
          <span><i class="late"></i> Terlambat</span>
          <span><i class="leave"></i> Cuti/Izin</span>
        </div>
      </section>
    </div>`;
}

export function renderOvertimeRecap() {
  const rows = getOvertimesByEmployee(empId());
  const month = currentMonthKey();
  const thisMonth = rows.filter(r => String(r.date).startsWith(month));
  const approved = thisMonth.filter(r => r.status === 'approved');
  const hours = approved.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  return `
    <div class="pq-page">
      ${pageHead('Overtime Recap', '#/laporan')}
      <div class="pq-stat-row">
        <div><b>${hours}</b><span>Approved hours</span></div>
        <div><b>${thisMonth.length}</b><span>This month</span></div>
        <div><b>${approved.length}</b><span>Approved</span></div>
      </div>
      ${requestRows(rows.sort((a, b) => String(b.date).localeCompare(String(a.date))), {
        title: r => `${r.hours} jam · ${formatDateShort(r.date)}`,
        meta: r => r.reason || '',
      })}
    </div>`;
}

export function renderMonthlyAttendance() {
  const emp = me();
  const month = monthAttendance(emp?.id);
  return `
    <div class="pq-page">
      ${pageHead('Monthly Attendance', '#/laporan')}
      <div class="pq-stat-row">
        <div><b>${month.hadir}</b><span>Present</span></div>
        <div><b class="warn">${month.terlambat}</b><span>Late</span></div>
        <div><b class="bad">${month.tidakHadir}</b><span>Absent</span></div>
      </div>
      ${requestRows(month.rows.sort((a, b) => String(b.date).localeCompare(String(a.date))), {
        title: r => formatDateShort(r.date),
        meta: r => `${r.checkInTime || '—'}–${r.checkOutTime || '—'} · ${r.checkInLocation || ''}`,
      })}
    </div>`;
}

export function renderNewsPage() {
  const items = getNewsItems();
  return `
    <div class="pq-page">
      ${pageHead('News')}
      ${items.length ? items.map(n => `
        <article class="pq-news">
          ${n.pinned ? '<span class="pq-pin">Penting</span>' : ''}
          <h2>${esc(n.title)}</h2>
          <time>${esc(formatDateShort(n.publishedAt))}</time>
          <p>${esc(n.body)}</p>
        </article>`).join('') : emptyState('Belum ada berita', 'Pengumuman HRD akan muncul di sini.')}
    </div>`;
}

export function renderContactHr() {
  const contacts = getHrContacts();
  return `
    <div class="pq-page">
      ${pageHead('Contact HR')}
      ${contacts.map(c => `
        <section class="pq-att-card pq-contact">
          <h2>${esc(c.name)}</h2>
          <p>${esc(c.role)} · ${esc(c.hours || '')}</p>
          <div class="pq-contact-actions">
            ${c.phone ? `<a class="pq-btn-in" href="tel:${esc(c.phone)}">Telepon</a>` : ''}
            ${c.whatsapp ? `<a class="pq-ghost" href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noreferrer">WhatsApp</a>` : ''}
            ${c.email ? `<a class="pq-ghost" href="mailto:${esc(c.email)}">Email</a>` : ''}
          </div>
        </section>`).join('')}
    </div>`;
}

export function renderHrApprovals() {
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const block = (title, rows, approve, reject) => `
    <div class="card" style="margin-top:16px">
      <div class="card-title">${title}</div>
      ${!rows.length ? '<p class="am-muted">Tidak ada antrian.</p>' : rows.map(r => {
        const emp = empMap[r.employeeId];
        return `<div class="pq-list-card">
          <div><strong>${esc(emp?.name || r.employeeId)}</strong><p>${esc(r.date || r.startDate || '')} · ${esc(r.reason || r.type || '')}</p></div>
          ${r.status === 'pending' ? `<div class="pq-mini-actions">
            <button class="btn btn-primary btn-sm" onclick="${approve}('${r.id}')">Setujui</button>
            <button class="btn btn-danger btn-sm" onclick="${reject}('${r.id}')">Tolak</button>
          </div>` : statusBadge(r.status)}
        </div>`;
      }).join('')}
    </div>`;
  return block('Lembur', getOvertimes().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))), 'HR.approveOt', 'HR.rejectOt')
    + block('Work From Home', getWfhRequests().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))), 'HR.approveWfh', 'HR.rejectWfh');
}

function toast(msg, type = 'success') {
  window.showToast?.(msg, type);
}

function afterSave(msg) {
  toast(msg);
  window.FT?.closeModal?.();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

window.HR = {
  clockIn() {
    try { clockInAttendance(empId()); afterSave('Absen masuk tercatat'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  clockOut() {
    try { clockOutAttendance(empId()); afterSave('Absen pulang tercatat'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  submitOvertime(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try { createOvertime({ ...data, employeeId: empId(), hours: Number(data.hours) }); afterSave('Pengajuan lembur terkirim'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  submitLeave(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const days = Math.max(1, Math.ceil((new Date(data.endDate) - new Date(data.startDate)) / 86400000) + 1);
    try { createLeave({ ...data, employeeId: empId(), days }); afterSave('Pengajuan terkirim, menunggu approval'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  submitWfh(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try { createWfhRequest({ ...data, employeeId: empId() }); afterSave('Pengajuan WFH terkirim'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  submitDaily(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try { createDailyReport({ ...data, employeeId: empId(), date: todayISO() }); afterSave('Laporan harian tersimpan'); }
    catch (err) { toast(err.message || err, 'error'); }
  },
  approveOt(id) { try { updateOvertime(id, { status: 'approved', approvedAt: todayISO(), approverId: window.FT?.state?.account?.id }); afterSave('Lembur disetujui'); } catch (err) { toast(err.message || err, 'error'); } },
  rejectOt(id) { try { updateOvertime(id, { status: 'rejected', approvedAt: todayISO(), approverId: window.FT?.state?.account?.id }); afterSave('Lembur ditolak'); } catch (err) { toast(err.message || err, 'error'); } },
  approveWfh(id) { try { updateWfhRequest(id, { status: 'approved', approvedAt: todayISO(), approverId: window.FT?.state?.account?.id }); afterSave('WFH disetujui'); } catch (err) { toast(err.message || err, 'error'); } },
  rejectWfh(id) { try { updateWfhRequest(id, { status: 'rejected', approvedAt: todayISO(), approverId: window.FT?.state?.account?.id }); afterSave('WFH ditolak'); } catch (err) { toast(err.message || err, 'error'); } },
};
