import {
  getAccounts, getEmployees, getAppSettings, updateAppSettings,
  updateOwnProfile,
  getDB, getOrganization, getCurrentOrgId,
  getProjectStoreSettings, saveProjectStoreSettings, defaultStoreCatalog,
  getAttendancePolicy, getAttendancePoints, createAttendancePoint,
  isTestDevice,
} from './lib/db.js';
import { getDeviceIdentity, isSuperadminHostDevice } from './lib/device.js';
import { getApiToken } from './lib/uploads.js';
import {
  syncCloudAccounts, createCloudAccount, updateCloudAccount,
  resetCloudAccountDevice, changeCloudPassword, updateCloudProfile,
} from './lib/cloud-accounts.js';
import {
  syncCurrentOrganizationProfile, updateCurrentOrganizationProfile,
} from './lib/cloud-organizations.js';
import { applyOrganizationBranding, normalizeThemeColor } from './lib/organization-branding.js';

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

function renderAttendanceSettings() {
  const policy = getAttendancePolicy();
  const points = getAttendancePoints();
  return `
        <div class="card-title">Attendance policy</div>
        <div class="card-subtitle">Set where people must check in. Assign a specific point on each employee record when mode is Specific point.</div>
        <form class="am-form" data-pqt-onsubmit="AM.saveAttendancePolicy(event)">
          <div class="form-group">
            <label class="label">Required check-in location</label>
            <select class="select" name="attendanceMode">
              <option value="office" ${policy.mode === 'office' ? 'selected' : ''}>Office</option>
              <option value="outlet" ${policy.mode === 'outlet' ? 'selected' : ''}>Outlet</option>
              <option value="point" ${policy.mode === 'point' ? 'selected' : ''}>Specific point</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Geofence radius (meters)</label><input class="input" type="number" name="attendanceRadiusM" min="20" value="${esc(policy.radiusM)}"></div>
            <div class="form-group"><label class="label">Office name</label><input class="input" name="officeName" value="${esc(policy.officeName || '')}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Office latitude</label><input class="input" name="officeLat" value="${policy.officeLat ?? ''}" placeholder="-6.1944"></div>
            <div class="form-group"><label class="label">Office longitude</label><input class="input" name="officeLng" value="${policy.officeLng ?? ''}" placeholder="106.8229"></div>
          </div>
          <button class="btn btn-primary" type="submit">Save attendance policy</button>
        </form>
        <hr style="margin:20px 0;border:0;border-top:1px solid var(--gray-200)">
        <div class="filter-row">
          <div>
            <div class="card-title">Named points</div>
            <div class="card-subtitle">Create points here, then pick one on Employee data when policy is Specific point.</div>
          </div>
          <div class="spacer"></div>
          <button class="btn btn-secondary" type="button" data-pqt-onclick="BulkMaster.open('attendancePoints')">Bulk Upload</button>
        </div>
        <form class="am-form" data-pqt-onsubmit="AM.addAttendancePoint(event)">
          <div class="form-row">
            <div class="form-group"><label class="label">Name</label><input class="input" name="pointName" required></div>
            <div class="form-group"><label class="label">Type</label>
              <select class="select" name="pointType"><option value="point">Point</option><option value="office">Office</option><option value="store">Outlet</option><option value="meeting">Meeting</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Latitude</label><input class="input" name="pointLat"></div>
            <div class="form-group"><label class="label">Longitude</label><input class="input" name="pointLng"></div>
          </div>
          <div class="form-group"><label class="label">Address</label><input class="input" name="pointAddress"></div>
          <button class="btn btn-secondary" type="submit">Add point</button>
        </form>
        <ul style="margin-top:12px">${points.map(p => `<li><strong>${esc(p.name)}</strong> · ${esc(p.type)}${p.lat != null ? ` · ${p.lat}, ${p.lng}` : ''}</li>`).join('') || '<li class="am-muted">No named points yet.</li>'}</ul>`;
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
            <div class="form-group"><label class="label">Nama tampilan</label><input class="input" name="name" value="${esc(acc.name)}" required></div>
            <div class="form-group"><label class="label">Email login</label><input class="input" type="email" name="email" value="${esc(acc.email)}" required></div>
            ${emp ? `
              <div class="form-row">
                <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" value="${esc(emp.phone || '')}"></div>
                <div class="form-group"><label class="label">Area</label><input class="input" name="area" value="${esc(emp.area || '')}"></div>
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
          <div class="card-subtitle">Login pertama mengunci akun ke perangkat ini. Ganti HP hanya setelah manager mereset perangkat.</div>
          ${acc.deviceId ? `
            <div class="detail-grid">
              <div class="detail-label">Device ID</div><div class="detail-value">${esc(acc.deviceId)}</div>
              <div class="detail-label">Fingerprint</div><div class="detail-value">${esc(acc.deviceImei || '—')}</div>
              <div class="detail-label">Perangkat</div><div class="detail-value">${esc(acc.deviceLabel || '—')}</div>
              <div class="detail-label">Dipasang</div><div class="detail-value">${acc.devicePairedAt ? formatDate(acc.devicePairedAt) : '—'}</div>
            </div>
          ` : `<p class="am-muted">Belum terpasang. Login berikutnya dari perangkat ini akan menjadi perangkat resmi.</p>`}
        </section>` : ''}

        <section ${pane('sesi')}>
          <div class="card-title">Sesi & data lokal</div>
          <p class="am-muted">Snapshot browser sekitar <strong>${storageKb()} KB</strong>. Data belum tersinkron ke server.</p>
          ${acc.role === 'superadmin' ? (() => {
            const dev = getDeviceIdentity();
            const host = isSuperadminHostDevice(dev.id) || isTestDevice(dev.id);
            return `<div class="card" style="margin:14px 0;padding:14px;border:1px solid ${host ? '#86efac' : 'var(--gray-200)'};background:${host ? '#f0fdf4' : 'var(--gray-50)'}">
              <div class="card-title">Superadmin test device</div>
              <div class="card-subtitle">This Mac can sign in as any paired sales account without changing their device lock.</div>
              <div class="detail-grid" style="margin-top:8px">
                <div class="detail-label">Device ID</div><div class="detail-value">${esc(dev.id)}</div>
                <div class="detail-label">Status</div><div class="detail-value">${host ? 'Registered host — bypass on' : 'Not registered'}</div>
              </div>
            </div>`;
          })() : ''}
          ${canAccounts ? `<p class="am-muted">Kelola semua login di <a href="#/accounts">Manajemen Akun</a>.</p>` : ''}
          <div class="am-actions">
            <button class="btn btn-secondary" type="button" data-pqt-onclick="FT.logout()">Keluar</button>
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
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(existing?.name || '')}" required></div>
      <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" value="${esc(existing?.email || '')}" required></div>
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
      <div class="form-group"><label class="label">${existing ? 'Password baru (opsional)' : 'Password'}</label>
        <input class="input" type="password" name="password" minlength="8" autocomplete="new-password" ${existing ? '' : 'required'} placeholder="${existing ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}">
        ${existing ? '' : '<div class="am-muted">Jika email sudah memiliki akun ProQTrack di organisasi lain, akun existing akan ditautkan dan password lamanya tetap berlaku.</div>'}
      </div>
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
const accountActionInFlight = new Set();

