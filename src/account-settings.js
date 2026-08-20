import {
  getAccounts, getEmployees, getAppSettings, updateAppSettings,
  createAccount, updateAccount, changePassword, updateOwnProfile, resetSalesDevice,
  getDB, getProjectStoreSettings, saveProjectStoreSettings, defaultStoreCatalog,
  getAttendancePolicy, getAttendancePoints, createAttendancePoint,
  isTestDevice,
} from './lib/db.js';
import { getDeviceIdentity, isSuperadminHostDevice } from './lib/device.js';

import { esc, formatDate, formatDateShort, getInitials, statusBadge, safePhotoUrl, compressImage } from './lib/utils.js';

function account() {
  return window.FT?.state?.account || null;
}

function toast(msg, type = 'success') {
  window.showToast?.(msg, type);
}

function roleLabel(role) {
  return { superadmin: 'Superadmin', head: 'Head', manager: 'Manager', supervisor: 'Supervisor', employee: 'Field Sales' }[role] || role || '—';
}

function statusLabel(status) {
  return { active: 'Aktif', inactive: 'Nonaktif', suspended: 'Ditangguhkan' }[status] || status || '—';
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
        <form class="am-form" onsubmit="AM.saveStoreCatalog(event)">
          <div class="form-group">
            <label class="label">Project</label>
            <select class="select" name="projectId" onchange="AM.pickStoreProject(this.value)">
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
        <form class="am-form" onsubmit="AM.saveAttendancePolicy(event)">
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
        <div class="card-title">Named points</div>
        <div class="card-subtitle">Create points here, then pick one on Employee data when policy is Specific point.</div>
        <form class="am-form" onsubmit="AM.addAttendancePoint(event)">
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
  const isOrgAdmin = acc.role === 'head' || acc.role === 'superadmin';
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
      <nav class="am-tabs" aria-label="Settings">
        ${tabs.map(([id, label]) => `<button type="button" class="am-tab ${tab === id ? 'active' : ''}" onclick="AM.setTab('${id}')">${esc(label)}</button>`).join('')}
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
          <form class="am-form" onsubmit="AM.saveProfile(event)">
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
          <form class="am-form" onsubmit="AM.savePassword(event)">
            <div class="form-group"><label class="label">Password saat ini</label><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></div>
            <div class="form-group"><label class="label">Password baru</label><input class="input" type="password" name="nextPassword" minlength="8" autocomplete="new-password" required></div>
            <div class="form-group"><label class="label">Ulangi password baru</label><input class="input" type="password" name="confirmPassword" minlength="8" autocomplete="new-password" required></div>
            <button class="btn btn-primary" type="submit">Perbarui password</button>
          </form>
        </section>

        <section ${pane('tampilan')}>
          <div class="card-title">Preferensi tampilan</div>
          <form class="am-form" onsubmit="AM.savePrefs(event)">
            <label class="am-check"><input type="checkbox" name="compactTables" ${settings.compactTables ? 'checked' : ''}> Tabel lebih rapat</label>
            <label class="am-check"><input type="checkbox" name="notifyLeave" ${settings.notifyLeave !== false ? 'checked' : ''}> Tampilkan badge ijin/cuti pending</label>
            <label class="am-check"><input type="checkbox" name="notifyLowStock" ${settings.notifyLowStock !== false ? 'checked' : ''}> Tampilkan badge stok menipis</label>
            <div class="form-group">
              <label class="label">Zona waktu</label>
              <select class="select" name="timezone">
                ${TIMEZONES.map(([id, label]) => `<option value="${id}" ${settings.timezone === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-secondary" type="submit">Simpan preferensi</button>
          </form>
        </section>

        ${isOrgAdmin ? `
        <section ${pane('organisasi')}>
          <div class="card-title">Organisasi</div>
          <div class="card-subtitle">Identitas perusahaan di header dan dokumen</div>
          <form class="am-form" onsubmit="AM.saveOrg(event)">
            <div class="form-group"><label class="label">Nama organisasi</label><input class="input" name="companyName" value="${esc(settings.companyName || '')}" required></div>
            <div class="form-group emp-photo-field">
              <label class="label">Logo organisasi</label>
              <div class="employee-photo-editor">
                <img class="employee-photo-preview" alt="Logo" src="${esc(settings.companyLogo || './assets/logo-light.svg')}">
                <div>
                  <input class="input" type="file" name="logoFile" accept="image/jpeg,image/png,image/webp,image/svg+xml" onchange="AM.previewLogo(this)">
                  <input type="hidden" name="companyLogo" value="${esc(settings.companyLogo || '')}">
                  <div class="am-muted">Disimpan di database aplikasi, dipakai di sidebar dan dokumen.</div>
                </div>
              </div>
            </div>
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
            <button class="btn btn-secondary" type="button" onclick="FT.logout()">Sign out</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

export function renderAccounts() {
  const acc = account();
  if (acc?.role !== 'head' && acc?.role !== 'superadmin') {
    return '<div class="card"><p>Only Superadmin and Head can manage organization accounts.</p></div>';
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
        <input class="input search-input" placeholder="Cari nama atau email" value="${esc(window.FT.state._accountQuery || '')}" oninput="AM.filterAccounts(this.value)">
        <select class="select" style="width:auto" onchange="AM.filterRole(this.value)">
          <option value="">Semua role</option>
          <option value="head" ${roleFilter === 'head' ? 'selected' : ''}>Head</option>
          <option value="manager" ${roleFilter === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="supervisor" ${roleFilter === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          <option value="employee" ${roleFilter === 'employee' ? 'selected' : ''}>Field Sales</option>
        </select>
        <select class="select" style="width:auto" onchange="AM.filterStatus(this.value)">
          <option value="">Semua status</option>
          <option value="active" ${statusFilter === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="suspended" ${statusFilter === 'suspended' ? 'selected' : ''}>Ditangguhkan</option>
          <option value="inactive" ${statusFilter === 'inactive' ? 'selected' : ''}>Nonaktif</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="AM.openAccount()">+ Tambah Akun</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Akun</th><th>Role</th><th>Karyawan</th><th>Status</th><th>Perangkat pertama</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(a => {
              const emp = employees.find(e => e.id === a.employeeId);
              const device = a.role === 'employee'
                ? (a.deviceId ? `${esc(a.deviceId || 'Device')}<div class="am-muted">${esc(a.deviceLabel || 'Browser')} · login pertama ${a.devicePairedAt ? formatDateShort(a.devicePairedAt) : '—'}</div>` : '<span class="am-muted">Belum pairing</span>')
                : '—';
              return `<tr>
                <td><strong>${esc(a.name)}</strong><div class="am-muted">${esc(a.email)}</div></td>
                <td>${esc(roleLabel(a.role))}</td>
                <td>${emp ? esc(emp.name) : '—'}</td>
                <td>${statusBadge(a.status)}</td>
                <td>${device}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="AM.openAccount('${a.id}')">Edit</button>
                  ${a.role === 'employee' && a.deviceId ? `<button class="btn btn-secondary btn-sm" onclick="AM.resetDevice('${a.id}')">Reset perangkat</button>` : ''}
                  ${a.status === 'active'
                    ? `<button class="btn btn-danger btn-sm" onclick="AM.toggleStatus('${a.id}','suspended')">Tangguhkan</button>`
                    : `<button class="btn btn-secondary btn-sm" onclick="AM.toggleStatus('${a.id}','active')">Aktifkan</button>`}
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
  const employees = getEmployees().filter(e => e.status === 'active');
  const used = new Set(getAccounts().filter(a => a.id !== existing?.id && a.employeeId).map(a => a.employeeId));
  const options = employees.filter(e => !used.has(e.id) || e.id === existing?.employeeId);
  const projects = (getDB().projects || []).filter(p => !['completed', 'cancelled'].includes(p.status));
  return `
    <form onsubmit="AM.saveAccount(event,'${existing?.id || ''}')">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(existing?.name || '')}" required></div>
      <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" value="${esc(existing?.email || '')}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Role</label>
          <select class="select" name="role">
            ${(account()?.role === 'superadmin' ? ['superadmin', 'head', 'manager', 'supervisor', 'employee'] : ['manager', 'supervisor', 'employee']).map(r => `<option value="${r}" ${existing?.role === r ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="label">Status</label>
          <select class="select" name="status">
            ${['active', 'suspended', 'inactive'].map(s => `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${esc(statusLabel(s))}</option>`).join('')}
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
      </div>
      ${existing?.role === 'employee' ? `
      <div class="form-group">
        <label class="label">Login perangkat pertama</label>
        ${existing.deviceId ? `<div class="am-muted">Device ${esc(existing.deviceId || '—')} · ${esc(existing.deviceLabel || '—')}<br>Dipasang ${existing.devicePairedAt ? formatDate(existing.devicePairedAt) : '—'}<br>${esc((existing.deviceUserAgent || '').slice(0, 120))}</div>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="AM.resetDevice('${existing.id}')">Reset perangkat</button>` : '<div class="am-muted">Belum ada pairing. Login pertama sales akan mengunci perangkat.</div>'}
      </div>` : ''}
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `;
}

function formData(event) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.target).entries());
}

window.AM = {
  setTab(id) {
    window.FT.state._settingsTab = id;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  saveProfile(event) {
    try {
      const data = formData(event);
      const next = updateOwnProfile(account().id, data);
      const fresh = getAccounts().find(a => a.id === next.id) || next;
      window.FT.state.account = fresh;
      window.FT.state.user = { name: fresh.name, role: window.FT.state.user.role, email: fresh.email };
      toast('Profil disimpan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  savePassword(event) {
    try {
      const data = formData(event);
      if (data.nextPassword !== data.confirmPassword) throw new Error('Konfirmasi password tidak sama.');
      changePassword(account().id, data.currentPassword, data.nextPassword);
      const next = getAccounts().find(a => a.id === account().id);
      if (next && window.FT?.state) {
        window.FT.state.account = next;
      }
      toast('Password diperbarui');
      event.target.reset();
      if (location.hash === '#/settings') {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
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
        timezone: form.timezone.value || 'Asia/Jakarta',
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
  previewLogo(input) {
    const file = input.files?.[0];
    const preview = input.closest('.emp-photo-field')?.querySelector('.employee-photo-preview');
    if (file && preview) preview.src = URL.createObjectURL(file);
  },
  async saveOrg(event) {
    event.preventDefault();
    try {
      const form = event.target;
      const data = Object.fromEntries(new FormData(form).entries());
      const file = form.logoFile?.files?.[0];
      let companyLogo = data.companyLogo || '';
      if (file) {
        companyLogo = file.type === 'image/svg+xml'
          ? await file.text().then(t => `data:image/svg+xml;utf8,${encodeURIComponent(t)}`)
          : await compressImage(file, { maxPx: 512, quality: 0.88 });
      }
      updateAppSettings({ companyName: data.companyName, companyLogo });
      toast('Identitas organisasi disimpan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
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
    window.FT.closeModal?.();
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()"><div class="modal animate-up"><div class="modal-handle"></div><div class="modal-header"><h3>${existing ? 'Edit Akun' : 'Tambah Akun'}</h3><button class="modal-close" onclick="FT.closeModal()">✕</button></div><div class="modal-body">${accountForm(existing)}</div></div></div>`;
  },
  saveAccount(event, id) {
    try {
      const data = formData(event);
      if (!data.password) delete data.password;
      if (id) updateAccount(id, data);
      else createAccount(data);
      window.FT.closeModal?.();
      toast(id ? 'Akun diperbarui' : 'Akun dibuat');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  resetDevice(id) {
    if (!confirm('Reset perangkat akun ini? Sales harus login ulang dari perangkat baru untuk pairing berikutnya.')) return;
    try {
      resetSalesDevice(id);
      window.FT.closeModal?.();
      toast('Perangkat direset. Sales dapat pairing perangkat baru saat login.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
    }
  },
  toggleStatus(id, status) {
    try {
      updateAccount(id, { status });
      toast(status === 'active' ? 'Akun diaktifkan' : 'Akun ditangguhkan');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      toast(error.message || error, 'error');
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
