const DB_KEY = 'proqtrack_db_v6';
const DB_V7_KEY = 'proqtrack_db_v7';
const REPORT_EXPORT_ROUTE = '#/reports/exports';

const readDB = () => {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY) || localStorage.getItem(DB_V7_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeDB = (db) => {
  const text = JSON.stringify(db);
  localStorage.setItem(DB_KEY, text);
  localStorage.setItem(DB_V7_KEY, text);
  window.dispatchEvent(new CustomEvent('proqtrack:db-updated'));
};
const account = () => window.FT?.state?.account || null;
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
const xml = (v = '') => String(v ?? '').replace(/[<>&'\"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const safeName = (v = '') => String(v || 'laporan').trim().replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const now = () => new Date().toISOString();
const dateText = (v) => v ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(v)) : '-';
const val = (o, keys, fallback = '') => keys.map((k) => o?.[k]).find((v) => v !== undefined && v !== null && v !== '') ?? fallback;
const dateOf = (o) => String(val(o, ['date', 'attendanceDate', 'visitDate', 'createdAt', 'checkInAt', 'timestamp', 'updatedAt'], '')).slice(0, 10);
const statusOf = (o) => String(val(o, ['status', 'attendanceStatus', 'visitStatus'], '-'));

function ensureArrays(db) {
  for (const key of ['reportJobs', 'reportExports', 'auditLogs']) if (!Array.isArray(db[key])) db[key] = [];
}

function filtersFromUI() {
  const form = document.getElementById('rptFilterForm');
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

function scope(db) {
  const role = String(account()?.role || 'employee').toLowerCase();
  if (role === 'manager' || role === 'admin') return { employeeIds: null, projectIds: null };
  const employeeId = account()?.employeeId;
  const assignments = db.projectAssignments || [];
  const ownProjects = assignments.filter((a) => a.employeeId === employeeId && a.status === 'active').map((a) => a.projectId);
  if (role === 'supervisor') {
    const employeeIds = new Set([employeeId]);
    assignments.filter((a) => ownProjects.includes(a.projectId) && a.status === 'active' && (!a.supervisorId || a.supervisorId === employeeId || a.employeeId === employeeId)).forEach((a) => employeeIds.add(a.employeeId));
    return { employeeIds, projectIds: new Set(ownProjects) };
  }
  return { employeeIds: new Set([employeeId]), projectIds: new Set(ownProjects) };
}

function buildReport(filters = {}) {
  const db = readDB();
  const access = scope(db);
  const employees = (db.employees || []).filter((e) => !access.employeeIds || access.employeeIds.has(e.id));
  let projects = (db.projects || []).filter((p) => !access.projectIds || access.projectIds.has(p.id));
  if (filters.clientId) projects = projects.filter((p) => p.clientId === filters.clientId);
  if (filters.projectId) projects = projects.filter((p) => p.id === filters.projectId);
  const employeeIds = new Set(employees.map((e) => e.id));
  const projectIds = new Set(projects.map((p) => p.id));
  const employeeName = (id) => employees.find((e) => e.id === id)?.name || id || '-';
  const projectName = (id) => projects.find((p) => p.id === id)?.name || id || '-';
  const clientName = (id) => (db.clients || []).find((c) => c.id === id)?.name || id || '-';
  const inPeriod = (row) => {
    const d = dateOf(row);
    return (!filters.start || !d || d >= filters.start) && (!filters.end || !d || d <= filters.end);
  };
  const allowed = (row) => {
    const eid = val(row, ['employeeId', 'userId']);
    const pid = val(row, ['projectId']);
    return (!eid || employeeIds.has(eid)) && (!pid || projectIds.has(pid)) && (!filters.employeeId || eid === filters.employeeId) && (!filters.projectId || pid === filters.projectId) && inPeriod(row);
  };
  const assignments = (db.projectAssignments || []).filter((a) => (!access.projectIds || access.projectIds.has(a.projectId)) && (!access.employeeIds || access.employeeIds.has(a.employeeId)));
  const type = filters.type || 'attendance';
  let title = 'Laporan ProQTrack';
  let headers = [];
  let rows = [];
  let photos = [];

  if (type === 'attendance') {
    title = 'Laporan Kehadiran';
    headers = ['Tanggal', 'Karyawan', 'Project', 'Status', 'Jam Masuk', 'Jam Pulang', 'Lokasi'];
    rows = (db.attendance || []).filter(allowed).filter((r) => !filters.status || statusOf(r) === filters.status).map((r) => [
      dateText(dateOf(r)), employeeName(val(r, ['employeeId', 'userId'])), projectName(r.projectId), statusOf(r),
      val(r, ['checkIn', 'checkInAt', 'timeIn'], '-'), val(r, ['checkOut', 'checkOutAt', 'timeOut'], '-'), val(r, ['area', 'locationName', 'location'], '-')
    ]);
  } else if (type === 'employees') {
    title = 'Laporan Karyawan';
    headers = ['ID', 'Nama', 'Jabatan', 'Area', 'Status', 'Project Aktif'];
    rows = employees.filter((e) => !filters.employeeId || e.id === filters.employeeId).filter((e) => !filters.status || e.status === filters.status).map((e) => {
      const active = assignments.filter((a) => a.employeeId === e.id && a.status === 'active').map((a) => projectName(a.projectId));
      return [e.id, e.name, val(e, ['role', 'jobRole'], '-'), val(e, ['area', 'region'], '-'), e.status || '-', active.join(', ') || '-'];
    });
  } else if (type === 'projects') {
    title = 'Laporan Klien & Project';
    headers = ['Kode', 'Project', 'Klien', 'Status', 'Mulai', 'Selesai', 'HC Aktif', 'Jumlah Visit'];
    rows = projects.filter((p) => !filters.status || p.status === filters.status).map((p) => [
      p.code || p.id, p.name, clientName(p.clientId), p.status || '-', dateText(p.startDate), dateText(p.endDate),
      assignments.filter((a) => a.projectId === p.id && a.status === 'active').length,
      (db.visits || []).filter((v) => v.projectId === p.id && inPeriod(v)).length
    ]);
  } else if (type === 'field') {
    title = 'Laporan Aktivitas Lapangan';
    headers = ['Tanggal', 'Aktivitas', 'Karyawan', 'Project', 'Detail', 'Status'];
    const visitRows = (db.visits || []).filter(allowed).map((r) => [dateText(dateOf(r)), 'Kunjungan', employeeName(val(r, ['employeeId', 'userId'])), projectName(r.projectId), val(r, ['outletName', 'title', 'notes'], '-'), statusOf(r)]);
    const photoSource = db.fieldPhotos || db.photos || [];
    const photoRows = photoSource.filter(allowed).map((r) => [dateText(dateOf(r)), 'Foto', employeeName(val(r, ['employeeId', 'userId'])), projectName(r.projectId), val(r, ['title', 'category', 'photoType'], '-'), statusOf(r)]);
    rows = [...visitRows, ...photoRows];
    photos = photoSource.filter(allowed);
  } else {
    title = 'Laporan Supervisor';
    headers = ['Supervisor', 'Anggota', 'Project', 'Record Absensi', 'Kehadiran'];
    const supervisors = employees.filter((e) => /supervisor/i.test(String(e.role || '')) || assignments.some((a) => a.employeeId === e.id && a.roleOnProject === 'supervisor'));
    rows = supervisors.map((s) => {
      const team = new Set(assignments.filter((a) => a.supervisorId === s.id && a.status === 'active').map((a) => a.employeeId));
      const projectSet = new Set(assignments.filter((a) => (a.employeeId === s.id || a.supervisorId === s.id) && a.status === 'active').map((a) => a.projectId));
      const attendance = (db.attendance || []).filter((a) => team.has(a.employeeId) && inPeriod(a));
      const present = attendance.filter((a) => /present|hadir|late|terlambat/i.test(statusOf(a))).length;
      return [s.name, team.size, projectSet.size, attendance.length, attendance.length ? `${Math.round((present / attendance.length) * 100)}%` : '-'];
    });
  }

  return { db, type, title, headers, rows, photos, filters, generatedAt: now() };
}

function filename(report, ext) {
  const period = [report.filters.start, report.filters.end].filter(Boolean).join('_') || new Date().toISOString().slice(0, 10);
  return `${safeName(report.title)}_${period}.${ext}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvText(report) {
  const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const metadata = [
    ['Judul', report.title],
    ['Dibuat', new Date(report.generatedAt).toLocaleString('id-ID')],
    ['Periode', `${report.filters.start || '-'} s.d. ${report.filters.end || '-'}`],
    []
  ];
  return '\ufeff' + [...metadata, report.headers, ...report.rows].map((row) => row.map(quote).join(',')).join('\r\n');
}

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  const mod = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  return mod.default;
}

async function xlsxBlob(report) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const allRows = [report.headers, ...report.rows];
  const cell = (value, r, c) => {
    const ref = `${columnName(c + 1)}${r + 1}`;
    const numeric = typeof value === 'number' && Number.isFinite(value);
    return numeric ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  };
  const sheetRows = allRows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => cell(value, r, c)).join('')}</row>`).join('');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.folder('xl').folder('_rels').file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.folder('xl').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`);
  zip.folder('xl').folder('worksheets').file('sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function columnName(n) {
  let out = '';
  while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
}

async function docxBlob(report) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const paragraph = (text, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
  const tableRows = [report.headers, ...report.rows].map((row, index) => `<w:tr>${row.map((v) => `<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r>${index === 0 ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${xml(v)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph(report.title, true)}${paragraph(`Dibuat: ${new Date(report.generatedAt).toLocaleString('id-ID')}`)}${paragraph(`Periode: ${report.filters.start || '-'} s.d. ${report.filters.end || '-'}`)}<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${tableRows}</w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder('word').file('document.xml', documentXml);
  zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

async function pdfBlob(report) {
  const mod = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
  const doc = new mod.jsPDF({ orientation: report.headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 36;
  let y = 42;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(report.title, margin, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Dibuat: ${new Date(report.generatedAt).toLocaleString('id-ID')}`, margin, y); y += 13; doc.text(`Periode: ${report.filters.start || '-'} s.d. ${report.filters.end || '-'}`, margin, y); y += 20;
  const colWidth = Math.max(58, (width - margin * 2) / report.headers.length);
  const drawRow = (row, header = false) => {
    const lines = row.map((v) => doc.splitTextToSize(String(v ?? ''), colWidth - 8));
    const rowHeight = Math.max(18, Math.max(...lines.map((l) => l.length)) * 10 + 6);
    if (y + rowHeight > height - margin) { doc.addPage(); y = margin; }
    if (header) { doc.setFillColor(245, 245, 245); doc.rect(margin, y, colWidth * row.length, rowHeight, 'F'); doc.setFont('helvetica', 'bold'); }
    else doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    row.forEach((v, i) => { doc.rect(margin + i * colWidth, y, colWidth, rowHeight); doc.text(lines[i], margin + i * colWidth + 4, y + 11); });
    y += rowHeight;
  };
  drawRow(report.headers, true);
  report.rows.forEach((row) => drawRow(row));
  return doc.output('blob');
}

function htmlDocument(report) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{font-size:22px;margin-bottom:4px}.meta{font-size:12px;color:#555;margin-bottom:18px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:7px;text-align:left}th{background:#f2f2f2}@media print{body{padding:0}}</style></head><body><h1>${esc(report.title)}</h1><div class="meta">Dibuat: ${esc(new Date(report.generatedAt).toLocaleString('id-ID'))}<br>Periode: ${esc(report.filters.start || '-')} s.d. ${esc(report.filters.end || '-')}</div><table><thead><tr>${report.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${report.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}

async function addPhotosToZip(zip, report) {
  const folder = zip.folder('foto-pendukung');
  const manifest = [];
  for (const [index, photo] of report.photos.slice(0, 50).entries()) {
    const source = val(photo, ['dataUrl', 'imageData', 'url', 'src', 'photoUrl']);
    if (!source) continue;
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      const name = `${String(index + 1).padStart(3, '0')}-${safeName(val(photo, ['title', 'category', 'photoType'], 'foto'))}.${ext}`;
      folder.file(name, blob);
      manifest.push({ name, employeeId: photo.employeeId || '', projectId: photo.projectId || '', date: dateOf(photo) });
    } catch (error) {
      manifest.push({ source, error: String(error.message || error) });
    }
  }
  folder.file('manifest.json', JSON.stringify(manifest, null, 2));
}

function recordExport(report, format, fileName, status = 'completed', error = '') {
  const db = readDB();
  ensureArrays(db);
  const jobId = `RPJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const item = {
    id: `RPE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    jobId,
    type: report.type,
    title: report.title,
    format,
    fileName,
    filters: report.filters,
    rowCount: report.rows.length,
    status,
    error,
    createdAt: now(),
    createdBy: account()?.id || null,
    createdByName: account()?.email || account()?.name || '-'
  };
  db.reportJobs.push({ id: jobId, reportType: report.type, format, status, createdAt: item.createdAt, completedAt: status === 'completed' ? item.createdAt : null, error });
  db.reportExports.push(item);
  db.auditLogs.push({ id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, createdAt: item.createdAt, actorId: account()?.id, actorName: item.createdByName, action: status === 'completed' ? 'export' : 'export_failed', entityType: 'report', entityId: item.id, description: `${format.toUpperCase()} ${report.title} (${report.rows.length} baris)` });
  writeDB(db);
  return item;
}

async function runExport(format) {
  const filters = filtersFromUI();
  const report = buildReport(filters);
  if (!report.rows.length) {
    window.showToast?.('Tidak ada data untuk diekspor', 'error');
    return;
  }
  const button = document.querySelector(`[data-export-format="${format}"]`);
  const original = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Memproses...'; }
  let fileName = '';
  try {
    if (format === 'csv') {
      fileName = filename(report, 'csv');
      download(new Blob([csvText(report)], { type: 'text/csv;charset=utf-8' }), fileName);
    } else if (format === 'xlsx') {
      fileName = filename(report, 'xlsx');
      download(await xlsxBlob(report), fileName);
    } else if (format === 'docx') {
      fileName = filename(report, 'docx');
      download(await docxBlob(report), fileName);
    } else if (format === 'pdf') {
      fileName = filename(report, 'pdf');
      download(await pdfBlob(report), fileName);
    } else if (format === 'print') {
      fileName = filename(report, 'html');
      const w = window.open('', '_blank', 'noopener,noreferrer');
      if (!w) throw new Error('Popup diblokir browser');
      w.document.write(htmlDocument(report));
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    } else if (format === 'zip') {
      fileName = filename(report, 'zip');
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      zip.file(filename(report, 'csv'), csvText(report));
      zip.file(filename(report, 'xlsx'), await xlsxBlob(report));
      zip.file(filename(report, 'docx'), await docxBlob(report));
      zip.file(filename(report, 'pdf'), await pdfBlob(report));
      zip.file('metadata.json', JSON.stringify({ title: report.title, filters: report.filters, generatedAt: report.generatedAt, rowCount: report.rows.length }, null, 2));
      if (report.type === 'field' && report.photos.length) await addPhotosToZip(zip, report);
      download(await zip.generateAsync({ type: 'blob' }), fileName);
    }
    recordExport(report, format, fileName);
    window.showToast?.(`${format.toUpperCase()} berhasil dibuat`, 'success');
    refreshHistory();
  } catch (error) {
    recordExport(report, format, fileName || '-', 'failed', String(error.message || error));
    window.showToast?.(`Export gagal: ${error.message || error}`, 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

function exportControls() {
  return `<div class="rpt-export-panel"><div><strong>Export Laporan</strong><p>Gunakan filter di atas, lalu pilih format keluaran.</p></div><div class="rpt-export-actions"><button class="btn btn-secondary btn-sm" data-export-format="csv" onclick="ReportExport.run('csv')">CSV</button><button class="btn btn-secondary btn-sm" data-export-format="xlsx" onclick="ReportExport.run('xlsx')">XLSX</button><button class="btn btn-secondary btn-sm" data-export-format="docx" onclick="ReportExport.run('docx')">DOCX</button><button class="btn btn-secondary btn-sm" data-export-format="pdf" onclick="ReportExport.run('pdf')">PDF</button><button class="btn btn-secondary btn-sm" data-export-format="print" onclick="ReportExport.run('print')">Print</button><button class="btn btn-primary btn-sm" data-export-format="zip" onclick="ReportExport.run('zip')">ZIP + Lampiran</button></div></div>`;
}

function injectControls() {
  const builder = document.querySelector('.rpt-builder');
  if (!builder || builder.querySelector('.rpt-export-panel')) return;
  builder.insertAdjacentHTML('beforeend', exportControls());
}

function injectNav() {
  document.querySelectorAll('.rpt-nav').forEach((nav) => {
    if (!nav.querySelector(`[href="${REPORT_EXPORT_ROUTE}"]`)) nav.insertAdjacentHTML('beforeend', `<a href="${REPORT_EXPORT_ROUTE}" class="${location.hash === REPORT_EXPORT_ROUTE ? 'active' : ''}">Riwayat Ekspor</a>`);
  });
}

function historyHTML() {
  const db = readDB();
  ensureArrays(db);
  const rows = db.reportExports.slice().reverse();
  const table = rows.length ? `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Waktu</th><th>Laporan</th><th>Format</th><th>Baris</th><th>Status</th><th>File</th><th>Dibuat Oleh</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(new Date(r.createdAt).toLocaleString('id-ID'))}</td><td>${esc(r.title)}</td><td><span class="rpt-badge">${esc(String(r.format).toUpperCase())}</span></td><td>${esc(r.rowCount)}</td><td><span class="rpt-badge ${r.status === 'failed' ? 'rpt-badge-error' : ''}">${esc(r.status)}</span>${r.error ? `<div class="rpt-error-text">${esc(r.error)}</div>` : ''}</td><td>${esc(r.fileName)}</td><td>${esc(r.createdByName || '-')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="rpt-empty">Belum ada riwayat ekspor.</div>';
  return `<div class="rpt-wrap"><div class="rpt-nav"><a href="#/reports">Ringkasan</a><a href="#/reports/attendance">Kehadiran</a><a href="#/reports/employees">Karyawan</a><a href="#/reports/projects">Klien & Project</a><a href="#/reports/field">Aktivitas Lapangan</a><a href="#/reports/supervisors">Supervisor</a><a href="#/reports/audit">Audit</a><a class="active" href="${REPORT_EXPORT_ROUTE}">Riwayat Ekspor</a></div><div class="rpt-page-title"><div><h3>Riwayat Ekspor</h3><p style="color:var(--gray-500);font-size:12px">Jejak file yang dihasilkan pada perangkat ini.</p></div><button class="btn btn-secondary btn-sm" onclick="ReportExport.clearHistory()">Bersihkan Riwayat</button></div>${table}</div>`;
}

function renderHistoryRoute() {
  if (location.hash !== REPORT_EXPORT_ROUTE) return false;
  const root = document.querySelector('.content');
  if (!root) return false;
  root.innerHTML = historyHTML();
  root.dataset.reportsRoute = REPORT_EXPORT_ROUTE;
  const title = document.querySelector('.topbar-title'); if (title) title.textContent = 'Laporan';
  const subtitle = document.querySelector('.topbar-subtitle'); if (subtitle) { subtitle.textContent = 'Riwayat ekspor dokumen dan datasheet'; subtitle.style.display = 'block'; }
  return true;
}

function refreshHistory() {
  if (location.hash === REPORT_EXPORT_ROUTE) renderHistoryRoute();
}

function injectStyles() {
  if (document.getElementById('reports-export-css')) return;
  const style = document.createElement('style');
  style.id = 'reports-export-css';
  style.textContent = `.rpt-export-panel{margin-top:14px;padding:14px;border:1px solid var(--gray-200);border-radius:12px;background:var(--gray-50);display:flex;justify-content:space-between;gap:14px;align-items:center}.rpt-export-panel strong{display:block;font-size:14px}.rpt-export-panel p{font-size:11px;color:var(--gray-500);margin:2px 0 0}.rpt-export-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.rpt-export-actions button:disabled{opacity:.6;cursor:wait}.rpt-badge-error{background:#fef2f2;color:#b91c1c}.rpt-error-text{font-size:10px;color:#b91c1c;max-width:220px;margin-top:3px}@media(max-width:760px){.rpt-export-panel{align-items:stretch;flex-direction:column}.rpt-export-actions{justify-content:flex-start}.rpt-export-actions .btn{flex:1}}`;
  document.head.appendChild(style);
}

window.ReportExport = {
  run: runExport,
  clearHistory() {
    if (!confirm('Hapus seluruh riwayat ekspor pada browser ini?')) return;
    const db = readDB(); ensureArrays(db); db.reportExports = []; db.reportJobs = []; writeDB(db); renderHistoryRoute(); window.showToast?.('Riwayat ekspor dibersihkan', 'success');
  }
};

let queued = false;
function sync() {
  queued = false;
  injectStyles();
  if (!renderHistoryRoute()) {
    injectControls();
    injectNav();
  }
}
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(sync); } }).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', () => setTimeout(sync));
window.addEventListener('storage', sync);
sync();
export {};