window.AM = {
  setTab(id) {
    window.FT.state._settingsTab = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  async saveProfile(event) {
    try {
      const data = formData(event);
      await updateCloudProfile({ email: data.email, name: data.name });
      const next = updateOwnProfile(account().id, data);
      const fresh = getAccounts().find(a => a.id === next.id) || next;
      window.FT.state.account = fresh;
      window.FT.state.user = { name: fresh.name, role: window.FT.state.user.role, email: fresh.email };
      toast('Profil tersimpan di cloud');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  async savePassword(event) {
    try {
      const data = formData(event);
      if (data.nextPassword !== data.confirmPassword) throw new Error('Konfirmasi password tidak sama.');
      await changeCloudPassword(data.currentPassword, data.nextPassword);
      const next = getAccounts().find(a => a.id === account().id);
      if (next && window.FT?.state) window.FT.state.account = next;
      toast('Password cloud diperbarui');
      event.target.reset();
      if (location.hash === '#/settings') window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
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
  saveAttendancePolicy(event) {
    event.preventDefault();
    try {
      const form = event.target;
      updateAppSettings({
        attendanceMode: form.attendanceMode.value,
        attendanceRadiusM: Number(form.attendanceRadiusM.value) || 150,
        officeName: form.officeName.value,
        officeLat: form.officeLat.value === '' ? null : Number(form.officeLat.value),
        officeLng: form.officeLng.value === '' ? null : Number(form.officeLng.value),
      });
      toast('Attendance policy saved');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  addAttendancePoint(event) {
    event.preventDefault();
    try {
      const fd = Object.fromEntries(new FormData(event.target));
      createAttendancePoint({
        name: fd.pointName || fd.name,
        type: fd.pointType || fd.type,
        lat: fd.pointLat || fd.lat,
        lng: fd.pointLng || fd.lng,
        address: fd.pointAddress || fd.address,
      });
      toast('Attendance point added');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  pickStoreProject(id) {
    window.FT.state._storeProjectId = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  saveStoreCatalog(event) {
    event.preventDefault();
    try {
      const form = event.target;
      const split = name => String(form[name].value || '').split(/\n/).map(s => s.trim()).filter(Boolean);
      saveProjectStoreSettings(form.projectId.value, {
        allowNewOutlet: form.allowNewOutlet.checked,
        notesMode: form.notesMode.value,
        notesOptions: split('notesOptions'),
        segments: split('segments'),
        types: split('types'),
        ownerships: split('ownerships'),
      });
      toast('Outlet catalog saved');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
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
