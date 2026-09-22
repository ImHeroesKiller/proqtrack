import './lib/offline-engine.js';
import './lib/evidence-client.js';
import './lib/field-photo-evidence.js';
import './lib/offline-login.js';

function installStatusBridge() {
  if (typeof window === 'undefined') return;
  let last = '';
  window.addEventListener('proqtrack:offline-status', event => {
    const status = event.detail?.status;
    if ((status === 'queued-offline' || status === 'offline-session') && last !== status) {
      last = status;
      window.showToast?.('Mode offline aktif. Perubahan operasional aman di perangkat.', 'success');
    } else if (status === 'conflict-held' && last !== status) {
      last = status;
      window.showToast?.('Ada perubahan dari perangkat lain. Perubahan offline tetap tersimpan untuk ditinjau.', 'error');
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

installStatusBridge();

if (typeof window !== 'undefined') {
  window.__PROQTRACK_M4_BOOTSTRAP_LOADED__ = true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.warn('m4_service_worker_register_failed', error?.message || error);
  });
}
