import { getDB, persistDB } from '../lib/db.js';

const ROUTES = new Set(['#/reports/templates', '#/reports/approvals', '#/reports/schedules']);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[char]));
const arg = value => esc(JSON.stringify(String(value ?? '')));
const read = () => getDB();
const account = () => window.FT?.state?.account || {};
const role = () => String(account().role || '').toLowerCase();
const canManage = () => ['superadmin', 'head', 'manager', 'admin'].includes(role());
const canApprove = () => ['superadmin', 'head', 'admin'].includes(role());
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const fmt = value => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-';

function writeLocal(db) {
  const live = getDB();
  if (db && db !== live) Object.assign(live, db);
  persistDB('report-presentation-settings');
}

function initLocalPresentation() {
  const db = read();
  let changed = false;
  for (const key of ['reportTemplates', 'reportExports', 'reportJobs', 'auditLogs']) {
    if (!Array.isArray(db[key])) { db[key] = []; changed = true; }
  }
  if (!db.reportSettings) {
    db.reportSettings = {
      companyName: 'ProQTrack',
      companyLogo: './assets/logo-light.svg',
      documentPrefix: 'PQT/RPT',
      nextNumber: 1,
      signatureName: '',
      signatureTitle: '',
      signatureImage: '',
      updatedAt: now(),
    };
    changed = true;
  }
  if (changed) writeLocal(db);
}

function auditLocal(db, action, entityType, entityId, description) {
  db.auditLogs.push({
    id: uid('AUD'),
    createdAt: now(),
    actorId: account().id || null,
    actorName: account().email || account().name || '-',
    action,
    entityType,
    entityId,
    description,
  });
}

function documentNumber(db) {
  const settings = db.reportSettings || {};
  return `${settings.documentPrefix || 'PQT/RPT'}/${String(settings.nextNumber || 1).padStart(5, '0')}/${new Date().getFullYear()}`;
}

function tabs() {
  const links = [
    ['#/reports', 'Ringkasan'], ['#/reports/attendance', 'Kehadiran'], ['#/reports/employees', 'Karyawan'],
    ['#/reports/projects', 'Klien & Project'], ['#/reports/field', 'Aktivitas Lapangan'], ['#/reports/stocks', 'Stok'],
    ['#/reports/prices', 'Harga'], ['#/reports/competitors', 'Kompetitor'], ['#/reports/supervisors', 'Supervisor'],
    ['#/reports/custom', 'Custom'], ['#/reports/audit', 'Audit'], ['#/reports/templates', 'Template'],
    ['#/reports/approvals', 'Approval'], ['#/reports/schedules', 'Terjadwal'],
  ];
  return `<nav class="rpt-nav" aria-label="Navigasi laporan">${links.map(([route, label]) =>
    `<a href="${route}" class="${location.hash === route ? 'active' : ''}">${label}</a>`).join('')}</nav>`;
}

