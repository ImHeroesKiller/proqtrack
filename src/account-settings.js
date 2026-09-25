import {
  getAccounts, getEmployees, getAppSettings, updateAppSettings,
  getDB, getOrganization, getCurrentOrgId,
  getProjectStoreSettings, saveProjectStoreSettings, saveProjectAttendanceSettings, defaultStoreCatalog,
  getAttendancePoints, createAttendancePoint,
} from './lib/db.js';
import { getApiToken, revokeApiSession } from './lib/uploads.js';
import {
  syncCloudAccounts, createCloudAccount, updateCloudAccount,
  resetCloudAccountDevice, changeCloudPassword, updateCloudProfile,
} from './lib/cloud-accounts.js';
import {
  syncCurrentOrganizationProfile, updateCurrentOrganizationProfile,
} from './lib/cloud-organizations.js';
import { applyOrganizationBranding, normalizeThemeColor } from './lib/organization-branding.js';
import { commitOperationalChanges } from './lib/cloud-data.js';

import { esc, formatDate, formatDateShort, getInitials, statusBadge, safePhotoUrl, compressImage } from './lib/utils.js';

function account() {
  return window.FT?.state?.account || null;
}

function toast(msg, type = 'success') {
  window.showToast?.(msg, type);
}

function roleLabel(role) {
  return { superadmin: 'Superadmin', head: 'Head', admin: 'Admin', manager: 'Manager', supervisor: 'Supervisor', employee: 'Field Sales' }[role] || role || '—';
}

function statusLabel(status) {
  return { active: 'Aktif', inactive: 'Nonaktif', suspended: 'Ditangguhkan' }[status] || status || '—';
}

function managedRoles(actorRole) {
  if (actorRole === 'superadmin') return ['head','admin','manager','supervisor','employee'];
  if (actorRole === 'head') return ['admin','manager','supervisor','employee'];
  if (actorRole === 'admin') return ['manager','supervisor','employee'];
  return [];
}

function canManageAccount(actor, target) {
  if (!actor || !target) return false;
  if (String(actor.id) === String(target.id)) return ['superadmin','head','admin'].includes(actor.role);
  return managedRoles(actor.role).includes(target.role);
}

function canChangeAccountStatus(actor, target) {
  return canManageAccount(actor,target) && String(actor?.id || '') !== String(target?.id || '');
}

function profileErrorMessage(error) {
  const messages = {
    EMAIL_ALREADY_USED:'Email sudah digunakan akun lain.',
    EMAIL_INVALID:'Format email tidak valid.',
    PROFILE_NAME_REQUIRED:'Nama tampilan wajib diisi.',
    AUTH_REQUIRED:'Sesi sudah berakhir. Silakan login kembali.',
    SESSION_REVOKED:'Sesi sudah dicabut. Silakan login kembali.',
  };
  return messages[error?.code] || error?.message || String(error || 'Profil gagal disimpan.');
}

function passwordErrorMessage(error) {
  const messages = {
    INVALID_CURRENT_PASSWORD:'Password saat ini tidak sesuai.',
    PASSWORD_UNCHANGED:'Password baru harus berbeda dari password saat ini.',
    PASSWORD_TOO_SHORT:'Password baru minimal 8 karakter.',
    AUTH_REQUIRED:'Sesi sudah berakhir. Silakan login kembali.',
    SESSION_REVOKED:'Sesi sudah dicabut. Silakan login kembali.',
  };
  return messages[error?.code] || error?.message || String(error || 'Password gagal diperbarui.');
}

function accountErrorMessage(error) {
  const messages = {
    EMAIL_ALREADY_USED: 'Email sudah terdaftar. Segarkan daftar akun lalu gunakan akun yang sudah ada.',
    ACCOUNT_ALREADY_IN_ORGANIZATION: 'Email ini sudah menjadi akun di organisasi ini. Gunakan Edit, bukan Tambah Akun.',
    ACCOUNT_IS_GLOBAL_SUPERADMIN: 'Akun Superadmin global tidak dapat ditautkan melalui form ini.',
    EXISTING_ACCOUNT_DISABLED: 'Akun existing sedang dinonaktifkan secara global.',
    EMPLOYEE_ALREADY_LINKED: 'Karyawan tersebut sudah tertaut ke akun lain.',
    EMPLOYEE_NOT_FOUND: 'Karyawan yang dipilih tidak ditemukan.',
    PROJECT_REQUIRED: 'Project wajib dipilih untuk role Manager.',
    PROJECT_NOT_FOUND: 'Project yang dipilih tidak ditemukan atau tidak aktif.',
    ACCOUNT_FORBIDDEN: 'Anda tidak memiliki izin untuk mengubah akun ini.',
    ACCOUNT_ROLE_FORBIDDEN: 'Anda tidak memiliki izin untuk menetapkan role tersebut.',
    SELF_ROLE_CHANGE_FORBIDDEN: 'Role akun Anda sendiri tidak dapat diubah dari halaman ini.',
    SELF_DISABLE_FORBIDDEN: 'Akun yang sedang digunakan tidak dapat dinonaktifkan.',
    PASSWORD_TOO_SHORT: 'Password minimal 8 karakter.',
    EMAIL_INVALID: 'Format email tidak valid.',
    ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN: 'Email login adalah identitas global. Ubah email hanya dari Profil pemilik akun.',
    ACCOUNT_GLOBAL_PASSWORD_EDIT_FORBIDDEN: 'Password adalah credential global. Pemilik akun harus mengubahnya dari tab Keamanan.',
  };
  const message = messages[error?.code] || error?.message || String(error || 'Aksi akun gagal.');
  const requestId = error?.payload?.requestId;
  return requestId ? `${message} Ref: ${requestId}` : message;
}

