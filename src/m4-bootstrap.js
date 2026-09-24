import './lib/offline-engine.js';
import './lib/evidence-client.js';
import './lib/field-photo-evidence.js';
import { installOfflineLogin } from './lib/offline-login.js';

let activeConflictOrganizationId = '';

function closeConflictResolver() {
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
}

function openConflictResolver(detail = {}) {
  const root = document.getElementById('modalRoot');
  const organizationId = String(detail.organizationId || window.FT?.state?.account?.organizationId || '');
  if (!root || !organizationId) return false;
  activeConflictOrganizationId = organizationId;
  root.innerHTML = `
    <div class="modal-overlay" data-pqt-onclick="ProQConflict.close()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <h3 id="conflict-title">Perubahan perlu ditinjau</h3>
          <button class="modal-close" type="button" aria-label="Tutup" data-pqt-onclick="ProQConflict.close()">×</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 10px">Ada perubahan dari perangkat lain yang lebih baru.</p>
          <p style="margin:0;color:var(--gray-500);font-size:13px;line-height:1.55">
            Versi terbaru sudah digunakan. Salinan perubahan dari perangkat ini tetap disimpan dan tidak akan dikirim otomatis sampai Anda memilih tindakan.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" data-pqt-onclick="ProQConflict.close()">Tinjau nanti</button>
          <button class="btn btn-primary" type="button" data-pqt-onclick="ProQConflict.useServerVersion()">Gunakan versi terbaru</button>
        </div>
      </div>
    </div>`;
  return true;
}

async function useServerVersion() {
  const organizationId = activeConflictOrganizationId || window.FT?.state?.account?.organizationId || '';
  try {
    const resolved = await window.ProQOffline?.discardHeldSnapshot?.(organizationId);
    closeConflictResolver();
    activeConflictOrganizationId = '';
    window.showToast?.(
      resolved
        ? 'Versi terbaru dipakai. Salinan perubahan perangkat ini sudah dibersihkan.'
        : 'Tidak ada salinan perubahan yang perlu dibersihkan.',
      'success',
    );
    return Boolean(resolved);
  } catch (error) {
    console.error('offline_conflict_resolution_failed', error?.message || error);
    window.showToast?.('Penyelesaian perubahan gagal. Coba lagi.', 'error');
    return false;
  }
}

function installConflictResolver() {
  if (typeof window === 'undefined') return;
  window.ProQConflict = Object.freeze({
    open: openConflictResolver,
    close: closeConflictResolver,
    useServerVersion,
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
      if (last !== status) {
        last = status;
        window.showToast?.('Ada perubahan dari perangkat lain. Pilih tindakan untuk salinan perubahan perangkat ini.', 'error');
      }
      openConflictResolver(event.detail || {});
    } else if (status === 'conflict-resolved-server') {
      last = '';
      closeConflictResolver();
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

if (typeof window !== 'undefined') {
  window.__PROQTRACK_M4_BOOTSTRAP_LOADED__ = true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.warn('m4_service_worker_register_failed', error?.message || error);
  });
}

export function installOfflineRuntime() {
  return installOfflineLogin();
}
