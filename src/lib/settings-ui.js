import { esc } from './utils.js';

export const TIMEZONES = Object.freeze([
  ['Asia/Jakarta', 'WIB — Jakarta'],
  ['Asia/Makassar', 'WITA — Makassar'],
  ['Asia/Jayapura', 'WIT — Jayapura'],
  ['UTC', 'UTC'],
]);

export const THEME_PRESETS = Object.freeze([
  '#ef5000','#2563eb','#0f766e','#7c3aed','#be123c','#334155',
]);

export function roleLabel(role) {
  return {
    superadmin:'Superadmin',
    head:'Head',
    admin:'Admin',
    manager:'Manager',
    supervisor:'Supervisor',
    employee:'Field Sales',
  }[role] || role || '—';
}

export function statusLabel(status) {
  return {
    active:'Aktif',
    inactive:'Nonaktif',
    suspended:'Ditangguhkan',
  }[status] || status || '—';
}

export function managedRoles(actorRole) {
  if (actorRole === 'superadmin') return ['head','admin','manager','supervisor','employee'];
  if (actorRole === 'head') return ['admin','manager','supervisor','employee'];
  if (actorRole === 'admin') return ['manager','supervisor','employee'];
  return [];
}

export function canManageAccount(actor, target) {
  if (!actor || !target) return false;
  if (String(actor.id) === String(target.id)) {
    return ['superadmin','head','admin'].includes(actor.role);
  }
  return managedRoles(actor.role).includes(target.role);
}

export function canChangeAccountStatus(actor, target) {
  return canManageAccount(actor,target)
    && String(actor?.id || '') !== String(target?.id || '');
}

function withRequestId(message, error) {
  const requestId = error?.payload?.requestId;
  return requestId ? `${message} Ref: ${requestId}` : message;
}

export function profileErrorMessage(error) {
  const messages = {
    EMAIL_ALREADY_USED:'Email sudah digunakan akun lain.',
    EMAIL_INVALID:'Format email tidak valid.',
    PROFILE_NAME_REQUIRED:'Nama tampilan wajib diisi.',
    AUTH_REQUIRED:'Sesi sudah berakhir. Silakan login kembali.',
    SESSION_REVOKED:'Sesi sudah dicabut. Silakan login kembali.',
  };
  return messages[error?.code] || error?.message || String(error || 'Profil gagal disimpan.');
}

export function passwordErrorMessage(error) {
  const messages = {
    INVALID_CURRENT_PASSWORD:'Password saat ini tidak sesuai.',
    PASSWORD_UNCHANGED:'Password baru harus berbeda dari password saat ini.',
    PASSWORD_TOO_SHORT:'Password baru minimal 8 karakter.',
    AUTH_REQUIRED:'Sesi sudah berakhir. Silakan login kembali.',
    SESSION_REVOKED:'Sesi sudah dicabut. Silakan login kembali.',
  };
  return messages[error?.code] || error?.message || String(error || 'Password gagal diperbarui.');
}

export function accountErrorMessage(error) {
  const messages = {
    EMAIL_ALREADY_USED:'Email sudah terdaftar. Segarkan daftar akun lalu gunakan akun yang sudah ada.',
    ACCOUNT_ALREADY_IN_ORGANIZATION:'Email ini sudah menjadi akun di organisasi ini. Gunakan Edit, bukan Tambah Akun.',
    ACCOUNT_IS_GLOBAL_SUPERADMIN:'Akun Superadmin global tidak dapat ditautkan melalui form ini.',
    EXISTING_ACCOUNT_DISABLED:'Akun existing sedang dinonaktifkan secara global.',
    EMPLOYEE_ALREADY_LINKED:'Karyawan tersebut sudah tertaut ke akun lain.',
    EMPLOYEE_NOT_FOUND:'Karyawan yang dipilih tidak ditemukan.',
    PROJECT_REQUIRED:'Project wajib dipilih untuk role Manager.',
    PROJECT_NOT_FOUND:'Project yang dipilih tidak ditemukan atau tidak aktif.',
    ACCOUNT_FORBIDDEN:'Anda tidak memiliki izin untuk mengubah akun ini.',
    ACCOUNT_ROLE_FORBIDDEN:'Anda tidak memiliki izin untuk menetapkan role tersebut.',
    SELF_ROLE_CHANGE_FORBIDDEN:'Role akun Anda sendiri tidak dapat diubah dari halaman ini.',
    SELF_DISABLE_FORBIDDEN:'Akun yang sedang digunakan tidak dapat dinonaktifkan.',
    PASSWORD_TOO_SHORT:'Password minimal 8 karakter.',
    EMAIL_INVALID:'Format email tidak valid.',
    ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN:'Email login adalah identitas global. Ubah email hanya dari Profil pemilik akun.',
    ACCOUNT_GLOBAL_PASSWORD_EDIT_FORBIDDEN:'Password adalah credential global. Pemilik akun harus mengubahnya dari tab Keamanan.',
  };
  const message = messages[error?.code] || error?.message || String(error || 'Aksi akun gagal.');
  return withRequestId(message,error);
}

