import {
  authenticate,
  getDB,
  registerTestDevice,
  pairCloudAuthenticatedSalesDevice,
} from './lib/db.js';
import { getDeviceIdentity, markSuperadminHost } from './lib/device.js';
import { clearApiToken, getApiToken } from './lib/uploads.js';
import { syncCloudOrganizations, syncCurrentOrganizationProfile } from './lib/cloud-organizations.js';
import {
  applyRemoteDataToLocal,
  bootstrapOperationalData,
  ensureCloudIdentity,
  establishCloudSession,
  installStorageWriteThrough,
  logoutCloudSession,
  resetCloudDataBridge,
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
const defaultRouteFor = account => account?.role === 'superadmin' && !account?.organizationId
  ? '#/organizations'
  : (['superadmin','head','admin','manager','supervisor'].includes(account?.role) ? '#/' : '#/myday');
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
    if (window.FT?.state) window.FT.state.sessionRestoring = false;
    // Abort queued/in-flight writes from any previous session before rotating
    // the bearer token. This prevents unauthenticated /api/core/sync races.
    resetCloudDataBridge();
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
      // Online authentication is cloud-authoritative. A stale local password,
      // device binding, or tenant cache must never block a valid server login.
      localAccount = null;
      console.warn('local_login_hint_ignored', error?.message || error);
    }

    // A superadmin must authenticate globally first. Reusing a stale tenant id
    // from localStorage can turn valid credentials into a 403 after a tenant
    // was archived or removed.
    // Never borrow a browser-wide/current workspace as an auth hint for a
    // different email. After site-data resets the seeded/default organization
    // can be unrelated to the account being entered and cause a noisy 403.
    // Only reuse an organization that belongs to the matching local identity.
    const organizationId = localCandidate?.role === 'superadmin'
      ? ''
      : (localCandidate?.organizationId || '');
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
      if (cloudAccount.organizationId) {
        await syncCurrentOrganizationProfile().catch(error => {
          console.warn('organization_profile_refresh_failed', error?.code || error?.message || error);
        });
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
  const restoreToken = getApiToken();
  if (restoreInFlight || !restoreToken || window.FT?.state?.loggedIn) return false;
  restoreInFlight = true;
  const state = window.FT.state;
  state.sessionRestoring = true;
  window.FT.scheduleRender?.();
  try {
    const restored = await restoreCloudSession(getDB());
    const account = restored?.account;
    if (!account) return false;

    state.loggedIn = true;
    state.sessionRestoring = false;
    state.account = account;
    state.user = { name: account.name, role: displayRole(account), email: account.email };

    const current = String(location.hash || '');
    const preserved = current && current !== '#/login' ? current : '';
    const globalSuperadmin = account.role === 'superadmin' && !account.organizationId;
    state.route = account.mustChangePassword
      ? '#/settings'
      : (globalSuperadmin ? '#/organizations' : (preserved || defaultRouteFor(account)));
    forceRoute(state.route);

    // Branding/profile refresh is not required to paint the authenticated shell.
    // Keep it off the root LCP path and reconcile immediately after first render.
    if (account.organizationId && getApiToken() === restoreToken) {
      queueMicrotask(() => syncCurrentOrganizationProfile(restoreToken).catch(error => {
        if (![401,403].includes(Number(error?.status || 0))) {
          console.warn('organization_profile_refresh_failed', error?.code || error?.message || error);
        }
      }));
    }
    return true;
  } catch (error) {
    state.sessionRestoring = false;
    window.FT.scheduleRender?.();
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
  state.sessionRestoring = false;
  state.account = null;
  state.route = '#/login';
  if (state.livePolling) {
    clearInterval(state.livePolling);
    state.livePolling = null;
  }
  forceRoute('#/login');
}

export function installCloudCutover() {
  if (!window.FT?.state || !window.FT?.handleLogin) {
    setTimeout(installCloudCutover, 0);
    return false;
  }
  if (window.FT.__m3CloudCutoverInstalled) return true;
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

  window.addEventListener('proqtrack:session-invalid', event => {
    const state = window.FT?.state;
    if (!state?.loggedIn) return;
    state.loggedIn = false;
    state.sessionRestoring = false;
    state.account = null;
    state.route = '#/login';
    if (state.livePolling) {
      clearInterval(state.livePolling);
      state.livePolling = null;
    }
    forceRoute('#/login');
    const code = String(event.detail?.code || 'AUTH_REQUIRED');
    window.showToast?.(
      code === 'SESSION_EXPIRED' || code === 'TOKEN_EXPIRED'
        ? 'Sesi telah berakhir. Silakan login kembali.'
        : 'Sesi tidak lagi valid. Silakan login kembali.',
      'error',
    );
  });
  return true;
}

setTimeout(installCloudCutover, 0);
