import { authenticate, getCurrentOrgId, getDB } from './db.js';
import { getDeviceIdentity } from './device.js';
import { clearApiToken } from './uploads.js';
import { isCloudCutoverRemembered } from './cloud-data.js';

let installed = false;

const displayRole = account => {
  if (account?.role === 'superadmin') return 'Superadmin';
  if (account?.role === 'head') return 'Head';
  if (account?.role === 'admin') return 'Admin';
  if (account?.role === 'manager') return 'Manager';
  if (account?.role === 'supervisor') return 'Supervisor';
  return 'Field Sales';
};

const defaultRouteFor = account => ['superadmin','head','admin','manager','supervisor'].includes(account?.role) ? '#/' : '#/myday';

function activateOfflineSession(account) {
  clearApiToken();
  const state = window.FT.state;
  state.loggedIn = true;
  state.account = { ...account, offlineSession: true };
  state.user = { name: account.name, role: displayRole(account), email: account.email };
  state.route = account.mustChangePassword ? '#/settings' : defaultRouteFor(account);
  location.hash = state.route;
  window.dispatchEvent(new CustomEvent('proqtrack:offline-status', {
    detail: { status: 'offline-session', organizationId: account.organizationId || null, online: false },
  }));
  window.showToast?.('Offline session aktif. Data akan disinkronkan setelah login server tersedia.', 'success');
}

async function offlineLogin(event, original) {
  if (navigator.onLine !== false) return original.call(window.FT, event);
  event?.preventDefault?.();
  clearApiToken();

  const email = String(document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
  const password = String(document.getElementById('loginPassword')?.value || '');
  if (!email || !password) return;

  const db = getDB();
  const candidate = (db.accounts || []).find(row => String(row.email || '').toLowerCase() === email) || null;
  const organizationId = candidate?.organizationId || db.currentOrganizationId || getCurrentOrgId();
  if (!candidate?.cloudIdentity || !isCloudCutoverRemembered(organizationId)) {
    window.showToast?.('Offline login belum diizinkan. Akun harus pernah tervalidasi oleh D1 pada device ini.', 'error');
    return;
  }

  let account = null;
  try {
    account = authenticate(email, password, getDeviceIdentity());
  } catch (error) {
    window.showToast?.(error.message || 'Perangkat tidak diizinkan untuk offline login.', 'error');
    return;
  }
  if (!account || account.id !== candidate.id || (account.status && account.status !== 'active')) {
    window.showToast?.('Offline login ditolak. Gunakan kredensial terakhir yang tervalidasi pada device ini.', 'error');
    return;
  }
  activateOfflineSession(account);
}

export function installOfflineLogin() {
  if (installed || typeof window === 'undefined') return false;
  const attach = () => {
    if (!window.FT?.handleLogin || !window.FT?.state) {
      setTimeout(attach, 0);
      return;
    }
    if (window.FT.__m4OfflineLoginInstalled) return;
    const original = window.FT.handleLogin;
    window.FT.handleLogin = event => offlineLogin(event, original);
    window.FT.__m4OfflineLoginInstalled = true;
    window.addEventListener('online', () => {
      if (window.FT?.state?.account?.offlineSession) {
        window.showToast?.('Koneksi kembali. Login ulang untuk mengirim antrean offline ke server.', 'success');
      }
    });
  };
  installed = true;
  setTimeout(attach, 0);
  return true;
}

installOfflineLogin();
