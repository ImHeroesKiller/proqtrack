import './lib/offline-engine.js';
import { installOfflineLogin } from './lib/offline-login.js';

let evidenceRuntimePromise = null;
let evidenceRuntimeScheduled = false;

export function ensureEvidenceRuntime() {
  if (evidenceRuntimePromise) return evidenceRuntimePromise;
  evidenceRuntimePromise = Promise.all([
    import('./lib/evidence-client.js'),
    import('./lib/field-photo-evidence.js'),
  ]).then(([evidence, fieldPhoto]) => {
    evidence.installEvidenceClient?.();
    fieldPhoto.installFieldPhotoEvidenceBridge?.();
    return true;
  }).catch(error => {
    evidenceRuntimePromise = null;
    console.warn('m4_evidence_runtime_failed', error?.message || error);
    throw error;
  });
  return evidenceRuntimePromise;
}

function scheduleEvidenceRuntime() {
  if (evidenceRuntimeScheduled) return;
  evidenceRuntimeScheduled = true;
  const run = () => ensureEvidenceRuntime().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout:2200 });
  else setTimeout(run, 900);
}

function primeEvidenceRuntime(event) {
  const target = event?.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-r2-input],#photoFileInput,[data-pqt-onclick*="openVisitPhotoInput"]')) {
    ensureEvidenceRuntime().catch(() => {});
  }
}

function installConflictResolver() {
  if (typeof window === 'undefined') return;
  // Compatibility surface only. Multi-user conflicts are resolved automatically
  // by the cloud rebase engine and must never block users with a modal.
  window.ProQConflict = Object.freeze({
    open:() => false,
    close:() => true,
    useServerVersion:async () => {
      const organizationId = window.FT?.state?.account?.organizationId || '';
      return Boolean(await window.ProQOffline?.recoverCloudConflict?.(organizationId));
    },
  });
}

function installStatusBridge() {
  if (typeof window === 'undefined') return;
  let last = '';
  window.addEventListener('proqtrack:offline-status', event => {
    const status = event.detail?.status;
    if ((status === 'queued-offline' || status === 'offline-session') && last !== status) {
      last = status;
      window.showToast?.('Mode offline aktif. Perubahan operasional aman di perangkat.', 'success');
    } else if (status === 'conflict-held') {
      // Legacy event compatibility: resolve automatically, never prompt.
      window.ProQOffline?.recoverCloudConflict?.(event.detail?.organizationId || '').catch?.(() => {});
      last = '';
    } else if (status === 'conflict-auto-resolved' || status === 'conflict-resolved-server') {
      last = '';
    } else if (status === 'synced') {
      last = '';
    }
  });
  window.addEventListener('proqtrack:evidence-status', event => {
    if (event.detail?.status === 'retry' && last !== 'evidence-retry') {
      last = 'evidence-retry';
      window.showToast?.('Upload evidence tertunda dan akan dicoba ulang otomatis.', 'error');
    } else if (event.detail?.status === 'synced' && last === 'evidence-retry') {
      last = '';
    }
  });
}

installConflictResolver();
installStatusBridge();

document.addEventListener('pointerdown', primeEvidenceRuntime, true);
document.addEventListener('focusin', primeEvidenceRuntime, true);
window.addEventListener('proqtrack:cloud-status', event => {
  if (event.detail?.status === 'ready' || event.detail?.status === 'synced') scheduleEvidenceRuntime();
});
window.addEventListener('online', () => {
  if (window.FT?.state?.loggedIn) scheduleEvidenceRuntime();
});
window.addEventListener('hashchange', () => {
  if (window.FT?.state?.loggedIn) scheduleEvidenceRuntime();
});

if (typeof window !== 'undefined') {
  window.__PROQTRACK_M4_BOOTSTRAP_LOADED__ = true;
}

function registerServiceWorkerAfterPaint() {
  if (!('serviceWorker' in navigator)) return false;
  const reloadKey = 'proqtrack_sw_controller_reload';
  try {
    if (navigator.serviceWorker.controller && sessionStorage.getItem(reloadKey) === '1') {
      sessionStorage.removeItem(reloadKey);
    }
  } catch { /* sessionStorage best effort */ }

  let controllerReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controllerReloaded) return;
    controllerReloaded = true;
    try { sessionStorage.setItem(reloadKey, '1'); } catch { /* best effort */ }
    location.reload();
  }, { once:true });

  const register = () => {
    const run = async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        await registration.update();
      } catch (error) {
        console.warn('m4_service_worker_register_failed', error?.message || error);
      }
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout:5000 });
    else setTimeout(run, 1200);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once:true });
  return true;
}

registerServiceWorkerAfterPaint();

export function installOfflineRuntime() {
  return installOfflineLogin();
}