export function organizationErrorMessage(error) {
  const messages = {
    ORGANIZATION_PROFILE_FORBIDDEN:'Anda tidak memiliki izin untuk mengubah profil organisasi.',
    ORGANIZATION_NOT_FOUND:'Organisasi aktif tidak ditemukan.',
    ORGANIZATION_NAME_REQUIRED:'Nama organisasi wajib diisi.',
    ORGANIZATION_TIMEZONE_INVALID:'Zona waktu organisasi tidak valid.',
    ORGANIZATION_LOGO_INVALID:'Format logo tidak didukung. Gunakan JPG, PNG, atau WebP.',
    ORGANIZATION_LOGO_TOO_LARGE:'Logo terlalu besar setelah kompresi.',
    ORGANIZATION_THEME_INVALID:'Warna tema organisasi tidak valid.',
  };
  const message = messages[error?.code] || error?.message || String(error || 'Profil organisasi gagal diperbarui.');
  return withRequestId(message,error);
}

export function dataUrlBytes(value) {
  const match = String(value || '').match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/i);
  if (!match) return 0;
  return Math.floor(match[1].replace(/=+$/,'').length * 3 / 4);
}

export function setSubmitBusy(form, busy, busyLabel = 'Menyimpan…') {
  const submit = form?.querySelector?.('button[type="submit"]');
  if (!submit) return null;
  if (busy) {
    if (!submit.dataset.idleLabel) submit.dataset.idleLabel = submit.textContent || 'Simpan';
    submit.disabled = true;
    submit.setAttribute('aria-busy','true');
    submit.textContent = busyLabel;
  } else {
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    if (submit.dataset.idleLabel) {
      submit.textContent = submit.dataset.idleLabel;
      delete submit.dataset.idleLabel;
    }
  }
  return submit;
}

export function settingsConfirmMarkup({
  title,
  message,
  confirmLabel = 'Lanjutkan',
  tone = 'danger',
} = {}) {
  return `
    <div class="modal-overlay" role="presentation" data-pqt-onclick="if(event.target===this)FT.closeModal()">
      <div class="modal animate-up am-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="settingsConfirmTitle">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h3 id="settingsConfirmTitle">${esc(title || 'Konfirmasi')}</h3>
          <button type="button" class="modal-close" aria-label="Tutup" data-pqt-onclick="FT.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p class="am-confirm-copy">${esc(message || '')}</p>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
            <button type="button" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-pqt-onclick="AM.runPendingConfirm()">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>
    </div>`;
}

export function filterAccountRows(rows = [], {
  query = '',
  role = '',
  status = '',
} = {}) {
  const q = String(query || '').trim().toLowerCase();
  return rows.filter(account => {
    if (q && !`${account?.name || ''} ${account?.email || ''} ${account?.role || ''}`.toLowerCase().includes(q)) return false;
    if (role && account?.role !== role) return false;
    if (status && account?.status !== status) return false;
    return true;
  });
}

export function settingsTabsFor(account = {}) {
  const isOrgAdmin = ['head','admin','superadmin'].includes(account?.role);
  return [
    ['profil','Profil'],
    ['keamanan','Keamanan'],
    ['tampilan','Tampilan'],
    ...(isOrgAdmin ? [['organisasi','Organisasi'],['katalog','Katalog Outlet'],['absensi','Attendance']] : []),
    ...(account?.role === 'manager' ? [['katalog','Katalog Outlet']] : []),
    ...(account?.role === 'employee' ? [['perangkat','Perangkat']] : []),
    ['sesi','Sesi'],
  ];
}
