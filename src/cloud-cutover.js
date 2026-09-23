import {
  authenticate,
  getCurrentOrgId,
  getDB,
  registerTestDevice,
  pairCloudAuthenticatedSalesDevice,
} from './lib/db.js';
import { getDeviceIdentity, markSuperadminHost } from './lib/device.js';
import { clearApiToken, getApiToken } from './lib/uploads.js';
import { syncCloudOrganizations } from './lib/cloud-organizations.js';
import {
  applyRemoteDataToLocal,
  bootstrapOperationalData,
  ensureCloudIdentity,
  establishCloudSession,
  installStorageWriteThrough,
  logoutCloudSession,
  restoreCloudSession,
} from './lib/cloud-data.js';

installStorageWriteThrough();

const displayRole = account => {
  if (account?.role === 'superadmin') return 'Superadmin';
  if (account?.role === 'head') return 'Head';
  if (account?.role === 'admin') return 'Admin';
  if (account?.role === 'manager') return 'Manager';
  if (account?.role === 'supervisor') return 'Supervisor';
  return 'Field Sales';
};
const defaultRouteFor = account => account?.role === 'superadmin' && !account?.organizationId\n  ? '#/organizations'\n  : (['superadmin','head','admin','manager','supervisor'].includes(account?.role) ? '#/' : '#/myday');
let loginInFlight = false;

function forceRoute(route) {
  const previous = location.hash;
  location.hash = route;
  if (previous === route) window.dispatchEvent(new Event('hashchange'));
}

async function cloudFirstLogin(event) {
  event?.preventDefault?.();
  if (loginInFlight) return;
  loginInFlight = true;

  try {
    clearApiToken();
    if (navigator.onLine === false) {
      window.showToast?.('Login offline hanya tersedia untuk akun yang pernah digunakan di perangkat ini.', 'error');
      return;
    }

    const email = String(document.getElementById('loginEmail')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('loginPassword')?.value || '');
    if (!email || !password) return;

    const db = getDB();
    const device = getDeviceIdentity();
    const localCandidate = (db.accounts || []).find(row => String(row.email || '').toLowerCase() === email) || null;
    let localAccount = null;
    try {
      localAccount = authenticate(email, password, device);
    } catch (error) {
      window.showToast?.(error.message || 'Login ditolak oleh kunci perangkat.', 'error');
      return;
    }

    // A superadmin must authenticate globally first. Reusing a stale tenant id
    // from localStorage can turn valid credentials into a 403 after a tenant
    // was archived or removed.
    const organizationId = localCandidate?.role === 'superadmin'
      ? ''
      : (localCandidate?.organizationId || db.currentOrganizationId || getCurrentOrgId());
    let cloudAccount = null;
    let cloudError = null;
    try {
      cloudAccount = await establishCloudSession({ email, password, organizationId });
    } catch (error) {
      cloudError = error;
    }

    if (!cloudAccount) {
      window.showToast?.(cloudError?.message || 'Login gagal. Periksa email, password, dan koneksi lalu coba lagi.', 'error');
      return;
    }

    if (cloudAccount.role === 'superadmin' && !cloudAccount.organizationId) {
      // Global superadmin login must never inherit or auto-select a tenant from
      // browser state. Organization discovery is best-effort; tenant authority
      // begins only after the user explicitly opens/switches a workspace.
      db.currentOrganizationId = null;
      try {
        await syncCloudOrganizations();
      } catch (error) {
        console.warn('organization_list_refresh_failed', error?.code || error?.message || error);
      }
    }

    let bootstrap;
    try {
      bootstrap = await bootstrapOperationalData(db, cloudAccount);
      if (bootstrap.mode === 'cloud' && bootstrap.data) {
        applyRemoteDataToLocal(db, bootstrap.data);
      }
      localAccount = ensureCloudIdentity(db, cloudAccount, localAccount || localCandidate, password);
      if (localAccount?.role === 'employee') {
        localAccount = pairCloudAuthenticatedSalesDevice(localAccount.id, device);
      }
    } catch (error) {
      await logoutCloudSession().catch(() => {});
      window.showToast?.('Data belum dapat dimuat. Periksa koneksi lalu coba lagi.', 'error');
      return;
    }

    if (bootstrap.mode === 'pending') {
      window.showToast?.('Organisasi belum siap digunakan. Hubungi administrator.', 'error');
    }

    const account = localAccount;
    if (!account) {
      await logoutCloudSession().catch(() => {});
      window.showToast?.('Sesi akun tidak dapat dipulihkan. Silakan login kembali.', 'error');
      return;
    }
    if (account.role === 'superadmin') {
      markSuperadminHost(device);
      try { registerTestDevice(device, account); } catch { /* ignore */ }
    }

    const state = window.FT.state;
    state.loggedIn = true;
    state.account = account;
    state.user = { name: account.name, role: displayRole(account), email: account.email };
    state.route = account.mustChangePassword ? '#/settings' : defaultRouteFor(account);
    forceRoute(state.route);
    if (account.mustChangePassword) window.showToast?.('Wajib ganti password sebelum memakai aplikasi.', 'error');
    else if (account.role === 'superadmin' && !account.organizationId) window.showToast?.('Login berhasil. Pilih organisasi untuk membuka workspace.', 'success');
    else window.showToast?.('Login berhasil. Data operasional siap digunakan.', 'success');
  } finally {
    loginInFlight = false;
  }
}