function renderProjectStoreSettings() {
  const db = getDB();
  const acc = account();
  let projects = (db.projects || []).filter(p => !['completed', 'cancelled'].includes(p.status));
  if (acc?.role === 'manager' && acc.projectId) projects = projects.filter(p => p.id === acc.projectId);
  const selected = acc?.role === 'manager' && acc.projectId ? acc.projectId : (window.FT.state._storeProjectId || projects[0]?.id || '');
  const cat = selected ? getProjectStoreSettings(selected) : defaultStoreCatalog();
  const lines = arr => (arr || []).join('\n');
  return `
        <div class="card-title">Outlet catalog per project</div>
        <div class="card-subtitle">Enable New Outlet and set Segment, Type, Ownership, and Notes options for this project.</div>
        <form class="am-form" data-pqt-onsubmit="AM.saveStoreCatalog(event)">
          <div class="form-group">
            <label class="label">Project</label>
            <select class="select" name="projectId" data-pqt-onchange="AM.pickStoreProject(this.value)">
              ${projects.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.code || p.id)} — ${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          <label class="am-check"><input type="checkbox" name="allowNewOutlet" ${cat.allowNewOutlet ? 'checked' : ''}> Allow field sales to add a new outlet on this project</label>
          <div class="form-group"><label class="label">Segment (one option per line)</label><textarea class="textarea" name="segments">${esc(lines(cat.segments))}</textarea></div>
          <div class="form-group"><label class="label">Outlet type</label><textarea class="textarea" name="types">${esc(lines(cat.types))}</textarea></div>
          <div class="form-group"><label class="label">Ownership / account</label><textarea class="textarea" name="ownerships">${esc(lines(cat.ownerships))}</textarea></div>
          <div class="form-group">
            <label class="label">Notes field on New Outlet form</label>
            <select class="select" name="notesMode">
              <option value="freetext" ${cat.notesMode !== 'dropdown' ? 'selected' : ''}>Free text</option>
              <option value="dropdown" ${cat.notesMode === 'dropdown' ? 'selected' : ''}>Dropdown</option>
            </select>
          </div>
          <div class="form-group"><label class="label">Notes dropdown options (one per line)</label><textarea class="textarea" name="notesOptions">${esc(lines(cat.notesOptions))}</textarea></div>
          <button class="btn btn-primary" type="submit">Save outlet catalog</button>
        </form>`;
}

function settingsProjects() {
  const acc = account();
  let projects = (getDB().projects || []).filter(project => ['active','draft','planning'].includes(String(project.status || 'active')));
  if (acc?.role === 'manager') {
    const allowed = new Set([...(acc.projectIds || []), ...(acc.projectId ? [acc.projectId] : [])].map(String));
    projects = projects.filter(project => allowed.has(String(project.id)));
  }
  return projects;
}

