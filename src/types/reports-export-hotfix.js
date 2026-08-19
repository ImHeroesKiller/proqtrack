// Phase 3 compatibility fixes loaded after reports-export.js.
// Keeps print view writable while isolating the generated document from the app.
import { getDB } from '../lib/db.js';

const originalRun = window.ReportExport?.run;

function readFilters() {
  const form = document.getElementById('rptFilterForm');
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function val(object, keys, fallback = '') {
  return keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== '') ?? fallback;
}

function dateOf(object) {
  return String(val(object, ['date', 'attendanceDate', 'visitDate', 'createdAt', 'checkInAt', 'timestamp', 'updatedAt'], '')).slice(0, 10);
}

function statusOf(object) {
  return String(val(object, ['status', 'attendanceStatus', 'visitStatus'], '-'));
}

function readDB() {
  return getDB();
}

function printData(filters) {
  const db = readDB();
  const employees = db.employees || [];
  let projects = db.projects || [];
  if (filters.clientId) projects = projects.filter((project) => project.clientId === filters.clientId);
  if (filters.projectId) projects = projects.filter((project) => project.id === filters.projectId);
  const employeeName = (id) => employees.find((employee) => employee.id === id)?.name || id || '-';
  const projectName = (id) => projects.find((project) => project.id === id)?.name || id || '-';
  const clientName = (id) => (db.clients || []).find((client) => client.id === id)?.name || id || '-';
  const inPeriod = (row) => {
    const date = dateOf(row);
    return (!filters.start || !date || date >= filters.start) && (!filters.end || !date || date <= filters.end);
  };
  const selectedEmployee = (row) => !filters.employeeId || val(row, ['employeeId', 'userId']) === filters.employeeId;
  const selectedProject = (row) => !filters.projectId || row.projectId === filters.projectId;
  const type = filters.type || 'attendance';

  if (type === 'employees') {
    return {
      title: 'Laporan Karyawan',
      headers: ['ID', 'Nama', 'Jabatan', 'Area', 'Status'],
      rows: employees.filter((employee) => !filters.employeeId || employee.id === filters.employeeId).filter((employee) => !filters.status || employee.status === filters.status).map((employee) => [employee.id, employee.name, val(employee, ['role', 'jobRole'], '-'), val(employee, ['area', 'region'], '-'), employee.status || '-'])
    };
  }
  if (type === 'projects') {
    return {
      title: 'Laporan Klien & Project',
      headers: ['Kode', 'Project', 'Klien', 'Status', 'Mulai', 'Selesai'],
      rows: projects.filter((project) => !filters.status || project.status === filters.status).map((project) => [project.code || project.id, project.name, clientName(project.clientId), project.status || '-', project.startDate || '-', project.endDate || '-'])
    };
  }
  if (type === 'field') {
    const visits = (db.visits || []).filter((row) => inPeriod(row) && selectedEmployee(row) && selectedProject(row)).map((row) => [dateOf(row), 'Kunjungan', employeeName(row.employeeId), projectName(row.projectId), val(row, ['outletName', 'title', 'notes'], '-'), statusOf(row)]);
    const photos = (db.fieldPhotos || db.photos || []).filter((row) => inPeriod(row) && selectedEmployee(row) && selectedProject(row)).map((row) => [dateOf(row), 'Foto', employeeName(row.employeeId), projectName(row.projectId), val(row, ['title', 'category', 'photoType'], '-'), statusOf(row)]);
    return { title: 'Laporan Aktivitas Lapangan', headers: ['Tanggal', 'Aktivitas', 'Karyawan', 'Project', 'Detail', 'Status'], rows: [...visits, ...photos] };
  }
  const attendance = (db.attendance || []).filter((row) => inPeriod(row) && selectedEmployee(row) && selectedProject(row)).filter((row) => !filters.status || statusOf(row) === filters.status);
  return {
    title: 'Laporan Kehadiran',
    headers: ['Tanggal', 'Karyawan', 'Project', 'Status', 'Jam Masuk', 'Jam Pulang', 'Lokasi'],
    rows: attendance.map((row) => [dateOf(row), employeeName(val(row, ['employeeId', 'userId'])), projectName(row.projectId), statusOf(row), val(row, ['checkIn', 'checkInAt', 'timeIn'], '-'), val(row, ['checkOut', 'checkOutAt', 'timeOut'], '-'), val(row, ['area', 'locationName', 'location'], '-')])
  };
}

function openPrintView() {
  const filters = readFilters();
  const report = printData(filters);
  if (!report.rows.length) {
    window.showToast?.('Tidak ada data untuk dicetak', 'error');
    return;
  }
  const popup = window.open('', '_blank');
  if (!popup) {
    window.showToast?.('Popup diblokir browser. Izinkan popup untuk Print View.', 'error');
    return;
  }
  popup.opener = null;
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{font-size:22px;margin:0 0 5px}.meta{font-size:12px;color:#555;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top}th{background:#f2f2f2}@media print{body{padding:0}}</style></head><body><h1>${esc(report.title)}</h1><div class="meta">Periode: ${esc(filters.start || '-')} s.d. ${esc(filters.end || '-')}<br>Dibuat: ${esc(new Date().toLocaleString('id-ID'))}</div><table><thead><tr>${report.headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${report.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 350);
}

if (window.ReportExport && originalRun) {
  window.ReportExport.run = (format) => format === 'print' ? openPrintView() : originalRun(format);
}

export {};