function table(headers, rows) {
  return rows.length
    ? `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<div class="rpt-empty">Belum ada data.</div>';
}

function page(title, subtitle, body) {
  return `<div class="rpt-wrap">${tabs()}<div class="rpt-page-title"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div></div>${body}</div>`;
}

function templatesPage() {
  const db = read();
  const settings = db.reportSettings || {};
  const form = `<div class="rpt-builder">
    <div class="rpt-warning">Template dan identitas dokumen adalah preferensi presentasi pada perangkat ini. Approval dan jadwal bersumber dari server.</div>
    <form class="rpt-filters" onsubmit="ReportPhase4.saveSettings(event)">
      <div><label class="label">Nama perusahaan</label><input class="input" name="companyName" value="${esc(settings.companyName)}"></div>
      <div><label class="label">Logo perusahaan</label><input class="input" type="file" name="companyLogoFile" accept="image/jpeg,image/png,image/webp"><input class="input" name="companyLogo" value="${esc(settings.companyLogo || '')}" placeholder="Atau URL / path"></div>
      <div><label class="label">Prefix nomor dokumen</label><input class="input" name="documentPrefix" value="${esc(settings.documentPrefix)}"></div>
      <div><label class="label">Nomor berikutnya</label><input class="input" type="number" min="1" name="nextNumber" value="${Number(settings.nextNumber || 1)}"></div>
      <div><label class="label">Nama penandatangan</label><input class="input" name="signatureName" value="${esc(settings.signatureName)}"></div>
      <div><label class="label">Jabatan</label><input class="input" name="signatureTitle" value="${esc(settings.signatureTitle)}"></div>
      <div><label class="label">Gambar tanda tangan</label><input class="input" type="file" name="signatureImageFile" accept="image/jpeg,image/png,image/webp"><input class="input" name="signatureImage" value="${esc(settings.signatureImage || '')}" placeholder="Atau URL"></div>
      <div class="rpt-actions"><button class="btn btn-primary" ${canManage() ? '' : 'disabled'}>Simpan Identitas</button></div>
    </form>
    <div class="rpt-warning">Nomor dokumen berikutnya: <strong>${esc(documentNumber(db))}</strong></div>
  </div>`;
  const rows = (db.reportTemplates || []).map(template => [
    esc(template.name), esc(template.type), esc(template.layout || '-'),
    template.includeCompanyLogo ? 'Ya' : 'Tidak', template.includeClientLogo ? 'Ya' : 'Tidak',
    template.requireApproval ? 'Ya' : 'Tidak', `<span class="rpt-badge">${esc(template.status)}</span>`,
    `<button class="btn btn-secondary btn-sm" onclick="ReportPhase4.editTemplate(${arg(template.id)})" ${canManage() ? '' : 'disabled'}>Edit</button>`,
  ]);
  return page('Template Dokumen', 'Preferensi layout dan branding dokumen.', form +
    `<div class="rpt-page-title"><div><h3>Daftar Template</h3><p>Konfigurasi presentasi lokal.</p></div><button class="btn btn-primary btn-sm" onclick="ReportPhase4.newTemplate()" ${canManage() ? '' : 'disabled'}>Tambah Template</button></div>` +
    table(['Nama','Jenis','Layout','Logo Perusahaan','Logo Klien','Approval','Status','Aksi'], rows));
}

function approvalsPage() {
  return page('Approval Laporan', 'Workflow approval tersimpan terpusat dan konsisten antar perangkat.',
    '<div id="r4-cloud-approvals" class="rpt-empty">Memuat approval...</div>');
}

function schedulesPage() {
  const projects = (read().projects || []);
  const form = `<div class="rpt-builder">
    <form class="rpt-filters" onsubmit="ReportPhase4.saveSchedule(event)">
      <div><label class="label">Nama jadwal</label><input class="input" name="name" required></div>
      <div><label class="label">Jenis laporan</label><select class="select" name="reportType">
        <option value="attendance">Kehadiran</option><option value="activity">Aktivitas Lapangan</option>
        <option value="sales">Penjualan</option><option value="surveys">Survey</option>
        <option value="operational_summary">Ringkasan Operasional</option>
      </select></div>
      <div><label class="label">Project</label><select class="select" name="projectId"><option value="">Semua yang diizinkan</option>${projects.map(p => `<option value="${esc(p.id)}">${esc(p.code || p.id)} — ${esc(p.name)}</option>`).join('')}</select></div>
      <div><label class="label">Frekuensi</label><select class="select" name="cadence"><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></select></div>
      <div><label class="label">Jam</label><input class="input" type="number" min="0" max="23" name="runHour" value="8"></div>
      <div><label class="label">Hari</label><input class="input" type="number" min="1" max="28" name="runDay" value="1"></div>
      <div><label class="label">Format</label><select class="select" name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></div>
      <div><label class="label"><input type="checkbox" name="requiresApproval" value="1"> Perlu approval sebelum publish</label></div>
      <div class="rpt-actions"><button class="btn btn-primary" ${canManage() ? '' : 'disabled'}>Simpan Jadwal</button></div>
    </form>
  </div>
  <div id="r4-cloud-schedules" class="rpt-empty">Memuat jadwal...</div>`;
  return page('Laporan Terjadwal', 'Jadwal report bersumber dari server dan berlaku lintas perangkat.', form);
}

function cloud() {
  const api = window.ProQTrackM6;
  if (!api) throw new Error('Layanan laporan belum siap. Muat ulang halaman.');
  return api;
}

async function refreshApprovals() {
  const root = document.getElementById('r4-cloud-approvals');
  if (!root) return;
  try {
    const data = await cloud().workflows.list({ type: 'report_publish', limit: 100 });
    if (!root.isConnected || location.hash !== '#/reports/approvals') return;
    const rows = (data.workflows || []).map(item => [
      esc(item.subject_id || '-'),
      esc(item.requested_by || '-'),
      fmt(item.created_at),
      `<span class="rpt-badge">${esc(item.status || '-')}</span>`,
      esc(item.current_step || '-'),
      item.status === 'pending' && canApprove()
        ? `<button class="btn btn-primary btn-sm" onclick="ReportPhase4.approve(${arg(item.id)})">Setujui</button> <button class="btn btn-danger btn-sm" onclick="ReportPhase4.reject(${arg(item.id)})">Tolak</button>`
        : '-',
    ]);
    root.innerHTML = table(['Report ID','Pemohon','Waktu','Status','Step','Aksi'], rows);
  } catch (error) {
    root.innerHTML = `<div class="rpt-empty">${esc(error.message || 'Gagal memuat approval.')}</div>`;
  }
}

async function refreshSchedules() {
  const root = document.getElementById('r4-cloud-schedules');
  if (!root) return;
  try {
    const data = await cloud().schedules.list();
    if (!root.isConnected || location.hash !== '#/reports/schedules') return;
    const rows = (data.schedules || []).map(item => [
      esc(item.name), esc(item.report_type), esc(item.project_id || 'Semua'),
      esc(item.cadence), esc(String(item.run_hour ?? '-')), fmt(item.next_run_at),
      `<span class="rpt-badge">${esc(item.status)}</span>`,
      `<button class="btn btn-secondary btn-sm" onclick="ReportPhase4.toggleSchedule(${arg(item.id)},${arg(item.status)})" ${canManage() ? '' : 'disabled'}>${item.status === 'active' ? 'Jeda' : 'Aktifkan'}</button>`,
    ]);
    root.innerHTML = table(['Nama','Jenis','Project','Frekuensi','Jam','Jadwal Berikutnya','Status','Aksi'], rows);
  } catch (error) {
    root.innerHTML = `<div class="rpt-empty">${esc(error.message || 'Gagal memuat jadwal.')}</div>`;
  }
}

function render(force = false) {
  if (location.hash === '#/reports/archive' || location.hash === '#/reports/exports') {
    location.hash = '#/reports';
    return true;
  }
  if (!ROUTES.has(location.hash)) return false;
  const root = document.querySelector('.content');
  if (!root) return false;
  if (!force && root.dataset.reportPhase4Route === location.hash && root.querySelector('.rpt-wrap')) return true;

  let html = templatesPage();
  if (location.hash === '#/reports/approvals') html = approvalsPage();
  else if (location.hash === '#/reports/schedules') html = schedulesPage();

  root.innerHTML = html;
  root.dataset.reportPhase4Route = location.hash;
  const title = document.querySelector('.topbar-title');
  if (title) title.textContent = 'Reports';
  if (location.hash === '#/reports/approvals') void refreshApprovals();
  if (location.hash === '#/reports/schedules') void refreshSchedules();
  return true;
}

window.ReportPhase4 = {
  async saveSettings(event) {
    event.preventDefault();
    if (!canManage()) return;
    const db = read();
    const form = event.target;
    const fields = Object.fromEntries(new FormData(form));
    if (window.R2?.uploadAsset) {
      try {
        if (form.companyLogoFile?.files?.[0]) {
          const uploaded = await window.R2.uploadAsset(form.companyLogoFile.files[0], { category: 'company-logo', projectId: 'general' });
          fields.companyLogo = uploaded.url;
        }
        if (form.signatureImageFile?.files?.[0]) {
          const uploaded = await window.R2.uploadAsset(form.signatureImageFile.files[0], { category: 'signature', projectId: 'general' });
          fields.signatureImage = uploaded.url;
        }
      } catch {
        window.showToast?.('Unggah file gagal. Coba lagi.', 'error');
      }
    }
    delete fields.companyLogoFile;
    delete fields.signatureImageFile;
    db.reportSettings = { ...db.reportSettings, ...fields, nextNumber: Math.max(1, Number(fields.nextNumber || 1)), updatedAt: now() };
    auditLocal(db, 'update', 'report_settings', 'primary', 'Memperbarui identitas dokumen lokal');
    writeLocal(db);
    render(true);
  },

  newTemplate() {
    if (!canManage()) return;
    const name = prompt('Nama template');
    if (!name) return;
    const db = read();
    db.reportTemplates.push({
      id: uid('TPL'), name: String(name).trim(), type: 'custom', layout: 'portrait',
      includeCompanyLogo: true, includeClientLogo: false, requireApproval: false,
      status: 'active', columns: [], createdAt: now(),
    });
    writeLocal(db);
    render(true);
  },

  editTemplate(id) {
    if (!canManage()) return;
    const db = read();
    const template = db.reportTemplates.find(item => item.id === id);
    if (!template) return;
    const name = prompt('Nama template', template.name);
    if (!name) return;
    template.name = String(name).trim();
    template.layout = template.layout === 'portrait' ? 'landscape' : 'portrait';
    template.updatedAt = now();
    writeLocal(db);
    render(true);
  },

  async approve(id) {
    try {
      await cloud().workflows.action(id, 'approve');
      window.showToast?.('Approval tersimpan', 'success');
      await refreshApprovals();
    } catch (error) {
      window.showToast?.(error.message || 'Approval gagal', 'error');
    }
  },

  async reject(id) {
    const reason = prompt('Alasan penolakan') || '';
    try {
      await cloud().workflows.action(id, 'reject', reason);
      window.showToast?.('Penolakan tersimpan', 'success');
      await refreshApprovals();
    } catch (error) {
      window.showToast?.(error.message || 'Penolakan gagal', 'error');
    }
  },

  async saveSchedule(event) {
    event.preventDefault();
    if (!canManage()) return;
    const fields = Object.fromEntries(new FormData(event.target));
    try {
      await cloud().schedules.create({
        name: fields.name,
        reportType: fields.reportType,
        projectId: fields.projectId || null,
        cadence: fields.cadence,
        runHour: Number(fields.runHour || 8),
        runDay: Number(fields.runDay || 1),
        timezone: read().appSettings?.timezone || 'Asia/Jakarta',
        format: fields.format || 'csv',
        requiresApproval: fields.requiresApproval === '1',
        filters: {},
      });
      event.target.reset();
      window.showToast?.('Jadwal tersimpan', 'success');
      await refreshSchedules();
    } catch (error) {
      window.showToast?.(error.message || 'Jadwal gagal disimpan', 'error');
    }
  },

  async toggleSchedule(id, status) {
    if (!canManage()) return;
    const next = status === 'active' ? 'paused' : 'active';
    try {
      await cloud().schedules.setStatus(id, next);
      window.showToast?.('Status jadwal diperbarui', 'success');
      await refreshSchedules();
    } catch (error) {
      window.showToast?.(error.message || 'Status jadwal gagal diperbarui', 'error');
    }
  },
};

function sync() { render(false); }
window.addEventListener('hashchange', () => setTimeout(sync, 40));
window.addEventListener('proqtrack:db-updated', () => { if (ROUTES.has(location.hash)) render(true); });
window.addEventListener('proqtrack:m6-ready', () => { if (location.hash === '#/reports/approvals') void refreshApprovals(); if (location.hash === '#/reports/schedules') void refreshSchedules(); });
initLocalPresentation();
setTimeout(sync, 60);

export {};