let restoreInFlight = false;

async function restoreCloudSessionOnReload() {
  if (restoreInFlight || !getApiToken() || window.FT?.state?.loggedIn) return false;
  restoreInFlight = true;
  const state = window.FT.state;
  try {
    const restored = await restoreCloudSession(getDB());
    const account = restored?.account;
    if (!account) return false;

    state.loggedIn = true;
    state.account = account;
    state.user = { name: account.name, role: displayRole(account), email: account.email };

    const current = String(location.hash || '');
    const preserved = current && current !== '#/login' ? current : '';
    state.route = account.mustChangePassword ? '#/settings' : (preserved || defaultRouteFor(account));
    forceRoute(state.route);
    return true;
  } catch (error) {
    if (navigator.onLine !== false) {
      console.warn('cloud_session_restore_failed', error?.code || error?.message || error);
    }
    return false;
  } finally {
    restoreInFlight = false;
  }
}

async function cloudLogout() {
  try { await logoutCloudSession(); } catch (error) { console.warn('cloud_logout_failed', error); }
  const state = window.FT.state;
  state.loggedIn = false;
  state.account = null;
  state.route = '#/login';
  if (state.livePolling) {
    clearInterval(state.livePolling);
    state.livePolling = null;
  }
  forceRoute('#/login');
}

function install() {
  if (!window.FT?.state || !window.FT?.handleLogin) {
    setTimeout(install, 0);
    return;
  }
  if (window.FT.__m3CloudCutoverInstalled) return;
  window.FT.__m3CloudCutoverInstalled = true;
  window.FT.handleLogin = cloudFirstLogin;
  window.FT.logout = cloudLogout;
  queueMicrotask(() => restoreCloudSessionOnReload());

  let lastNotice = '';
  window.addEventListener('proqtrack:cloud-status', event => {
    const status = event.detail?.status;
    if (status === 'conflict' && lastNotice !== 'conflict') {
      lastNotice = 'conflict';
      window.showToast?.('Data berubah di perangkat lain. Versi terbaru dimuat dan perubahan lokal tetap diamankan.', 'error');
    } else if (status === 'error' && lastNotice !== 'error') {
      lastNotice = 'error';
      window.showToast?.('Pembaruan data tertunda. Perubahan tetap aman di perangkat.', 'error');
    } else if (status === 'synced') {
      lastNotice = '';
    }
  });
}

setTimeout(install, 0);
