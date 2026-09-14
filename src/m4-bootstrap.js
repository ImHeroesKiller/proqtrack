import './lib/offline-engine.js';
import './lib/evidence-client.js';

function installStatusBridge() {
  if (typeof window === 'undefined') return;
  let last = '';
  window.addEventListener('proqtrack:offline-status', event => {
    const status = event.detail?.status;
    if (status === 'queued-offline' && last !== status) {
      last = status;
      window.showToast?.('Mode offline aktif. Perubahan operasional aman di perangkat.', 'success');
    } else if (status === 'conflict-rebased' && last !== status) {
      last = status;
      window.showToast?.('Perubahan lokal sudah direbase ke revisi D1 terbaru.', 'success');
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.warn('m4_service_worker_register_failed', error?.message || error);
  });
}
