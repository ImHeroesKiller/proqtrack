import { createFieldPhoto, deleteFieldPhoto, getDB } from './db.js';
import { queueEvidence } from './evidence-client.js';

let installed = false;

function dataUrlToBlob(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] || 'image/jpeg' });
}

function activeAssignment(db, employeeId, projectIds = []) {
  const allowed = new Set((projectIds || []).filter(Boolean));
  return (db.projectAssignments || []).find(row =>
    row.employeeId === employeeId
    && row.status === 'active'
    && (!allowed.size || allowed.has(row.projectId))
  ) || null;
}

export function resolveFieldPhotoContext(db, account, visitId, outletId) {
  const visit = (db.visits || []).find(row => row.id === visitId) || null;
  const outlet = (db.outlets || []).find(row => row.id === outletId) || null;
  const employeeId = account?.employeeId || visit?.employeeId || '';
  const outletProjects = Array.isArray(outlet?.projectIds)
    ? outlet.projectIds.filter(Boolean)
    : (outlet?.projectId ? [outlet.projectId] : []);

  let projectId = visit?.projectId || '';
  if (!projectId && employeeId && outletProjects.length) {
    projectId = activeAssignment(db, employeeId, outletProjects)?.projectId || '';
  }
  if (!projectId && outletProjects.length === 1) projectId = outletProjects[0];
  if (!projectId && employeeId) projectId = activeAssignment(db, employeeId)?.projectId || '';
  if (!projectId && account?.projectId) projectId = account.projectId;

  return { visit, outlet, employeeId, projectId };
}

function evidenceTypeFor(type) {
  return ({
    location: 'field_location',
    product: 'product_photo',
    shelf: 'rack_shelf',
    competitor: 'competitor_photo',
    rack_before: 'rack_before',
    rack_after: 'rack_after',
    selfie: 'selfie',
  })[type] || type || 'field_photo';
}

async function saveFieldPhotoM4(event, visitId, outletId) {
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();

  const form = event?.target;
  const fd = new FormData(form);
  const file = form?.querySelector?.('[name="photoFile"]')?.files?.[0] || null;
  const dataUrl = String(fd.get('dataUrl') || document.getElementById('photoDataUrl')?.value || '');
  const blob = dataUrlToBlob(dataUrl) || file;
  const btn = document.getElementById('photoSaveBtn');

  if (!(blob instanceof Blob) || !blob.size) {
    window.showToast?.('Pilih atau ambil foto dulu.', 'error');
    return;
  }

  const db = getDB();
  const account = window.FT?.state?.account || null;
  const context = resolveFieldPhotoContext(db, account, visitId, outletId);
  if (!context.projectId) {
    window.showToast?.('Project aktif untuk kunjungan ini tidak ditemukan.', 'error');
    return;
  }
  if (!context.employeeId) {
    window.showToast?.('Karyawan untuk evidence ini tidak ditemukan.', 'error');
    return;
  }

  const type = String(fd.get('type') || 'location');
  const evidenceId = crypto?.randomUUID?.() || `evidence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let localPhoto = null;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan evidence...'; }

    localPhoto = createFieldPhoto({
      projectId: context.projectId,
      visitId: visitId || null,
      outletId,
      employeeId: context.employeeId,
      recordedBy: context.employeeId,
      type,
      photoType: type,
      caption: String(fd.get('caption') || ''),
      productId: fd.get('productId') || null,
      competitorId: fd.get('competitorId') || null,
      dataUrl: dataUrl || null,
      photoUrl: `evidence:${evidenceId}`,
      evidenceId,
      evidenceStatus: 'queued',
      recordedAt: new Date().toISOString(),
    });

    await queueEvidence(blob, {
      id: evidenceId,
      organizationId: account?.organizationId || context.visit?.organizationId || context.outlet?.organizationId || db.currentOrganizationId,
      projectId: context.projectId,
      employeeId: context.employeeId,
      outletId,
      visitId: visitId || '',
      evidenceType: evidenceTypeFor(type),
      category: evidenceTypeFor(type),
      capturedAt: new Date().toISOString(),
      name: file?.name || `${evidenceId}.jpg`,
    });

    window.FT?.closeModal?.();
    window.showToast?.(
      navigator.onLine === false
        ? 'Foto aman di perangkat. Evidence akan diunggah saat online.'
        : 'Foto masuk antrean unggah.',
      'success',
    );
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (error) {
    if (localPhoto?.id) {
      try { deleteFieldPhoto(localPhoto.id); } catch { /* rollback best effort */ }
    }
    window.showToast?.(`Evidence gagal disimpan: ${error?.message || error}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Foto'; }
  }
}

export function installFieldPhotoEvidenceBridge() {
  if (installed || typeof window === 'undefined') return false;
  const attach = () => {
    if (!window.FT?.saveFieldPhoto || !window.FT?.state) {
      setTimeout(attach, 0);
      return;
    }
    if (window.FT.__m4FieldPhotoEvidenceInstalled) return;
    window.FT.saveFieldPhoto = saveFieldPhotoM4;
    window.FT.__m4FieldPhotoEvidenceInstalled = true;
  };
  installed = true;
  setTimeout(attach, 0);
  return true;
}

installFieldPhotoEvidenceBridge();

export const __test = { dataUrlToBlob, evidenceTypeFor, resolveFieldPhotoContext };