function renderAttendanceSettings() {
  const projects = settingsProjects();
  const selected = projects.some(project => String(project.id) === String(window.FT.state._attendanceSettingsProjectId || ''))
    ? String(window.FT.state._attendanceSettingsProjectId)
    : String(projects[0]?.id || '');
  const project = projects.find(row => String(row.id) === selected) || null;
  const sourceMode = project?.attendanceSourceMode === 'visit' ? 'visit' : 'manual';
  const lateAfter = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(project?.attendanceLateAfter || ''))
    ? String(project.attendanceLateAfter)
    : '09:00';
  return `
        <div class="card-title">Attendance per project</div>
        <div class="card-subtitle">Authority attendance disimpan pada project dan dipakai langsung oleh server. Manual = employee melakukan attendance langsung; Visit = attendance dibentuk otomatis dari Visit.</div>
        ${project ? `
        <form class="am-form" data-pqt-onsubmit="AM.saveAttendanceProjectSettings(event)">
          <div class="form-group">
            <label class="label">Project</label>
            <select class="select" name="projectId" data-pqt-onchange="AM.pickAttendanceSettingsProject(this.value)">
              ${projects.map(row => `<option value="${esc(row.id)}" ${String(row.id) === selected ? 'selected' : ''}>${esc(row.code || row.id)} — ${esc(row.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="label">Sumber attendance</label>
              <select class="select" name="sourceMode">
                <option value="manual" ${sourceMode === 'manual' ? 'selected' : ''}>Manual attendance</option>
                <option value="visit" ${sourceMode === 'visit' ? 'selected' : ''}>Otomatis dari Visit</option>
              </select>
            </div>
            <div class="form-group">
              <label class="label">Batas terlambat</label>
              <input class="input" type="time" name="lateAfter" value="${esc(lateAfter)}" required>
            </div>
          </div>
          <div class="am-muted">Perubahan sumber attendance dapat ditolak bila attendance hari ini sudah tercatat, untuk mencegah campuran Manual dan Visit dalam project yang sama.</div>
          <button class="btn btn-primary" type="submit">Simpan pengaturan attendance</button>
        </form>
        ` : '<div class="empty-state"><h3>Tidak ada project aktif</h3><p>Aktifkan project terlebih dahulu sebelum mengatur attendance.</p></div>'}
        <hr class="am-section-divider">
        <div class="filter-row">
          <div>
            <div class="card-title">Attendance points</div>
            <div class="card-subtitle">Master titik referensi tetap cloud-authoritative dan dapat dipakai oleh data employee/project yang memerlukannya.</div>
          </div>
          <div class="spacer"></div>
          <button class="btn btn-secondary" type="button" data-pqt-onclick="BulkMaster.open('attendancePoints')">Bulk Upload</button>
        </div>
        <form class="am-form" data-pqt-onsubmit="AM.addAttendancePoint(event)">
          <div class="form-row">
            <div class="form-group"><label class="label">Nama</label><input class="input" name="pointName" required></div>
            <div class="form-group"><label class="label">Tipe</label>
              <select class="select" name="pointType"><option value="point">Point</option><option value="office">Office</option><option value="store">Outlet</option><option value="meeting">Meeting</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Latitude</label><input class="input" name="pointLat"></div>
            <div class="form-group"><label class="label">Longitude</label><input class="input" name="pointLng"></div>
          </div>
          <div class="form-group"><label class="label">Alamat</label><input class="input" name="pointAddress"></div>
          <button class="btn btn-secondary" type="submit">Tambah titik</button>
        </form>
        <ul class="am-master-list">${getAttendancePoints().map(point => `<li><strong>${esc(point.name)}</strong> · ${esc(point.type)}${point.lat != null ? ` · ${esc(point.lat)}, ${esc(point.lng)}` : ''}</li>`).join('') || '<li class="am-muted">Belum ada attendance point.</li>'}</ul>`;
}

function linkedEmployee(acc) {
  if (!acc?.employeeId) return null;
  return getEmployees().find(e => e.id === acc.employeeId) || null;
}

const TIMEZONES = [
  ['Asia/Jakarta', 'WIB — Jakarta'],
  ['Asia/Makassar', 'WITA — Makassar'],
  ['Asia/Jayapura', 'WIT — Jayapura'],
  ['UTC', 'UTC'],
];

const THEME_PRESETS = ['#ef5000','#2563eb','#0f766e','#7c3aed','#be123c','#334155'];

let organizationProfileSyncInFlight = false;
let organizationProfileSyncedOrg = '';
let organizationSaveInFlight = false;

function organizationErrorMessage(error) {
  const messages = {
    ORGANIZATION_PROFILE_FORBIDDEN: 'Anda tidak memiliki izin untuk mengubah profil organisasi.',
    ORGANIZATION_NOT_FOUND: 'Organisasi aktif tidak ditemukan.',
    ORGANIZATION_NAME_REQUIRED: 'Nama organisasi wajib diisi.',
    ORGANIZATION_TIMEZONE_INVALID: 'Zona waktu organisasi tidak valid.',
    ORGANIZATION_LOGO_INVALID: 'Format logo tidak didukung. Gunakan JPG, PNG, atau WebP.',
    ORGANIZATION_LOGO_TOO_LARGE: 'Logo terlalu besar setelah kompresi.',
    ORGANIZATION_THEME_INVALID: 'Warna tema organisasi tidak valid.',
  };
  const message = messages[error?.code] || error?.message || String(error || 'Profil organisasi gagal diperbarui.');
  const requestId = error?.payload?.requestId;
  return requestId ? `${message} Ref: ${requestId}` : message;
}

function dataUrlBytes(value) {
  const match = String(value || '').match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/i);
  if (!match) return 0;
  return Math.floor(match[1].replace(/=+$/,'').length * 3 / 4);
}

function scheduleOrganizationProfileRefresh(acc) {
  const orgId = String(acc?.organizationId || getCurrentOrgId() || '');
  if (!getApiToken() || !orgId || organizationProfileSyncInFlight || organizationProfileSyncedOrg === orgId) return;
  organizationProfileSyncInFlight = true;
  queueMicrotask(async () => {
    try {
      await syncCurrentOrganizationProfile();
      organizationProfileSyncedOrg = orgId;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(organizationErrorMessage(error), 'error');
    } finally {
      organizationProfileSyncInFlight = false;
    }
  });
}

function storageKb() {
  try {
    const raw = localStorage.getItem('proqtrack_db_v6') || '';
    return Math.round(raw.length / 1024);
  } catch {
    return 0;
  }
}

export function renderSettings() {
  const acc = account();
  if (!acc) return '<div class="card"><p>Sesi tidak ditemukan. Silakan masuk ulang.</p></div>';
  const emp = linkedEmployee(acc);
  const settings = getAppSettings();
  const isOrgAdmin = ['head','admin','superadmin'].includes(acc.role);
  if (isOrgAdmin) scheduleOrganizationProfileRefresh(acc);
  const activeOrg = getOrganization(acc.organizationId || getCurrentOrgId()) || {};
  const canAccounts = isOrgAdmin;
  const photo = safePhotoUrl(emp?.photo);
  const tabs = [
    ['profil', 'Profile'],
    ['keamanan', 'Security'],
    ['tampilan', 'Display'],
    ...(isOrgAdmin ? [['organisasi', 'Organization'], ['katalog', 'Outlet catalog'], ['absensi', 'Attendance']] : []),
    ...(acc.role === 'manager' ? [['katalog', 'Outlet catalog']] : []),
    ...(acc.role === 'employee' ? [['perangkat', 'Device']] : []),
    ['sesi', 'Session'],
  ];
  const tab = tabs.some(([id]) => id === window.FT.state._settingsTab) ? window.FT.state._settingsTab : (acc.mustChangePassword ? 'keamanan' : 'profil');
  const pane = id => `class="am-pane ${tab === id ? 'active' : ''}"`;

  return `
    <div class="am-settings">
      ${acc.mustChangePassword ? `
      <section class="card" style="border-color:#fdba74;background:#fff7ed;margin-bottom:12px">
        <div class="card-title">Wajib ganti password</div>
        <div class="card-subtitle">Ganti password di tab Keamanan sebelum memakai menu lain.</div>
      </section>` : ''}
      <nav class="am-tabs" aria-label="Pengaturan">
        ${tabs.map(([id, label]) => `<button type="button" class="am-tab ${tab === id ? 'active' : ''}" data-pqt-onclick="AM.setTab('${id}')">${esc(label)}</button>`).join('')}
      </nav>
      <div class="card am-tab-body">
        <section ${pane('profil')}>
          <div class="card-title">Profil saya</div>
          <div class="card-subtitle">Nama dan kontak yang tampil di aplikasi</div>
          <div class="am-profile">
            <div class="am-avatar" style="${photo ? `background-image:url('${photo}');background-size:cover` : ''}">${photo ? '' : esc(getInitials(acc.name))}</div>
            <div>
              <strong>${esc(acc.name)}</strong>
              <div class="am-muted">${esc(acc.email)} · ${esc(roleLabel(acc.role))}</div>
              <div class="am-muted">Login terakhir: ${acc.lastLoginAt ? formatDate(acc.lastLoginAt) : 'Baru saja'}</div>
            </div>
          </div>
          <form class="am-form" data-pqt-onsubmit="AM.saveProfile(event)">
            <div class="form-group"><label class="label">Nama tampilan</label><input class="input" name="name" value="${esc(acc.name)}" maxlength="180" required></div>
            <div class="form-group"><label class="label">Email login</label><input class="input" type="email" name="email" value="${esc(acc.email)}" required></div>
            ${emp ? `
              <div class="form-row">
                <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" maxlength="64" value="${esc(emp.phone || '')}"></div>
                <div class="form-group"><label class="label">Area</label><input class="input" name="area" maxlength="120" value="${esc(emp.area || '')}"></div>
              </div>
            ` : ''}
            <button class="btn btn-primary" type="submit">Simpan profil</button>
          </form>
        </section>

        <section ${pane('keamanan')}>
          <div class="card-title">Keamanan</div>
          <div class="card-subtitle">Ganti password akun ini. Minimal 8 karakter.</div>
          <form class="am-form" data-pqt-onsubmit="AM.savePassword(event)">
            <div class="form-group"><label class="label">Password saat ini</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></div>
            <div class="form-group"><label class="label">Password baru</label><input class="input" type="password" name="nextPassword" minlength="8" autocomplete="new-password" required></div>
            <div class="form-group"><label class="label">Ulangi password baru</label><input class="input" type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required></div>
            <button class="btn btn-primary" type="submit">Perbarui password</button>
          </form>
        </section>

        <section ${pane('tampilan')}>
          <div class="card-title">Preferensi tampilan</div>
          <form class="am-form" data-pqt-onsubmit="AM.savePrefs(event)">
            <label class="am-check"><input type="checkbox" name="compactTables" ${settings.compactTables ? 'checked' : ''}> Tabel lebih rapat</label>
            <label class="am-check"><input type="checkbox" name="notifyLeave" ${settings.notifyLeave !== false ? 'checked' : ''}> Tampilkan badge ijin/cuti pending</label>
            <label class="am-check"><input type="checkbox" name="notifyLowStock" ${settings.notifyLowStock !== false ? 'checked' : ''}> Tampilkan badge stok menipis</label>
            <button class="btn btn-secondary" type="submit">Simpan preferensi</button>
          </form>
        </section>

        ${isOrgAdmin ? `
        <section ${pane('organisasi')}>
          <div class="card-title">Organisasi</div>
          <div class="card-subtitle">Profil tenant aktif. Perubahan berlaku untuk seluruh pengguna organisasi ini.</div>
          <form class="am-form" data-pqt-onsubmit="AM.saveOrg(event)">
            <div class="form-row">
              <div class="form-group"><label class="label">Nama organisasi</label><input class="input" name="name" value="${esc(activeOrg.name || '')}" required></div>
              <div class="form-group"><label class="label">Nama legal</label><input class="input" name="legalName" value="${esc(activeOrg.legalName || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="label">Industri</label><input class="input" name="industry" value="${esc(activeOrg.industry || '')}"></div>
              <div class="form-group"><label class="label">Kota</label><input class="input" name="city" value="${esc(activeOrg.city || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="label">Zona waktu</label>
                <select class="select" name="timezone">
                  ${TIMEZONES.map(([id, label]) => `<option value="${id}" ${(activeOrg.timezone || 'Asia/Jakarta') === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label class="label">Kode organisasi</label><input class="input" value="${esc(activeOrg.code || '')}" disabled></div>
            </div>
            <div class="form-group am-theme-picker">
              <label class="label">Warna tema</label>
              <div class="am-theme-row">
                <input id="orgThemeColor" class="am-theme-color" type="color" name="themeColor" value="${esc(activeOrg.themeColor || '#ef5000')}" data-pqt-oninput="AM.previewThemeColor(this)">
                ${THEME_PRESETS.map(color => `<button type="button" class="am-theme-swatch ${(activeOrg.themeColor || '#ef5000').toLowerCase() === color ? 'active' : ''}" style="background:${color}" title="${color}" aria-label="Gunakan warna ${color}" data-pqt-onclick="AM.selectThemeColor('${color}')"></button>`).join('')}
              </div>
              <div class="am-muted">Warna ini dipakai untuk tombol utama, menu aktif, progress, highlight, mobile dock, dan browser theme.</div>
            </div>
            <div class="form-group emp-photo-field">
              <label class="label">Logo organisasi</label>
              <div class="employee-photo-editor">
                <img class="employee-photo-preview" alt="Logo" src="${esc(activeOrg.logo || './assets/logo-light.svg')}">
                <div>
                  <input class="input" type="file" name="logoFile" accept="image/jpeg,image/png,image/webp" data-pqt-onchange="AM.previewLogo(this)">
                  <input type="hidden" name="logo" value="${esc(activeOrg.logo || '')}">
                  <div class="am-muted">JPG/PNG/WebP. Maksimum 1 MB sebelum kompresi; hasil akhir disimpan pada profil organisasi.</div>
                </div>
              </div>
            </div>
            <div class="form-group"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(activeOrg.notes || '')}</textarea></div>
            <button class="btn btn-primary" type="submit">Simpan organisasi</button>
          </form>
        </section>
        <section ${pane('katalog')}>${renderProjectStoreSettings()}</section>
        <section ${pane('absensi')}>${renderAttendanceSettings()}</section>
        ` : ''}
        ${acc.role === 'manager' ? `<section ${pane('katalog')}>${renderProjectStoreSettings()}</section>` : ''}

        ${acc.role === 'employee' ? `
        <section ${pane('perangkat')}>
          <div class="card-title">Perangkat terpasang</div>
          <div class="card-subtitle">Status ini berasal dari binding perangkat server. Login pertama memasangkan perangkat; pergantian perangkat memerlukan reset oleh administrator.</div>
          ${acc.deviceBound ? `
            <div class="detail-grid">
              <div class="detail-label">Status</div><div class="detail-value"><strong>Terpasang</strong></div>
              <div class="detail-label">Perangkat</div><div class="detail-value">${esc(acc.deviceLabel || 'Perangkat field')}</div>
              <div class="detail-label">Dipasang</div><div class="detail-value">${acc.devicePairedAt ? formatDate(acc.devicePairedAt) : '—'}</div>
              <div class="detail-label">Aktivitas terakhir</div><div class="detail-value">${acc.deviceLastSeenAt ? formatDate(acc.deviceLastSeenAt) : '—'}</div>
            </div>
          ` : `<p class="am-muted">Belum ada binding perangkat aktif pada server. Login field berikutnya akan melakukan pairing sesuai policy server.</p>`}
        </section>` : ''}

        <section ${pane('sesi')}>
          <div class="card-title">Sesi</div>
          <p class="am-muted">Data operasional menggunakan cloud sebagai authority. Browser menyimpan cache sekitar <strong>${storageKb()} KB</strong> untuk performa dan kompatibilitas.</p>
          ${canAccounts ? `<p class="am-muted">Kelola akun organisasi di <a href="#/accounts">Manajemen Akun</a>.</p>` : ''}
          <div class="am-session-warning">
            <strong>Keluar dari semua perangkat</strong>
            <div class="am-muted">Mencabut seluruh sesi aktif untuk identitas login ini di semua organisasi. Gunakan bila perangkat hilang atau ada sesi yang tidak dikenali.</div>
          </div>
          <div class="am-actions">
            <button class="btn btn-secondary" type="button" data-pqt-onclick="FT.logout()">Keluar dari perangkat ini</button>
            <button class="btn btn-danger" type="button" data-pqt-onclick="AM.logoutAllSessions()">Keluar dari semua perangkat</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

let accountSyncInFlight = false;
let accountSyncedOrg = '';

function scheduleAccountRefresh(acc) {
  const orgId = String(acc?.organizationId || getDB().currentOrganizationId || '');
  if (!getApiToken() || !orgId || accountSyncInFlight || accountSyncedOrg === orgId) return;
  accountSyncInFlight = true;
  queueMicrotask(async () => {
    try {
      await syncCloudAccounts();
      accountSyncedOrg = orgId;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(`Sinkronisasi akun gagal: ${error.message || error}`, 'error');
    } finally {
      accountSyncInFlight = false;
    }
  });
}

export function renderAccounts() {
  const acc = account();
  scheduleAccountRefresh(acc);
  if (!['head','admin','superadmin'].includes(acc?.role)) {
    return '<div class="card"><p>Only Superadmin, Head, and Admin can manage organization accounts.</p></div>';
  }
  const q = (window.FT.state._accountQuery || '').toLowerCase();
  const roleFilter = window.FT.state._accountRole || '';
  const statusFilter = window.FT.state._accountStatus || '';
  const employees = getEmployees();
  let rows = getAccounts().slice().sort((a, b) => String(a.email).localeCompare(b.email));
  if (q) rows = rows.filter(a => `${a.name} ${a.email} ${a.role}`.toLowerCase().includes(q));
  if (roleFilter) rows = rows.filter(a => a.role === roleFilter);
  if (statusFilter) rows = rows.filter(a => a.status === statusFilter);

  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" placeholder="Cari nama atau email" value="${esc(window.FT.state._accountQuery || '')}" data-pqt-oninput="AM.filterAccounts(this.value)">
        <select class="select" style="width:auto" data-pqt-onchange="AM.filterRole(this.value)">
          <option value="">Semua role</option>
          <option value="head" ${roleFilter === 'head' ? 'selected' : ''}>Head</option>
          <option value="admin" ${roleFilter === 'admin' ? 'selected' : ''}>Admin</option>\n          <option value="manager" ${roleFilter === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="supervisor" ${roleFilter === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          <option value="employee" ${roleFilter === 'employee' ? 'selected' : ''}>Field Sales</option>
        </select>
        <select class="select" style="width:auto" data-pqt-onchange="AM.filterStatus(this.value)">
          <option value="">Semua status</option>
          <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="suspended" ${statusFilter === 'suspended' ? 'selected' : ''}>Ditangguhkan</option>
          <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Nonaktif</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="AM.openAccount()">+ Tambah Akun</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Akun</th><th>Role</th><th>Karyawan</th><th>Status</th><th>Perangkat pertama</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(a => {
              const emp = employees.find(e => e.id === a.employeeId);
              const device = a.role === 'employee'
                ? ((a.deviceBound || a.deviceId) ? `<strong>Terpasang</strong><div class="am-muted">${esc(a.deviceLabel || 'Perangkat field')} · login pertama ${a.devicePairedAt ? formatDateShort(a.devicePairedAt) : '—'}</div>` : '<span class="am-muted">Belum pairing</span>')
                : '—';
              const manageable = canManageAccount(acc,a);
              const statusManageable = canChangeAccountStatus(acc,a);
              return `<tr>
                <td><strong>${esc(a.name)}</strong><div class="am-muted">${esc(a.email)}</div></td>
                <td>${esc(roleLabel(a.role))}</td>
                <td>${emp ? esc(emp.name) : '—'}</td>
                <td>${statusBadge(a.status)}</td>
                <td>${device}</td>
                <td>
                  ${manageable ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="AM.openAccount('${a.id}')">Edit</button>` : ''}
                  ${manageable && a.role === 'employee' && (a.deviceBound || a.deviceId) ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="AM.resetDevice('${a.id}')">Reset perangkat</button>` : ''}
                  ${statusManageable ? (a.status === 'active'
                    ? `<button class="btn btn-danger btn-sm" data-pqt-onclick="AM.toggleStatus('${a.id}','suspended')">Tangguhkan</button>`
                    : `<button class="btn btn-secondary btn-sm" data-pqt-onclick="AM.toggleStatus('${a.id}','active')">Aktifkan</button>`) : ''}
                </td>
              </tr>`;
            }).join('') : '<tr><td colspan="6"><div class="empty-state"><h3>Tidak ada akun</h3></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function accountForm(existing) {
  const actor = account();
  const isSelf = !!existing && String(existing.id) === String(actor?.id || '');
  const employees = getEmployees().filter(e => e.status === 'active');
  const used = new Set(getAccounts().filter(a => a.id !== existing?.id && a.employeeId).map(a => a.employeeId));
  const options = employees.filter(e => !used.has(e.id) || e.id === existing?.employeeId);
  const projects = (getDB().projects || []).filter(p => !['completed', 'cancelled'].includes(p.status));
  const roles = isSelf ? [existing.role] : managedRoles(actor?.role);
  const statuses = isSelf ? ['active'] : ['active','suspended','inactive'];
  return `
    <form data-pqt-onsubmit="AM.saveAccount(event,'${existing?.id || ''}')">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(existing?.name || '')}" ${existing ? 'disabled' : 'required'}>${existing ? '<div class="am-muted">Nama profil diubah oleh pemilik akun dari Settings → Profile atau melalui data Karyawan yang tertaut.</div>' : ''}</div>
      <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" value="${esc(existing?.email || '')}" ${existing ? 'disabled' : 'required'}>${existing ? '<div class="am-muted">Email adalah identitas global. Pemilik akun mengubahnya dari Settings → Profile.</div>' : ''}</div>
      <div class="form-row">
        <div class="form-group"><label class="label">Role</label>
          <select class="select" name="role" ${isSelf ? 'disabled' : ''}>
            ${roles.map(r => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="label">Status</label>
          <select class="select" name="status" ${isSelf ? 'disabled' : ''}>
            ${statuses.map(s => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label class="label">Project (required for Manager)</label>
        <select class="select" name="projectId">
          <option value="">—</option>
          ${projects.map(p => `<option value="${p.id}" ${existing?.projectId === p.id ? 'selected' : ''}>${esc(p.code || p.id)} — ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="label">Tautkan karyawan</label>
        <select class="select" name="employeeId">
          <option value="">Tidak ditautkan</option>
          ${options.map(e => `<option value="${e.id}" ${existing?.employeeId === e.id ? 'selected' : ''}>${esc(e.name)} — ${esc(e.role)}</option>`).join('')}
        </select>
      </div>
      ${existing ? '<div class="form-group"><label class="label">Password</label><div class="am-muted">Credential global tidak dapat diubah oleh admin tenant. Pemilik akun mengubah password dari Settings → Security.</div></div>' : `
      <div class="form-group"><label class="label">Password</label>
        <input class="input" type="password" name="password" minlength="8" autocomplete="new-password" required placeholder="Minimal 8 karakter">
        <div class="am-muted">Jika email sudah memiliki akun ProQTrack di organisasi lain, akun existing akan ditautkan dan password lamanya tetap berlaku.</div>
      </div>`}
      ${existing?.role === 'employee' ? `
      <div class="form-group">
        <label class="label">Login perangkat pertama</label>
        ${(existing.deviceBound || existing.deviceId) ? `<div class="am-muted">Status server: terpasang · ${esc(existing.deviceLabel || 'Perangkat field')}<br>Dipasang ${existing.devicePairedAt ? formatDate(existing.devicePairedAt) : '—'}</div>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" data-pqt-onclick="AM.resetDevice('${existing.id}')">Reset perangkat</button>` : '<div class="am-muted">Belum ada pairing. Login pertama sales akan mengunci perangkat.</div>'}
      </div>` : ''}
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `;
}

function formData(event) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.target).entries());
}

let accountSaveInFlight = false;
let profileSaveInFlight = false;
let passwordSaveInFlight = false;
let sessionActionInFlight = false;
const accountActionInFlight = new Set();
const settingsProjectSaveInFlight = new Set();
let settingsPointSaveInFlight = false;

window.AM = {
  setTab(id) {
    window.FT.state._settingsTab = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  async saveProfile(event) {
    event.preventDefault();
    if (profileSaveInFlight) return;
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    profileSaveInFlight = true;
    if (submit) submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const saved = await updateCloudProfile({
        email:data.email,
        name:data.name,
        phone:data.phone || '',
        area:data.area || '',
      });
      const fresh = getAccounts().find(row => String(row.id) === String(saved?.id || account()?.id)) || { ...account(), ...saved };
      window.FT.state.account = fresh;
      window.FT.state.user = { name:fresh.name, role:window.FT.state.user.role, email:fresh.email };
      toast('Profil tersimpan di cloud');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(profileErrorMessage(error), 'error');
    } finally {
      profileSaveInFlight = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  async savePassword(event) {
    event.preventDefault();
    if (passwordSaveInFlight) return;
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    passwordSaveInFlight = true;
    if (submit) submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      if (data.nextPassword !== data.confirmPassword) throw new Error('Konfirmasi password tidak sama.');
      await changeCloudPassword(data.currentPassword, data.nextPassword);
      const next = getAccounts().find(row => String(row.id) === String(account()?.id));
      if (next && window.FT?.state) window.FT.state.account = next;
      toast('Password cloud diperbarui. Sesi lain sudah dicabut.');
      form.reset();
      if (location.hash === '#/settings') window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(passwordErrorMessage(error), 'error');
    } finally {
      passwordSaveInFlight = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  savePrefs(event) {
    event.preventDefault();
    const form = event.target;
    try {
      updateAppSettings({
        compactTables: form.compactTables.checked,
        notifyLeave: form.notifyLeave.checked,
        notifyLowStock: form.notifyLowStock.checked,
      });
      document.body.classList.toggle('am-compact', form.compactTables.checked);
      toast('Preferensi disimpan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  async logoutAllSessions() {
    if (sessionActionInFlight) return;
    if (!confirm('Keluar dari semua perangkat? Semua sesi aktif untuk akun ini akan dicabut dan Anda harus login kembali.')) return;
    sessionActionInFlight = true;
    try {
      await revokeApiSession({ all:true });
      toast('Semua sesi telah dicabut.');
      await window.FT.logout?.();
    } catch (error) {
      toast(error?.message || String(error),'error');
    } finally {
      sessionActionInFlight = false;
    }
  },
  pickAttendanceSettingsProject(id) {
    window.FT.state._attendanceSettingsProjectId = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  async saveAttendanceProjectSettings(event) {
    event.preventDefault();
    const form = event.target;
    const projectId = String(form.projectId.value || '');
    const key = `attendance:${projectId}`;
    if (settingsProjectSaveInFlight.has(key)) return;
    const project = (getDB().projects || []).find(row => String(row.id) === projectId);
    if (!project) {
      toast('Project tidak ditemukan.', 'error');
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    const sourceMode = form.sourceMode.value === 'visit' ? 'visit' : 'manual';
    const lateAfter = String(form.lateAfter.value || '');
    const nextProject = { ...project, attendanceSourceMode:sourceMode, attendanceLateAfter:lateAfter };
    settingsProjectSaveInFlight.add(key);
    if (submit) submit.disabled = true;
    try {
      await commitOperationalChanges([{ entity:'projects', op:'upsert', row:nextProject }]);
      saveProjectAttendanceSettings(projectId,{ sourceMode, lateAfter });
      toast('Pengaturan attendance tersimpan di cloud');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      const messages = {
        PROJECT_ATTENDANCE_SOURCE_IN_USE:'Sumber attendance tidak dapat diubah karena attendance hari ini sudah tercatat.',
        PROJECT_INVALID_ATTENDANCE_SOURCE:'Sumber attendance project tidak valid.',
        PROJECT_INVALID_ATTENDANCE_CUTOFF:'Batas waktu terlambat tidak valid.',
        REVISION_CONFLICT:'Data project berubah di perangkat lain. Muat ulang lalu coba kembali.',
      };
      toast(messages[error?.code || error?.message] || error?.message || String(error), 'error');
    } finally {
      settingsProjectSaveInFlight.delete(key);
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  async addAttendancePoint(event) {
    event.preventDefault();
    if (settingsPointSaveInFlight) return;
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    const fd = Object.fromEntries(new FormData(form).entries());
    const row = {
      id:`APT-${crypto.randomUUID()}`,
      name:String(fd.pointName || '').trim(),
      type:String(fd.pointType || 'point'),
      lat:fd.pointLat === '' ? null : Number(fd.pointLat),
      lng:fd.pointLng === '' ? null : Number(fd.pointLng),
      address:String(fd.pointAddress || '').trim(),
      status:'active',
    };
    settingsPointSaveInFlight = true;
    if (submit) submit.disabled = true;
    try {
      await commitOperationalChanges([{ entity:'attendancePoints', op:'upsert', row }]);
      createAttendancePoint(row);
      toast('Attendance point tersimpan di cloud');
      form.reset();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error?.message || String(error),'error');
    } finally {
      settingsPointSaveInFlight = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  pickStoreProject(id) {
    window.FT.state._storeProjectId = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  async saveStoreCatalog(event) {
    event.preventDefault();
    const form = event.target;
    const projectId = String(form.projectId.value || '');
    const key = `catalog:${projectId}`;
    if (settingsProjectSaveInFlight.has(key)) return;
    const project = (getDB().projects || []).find(row => String(row.id) === projectId);
    if (!project) {
      toast('Project tidak ditemukan.', 'error');
      return;
    }
    const split = name => String(form[name].value || '').split(/\n/).map(value => value.trim()).filter(Boolean);
    const catalog = {
      allowNewOutlet:form.allowNewOutlet.checked,
      notesMode:form.notesMode.value === 'dropdown' ? 'dropdown' : 'freetext',
      notesOptions:split('notesOptions'),
      segments:split('segments'),
      types:split('types'),
      ownerships:split('ownerships'),
    };
    const nextProject = {
      ...project,
      modules:{ ...(project.modules || {}), newOutlet:catalog.allowNewOutlet },
      storeCatalog:catalog,
    };
    const submit = form.querySelector('button[type="submit"]');
    settingsProjectSaveInFlight.add(key);
    if (submit) submit.disabled = true;
    try {
      await commitOperationalChanges([{ entity:'projects', op:'upsert', row:nextProject }]);
      saveProjectStoreSettings(projectId,catalog);
      toast('Outlet catalog tersimpan di cloud');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      const message = (error?.code || error?.message) === 'REVISION_CONFLICT'
        ? 'Data project berubah di perangkat lain. Muat ulang lalu coba kembali.'
        : (error?.message || String(error));
      toast(message,'error');
    } finally {
      settingsProjectSaveInFlight.delete(key);
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  previewThemeColor(input) {
    const color = normalizeThemeColor(input?.value || '#ef5000');
    const current = getOrganization(account()?.organizationId || getCurrentOrgId()) || {};
    applyOrganizationBranding({ ...current, themeColor:color });
    document.querySelectorAll('.am-theme-swatch').forEach(node => {
      node.classList.toggle('active', String(node.title || '').toLowerCase() === color);
    });
  },
  selectThemeColor(color) {
    const input = document.getElementById('orgThemeColor');
    if (!input) return;
    input.value = normalizeThemeColor(color);
    this.previewThemeColor(input);
  },
  previewLogo(input) {
    const file = input.files?.[0];
    const preview = input.closest('.emp-photo-field')?.querySelector('.employee-photo-preview');
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      input.value = '';
      toast('Logo harus JPG, PNG, atau WebP dan maksimum 1 MB.', 'error');
      return;
    }
    if (preview) preview.src = URL.createObjectURL(file);
  },
  async saveOrg(event) {
    event.preventDefault();
    if (organizationSaveInFlight) return;
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    organizationSaveInFlight = true;
    if (submit) submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const file = form.logoFile?.files?.[0];
      let logo = data.logo || '';
      if (file) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 1024 * 1024) {
          throw Object.assign(new Error('ORGANIZATION_LOGO_INVALID'), { code:'ORGANIZATION_LOGO_INVALID' });
        }
        logo = await compressImage(file, { maxPx: 512, quality: 0.82 });
        if (!logo || dataUrlBytes(logo) > 192 * 1024) {
          throw Object.assign(new Error('ORGANIZATION_LOGO_TOO_LARGE'), { code:'ORGANIZATION_LOGO_TOO_LARGE' });
        }
      }
      const updatedOrganization = await updateCurrentOrganizationProfile({
        name:data.name,
        legalName:data.legalName,
        industry:data.industry,
        city:data.city,
        timezone:data.timezone,
        notes:data.notes,
        logo,
        themeColor:normalizeThemeColor(data.themeColor || '#ef5000'),
      });
      applyOrganizationBranding(updatedOrganization);
      organizationProfileSyncedOrg = String(account()?.organizationId || getCurrentOrgId() || '');
      toast('Profil organisasi tersimpan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(organizationErrorMessage(error), 'error');
    } finally {
      organizationSaveInFlight = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  filterAccounts(value) {
    window.FT.state._accountQuery = value;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  filterRole(value) {
    window.FT.state._accountRole = value;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  filterStatus(value) {
    window.FT.state._accountStatus = value;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  openAccount(id = '') {
    const existing = id ? getAccounts().find(a => a.id === id) : null;
    if (existing && !canManageAccount(account(),existing)) {
      toast('Anda tidak memiliki izin untuk mengubah akun ini.', 'error');
      return;
    }
    window.FT.closeModal?.();
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay" data-pqt-onclick="if(event.target===this)FT.closeModal()"><div class="modal animate-up"><div class="modal-handle"></div><div class="modal-header"><h3>${existing ? 'Edit Akun' : 'Tambah Akun'}</h3><button class="modal-close" data-pqt-onclick="FT.closeModal()">✕</button></div><div class="modal-body">${accountForm(existing)}</div></div></div>`;
  },
  async refreshAccounts() {
    if (accountSyncInFlight) return;
    accountSyncInFlight = true;
    try {
      await syncCloudAccounts();
      accountSyncedOrg = String(account()?.organizationId || getDB().currentOrganizationId || '');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    } finally {
      accountSyncInFlight = false;
    }
  },
  async saveAccount(event, id) {
    event.preventDefault();
    if (accountSaveInFlight) return;
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    accountSaveInFlight = true;
    if (submit) submit.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const current = id ? getAccounts().find(a => String(a.id) === String(id)) : null;
      if (current) {
        delete data.email;
        delete data.password;
      }
      if (current && String(current.id) === String(account()?.id || '')) {
        data.role = current.role;
        data.status = 'active';
      }
      if (!data.password) delete data.password;
      if (!id) {
        const duplicate = getAccounts().find(a => String(a.email || '').toLowerCase() === String(data.email || '').trim().toLowerCase());
        if (duplicate) throw Object.assign(new Error('ACCOUNT_ALREADY_IN_ORGANIZATION'), { code:'ACCOUNT_ALREADY_IN_ORGANIZATION' });
      }
      const saved = id ? await updateCloudAccount(id, data) : await createCloudAccount(data);
      window.FT.closeModal?.();
      accountSyncedOrg = '';
      toast(id
        ? 'Akun cloud diperbarui'
        : saved?.attachedExisting
          ? 'Akun existing ditautkan. Password lama tetap berlaku.'
          : 'Akun cloud dibuat');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(accountErrorMessage(error), 'error');
    } finally {
      accountSaveInFlight = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  },
  async resetDevice(id) {
    if (accountActionInFlight.has(`reset:${id}`)) return;
    if (!confirm('Reset perangkat akun ini? Field Sales harus login ulang dari perangkat baru untuk pairing berikutnya.')) return;
    const key = `reset:${id}`;
    accountActionInFlight.add(key);
    try {
      await resetCloudAccountDevice(id);
      window.FT.closeModal?.();
      toast('Binding perangkat server direset. Login berikutnya akan memasangkan perangkat baru.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(accountErrorMessage(error), 'error');
    } finally {
      accountActionInFlight.delete(key);
    }
  },
  async toggleStatus(id, status) {
    const key = `status:${id}`;
    if (accountActionInFlight.has(key)) return;
    const target = getAccounts().find(a => String(a.id) === String(id));
    if (!canChangeAccountStatus(account(),target)) {
      toast('Anda tidak memiliki izin untuk mengubah status akun ini.', 'error');
      return;
    }
    accountActionInFlight.add(key);
    try {
      await updateCloudAccount(id, { status });
      toast(status === 'active' ? 'Akun cloud diaktifkan' : 'Akun cloud ditangguhkan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(accountErrorMessage(error), 'error');
    } finally {
      accountActionInFlight.delete(key);
    }
  },
};

function installStyles() {
  if (document.getElementById('account-settings-css')) return;
  const style = document.createElement('style');
  style.id = 'account-settings-css';
  style.textContent = `
    .am-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .am-settings{display:grid;gap:12px}
    .am-tabs{display:flex;flex-wrap:wrap;gap:6px}
    .am-tab{border:1px solid var(--gray-200);background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--gray-600);cursor:pointer}
    .am-tab.active{background:var(--brand);border-color:var(--brand);color:#fff}
    .am-tab-body{min-height:280px}
    .am-pane{display:none}
    .am-pane.active{display:block}
    .am-profile{display:flex;gap:14px;align-items:center;margin-bottom:16px}
    .am-avatar{width:56px;height:56px;border-radius:16px;background:var(--brand-light);color:var(--brand-dark);display:flex;align-items:center;justify-content:center;font-weight:800}
    .am-muted{font-size:12px;color:var(--gray-400);margin-top:3px}
    .am-form .form-group{margin-bottom:12px}
    .am-check{display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:13px}
    .am-actions{display:flex;gap:8px;margin-top:12px}
    .am-section-divider{margin:20px 0;border:0;border-top:1px solid var(--gray-200)}
    .am-master-list{margin-top:12px}
    .am-session-warning{margin-top:14px;padding:12px;border:1px solid var(--gray-200);border-radius:12px;background:var(--gray-50)}
    body.am-compact .table td,body.am-compact .table th{padding:7px 10px}
    @media(max-width:800px){.am-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function applyPrefs() {
  try {
    document.body.classList.toggle('am-compact', !!getAppSettings().compactTables);
  } catch { /* ignore */ }
}

installStyles();
applyPrefs();
export {};
