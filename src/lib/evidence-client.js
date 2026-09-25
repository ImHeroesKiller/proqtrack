import { authHeaders, getApiToken } from './uploads.js';
import {
  putEvidence,
  listEvidence,
  patchEvidence,
  markEvidenceDone,
  retryDelayMs,
  offlineQueueStats,
} from './offline-store.js';

let flushing = false;
let installed = false;

const nowIso = () => new Date().toISOString();
const uid = () => crypto?.randomUUID?.() || `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function activeAccount() {
  return window.FT?.state?.account || null;
}

function activeOrganizationId() {
  return String(activeAccount()?.organizationId || '');
}

function emit(status, detail = {}) {
  const organizationId = detail.organizationId || activeOrganizationId();
  offlineQueueStats(organizationId).then(queue => {
    window.dispatchEvent(new CustomEvent('proqtrack:evidence-status', {
      detail: { status, organizationId, queue, online: navigator.onLine !== false, ...detail },
    }));
  }).catch(() => {});
}

function evidenceApiUrl(item) {
  const params = new URLSearchParams({
    id: item.id,
    projectId: item.projectId,
    evidenceType: item.evidenceType || 'field_photo',
    capturedAt: item.capturedAt || nowIso(),
    name: item.name || `evidence-${item.id}`,
  });
  if (item.employeeId) params.set('employeeId', item.employeeId);
  if (item.outletId) params.set('outletId', item.outletId);
  if (item.visitId) params.set('visitId', item.visitId);
  if (item.latitude != null) params.set('latitude', String(item.latitude));
  if (item.longitude != null) params.set('longitude', String(item.longitude));
  return `/api/evidence?${params}`;
}

export async function queueEvidence(file, metadata = {}) {
  if (!(file instanceof Blob)) throw new Error('FILE_REQUIRED');
  const account = activeAccount();
  const organizationId = String(metadata.organizationId || account?.organizationId || '');
  const projectId = String(metadata.projectId || account?.projectId || '');
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  if (!projectId || projectId === 'general') throw new Error('PROJECT_REQUIRED');
  if (file.size > 5 * 1024 * 1024) throw new Error('EVIDENCE_TOO_LARGE');
  if (file.type && !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('UNSUPPORTED_EVIDENCE_TYPE');

  const id = String(metadata.id || uid());
  const row = await putEvidence({
    id,
    organizationId,
    projectId,
    employeeId: metadata.employeeId || account?.employeeId || '',
    outletId: metadata.outletId || '',
    visitId: metadata.visitId || '',
    evidenceType: metadata.evidenceType || metadata.category || 'field_photo',
    capturedAt: metadata.capturedAt || nowIso(),
    latitude: metadata.latitude ?? null,
    longitude: metadata.longitude ?? null,
    name: metadata.name || file.name || `evidence-${id}`,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    blob: file,
  });
  emit('queued', { organizationId, evidenceId: id });
  if (navigator.onLine !== false && getApiToken()) queueMicrotask(() => flushEvidenceQueue(organizationId));
  return row;
}

async function uploadQueuedEvidence(item) {
  const res = await fetch(evidenceApiUrl(item), {
    method: 'POST',
    headers: authHeaders({
      'content-type': item.contentType || item.blob?.type || 'application/octet-stream',
      'idempotency-key': item.id,
      'x-evidence-id': item.id,
    }),
    body: item.blob,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.message || payload.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = payload.error;
    throw error;
  }
  await markEvidenceDone(item.id, payload.evidence || payload);
  return payload;
}

export async function flushEvidenceQueue(organizationId = activeOrganizationId()) {
  if (flushing || !organizationId || navigator.onLine === false || !getApiToken()) return false;
  flushing = true;
  emit('syncing', { organizationId });
  try {
    const rows = await listEvidence(organizationId);
    for (const item of rows) {
      if (Number(item.nextAttemptAt || 0) > Date.now()) continue;
      try {
        await uploadQueuedEvidence(item);
      } catch (error) {
        const permanent = error.status && error.status >= 400 && error.status < 500 && ![408,409,425,429].includes(error.status);
        const attempts = Number(item.attempts || 0) + 1;
        await patchEvidence(item.id, {
          status: permanent ? 'failed' : 'pending',
          attempts,
          lastError: error.code || error.message || String(error),
          nextAttemptAt: permanent ? Number.MAX_SAFE_INTEGER : Date.now() + retryDelayMs(attempts),
        });
        emit(permanent ? 'failed' : 'retry', { organizationId, evidenceId: item.id, error: error.code || error.message });
        if (!permanent) break;
      }
    }
    emit('synced', { organizationId });
    return true;
  } finally {
    flushing = false;
  }
}

export async function fetchEvidenceObject(evidenceId) {
  const res = await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

function fieldBox(input) {
  return input?.closest?.('.r2-upload') || null;
}

async function handleFieldChange(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches('[data-r2-input]')) return;
  const box = fieldBox(input);
  const file = input.files?.[0];
  const projectId = box?.dataset?.r2Project || '';
  if (!box || !file || !projectId || projectId === 'general' || !String(file.type || '').startsWith('image/')) return;

  event.stopImmediatePropagation();
  event.preventDefault();
  const hidden = box.querySelector('[data-r2-value]');
  const status = box.querySelector('[data-r2-status]');
  const preview = box.querySelector('.r2-preview');
  try {
    if (status) status.textContent = navigator.onLine === false ? 'Disimpan offline...' : 'Menyimpan evidence...';
    const queued = await queueEvidence(file, {
      projectId,
      category: box.dataset.r2Category || 'field_photo',
      evidenceType: box.dataset.r2Category || 'field_photo',
      name: file.name,
    });
    if (hidden) hidden.value = `evidence:${queued.id}`;
    if (preview) {
      const previewUrl = URL.createObjectURL(file);
      preview.classList.remove('r2-preview-empty');
      let image = preview;
      if (preview.tagName === 'IMG') preview.src = previewUrl;
      else {
        preview.innerHTML = `<img alt="Preview evidence" src="${previewUrl}">`;
        image = preview.querySelector('img');
      }
      const release = () => URL.revokeObjectURL(previewUrl);
      image?.addEventListener('load', release, { once:true });
      image?.addEventListener('error', release, { once:true });
    }
    if (status) status.textContent = navigator.onLine === false ? 'Tersimpan offline · akan disinkronkan' : 'Evidence masuk antrean sinkronisasi';
    window.showToast?.(navigator.onLine === false ? 'Foto aman di perangkat dan akan diunggah saat online.' : 'Foto masuk antrean evidence.', 'success');
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
    window.showToast?.(`Evidence gagal disimpan: ${error.message || error}`, 'error');
  }
}

export function installEvidenceClient() {
  if (installed || typeof document === 'undefined') return false;
  installed = true;
  document.addEventListener('change', handleFieldChange, true);
  window.addEventListener('online', () => flushEvidenceQueue().catch(() => {}));
  window.addEventListener('proqtrack:cloud-status', event => {
    if (event.detail?.status === 'ready' || event.detail?.status === 'synced') flushEvidenceQueue().catch(() => {});
  });
  return true;
}

installEvidenceClient();
if (typeof window !== 'undefined') {
  window.ProQEvidence = { queueEvidence, flushEvidenceQueue, fetchEvidenceObject };
}
