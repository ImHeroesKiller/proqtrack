// ProQTrack P2 route chunk: field photo gallery
import {
  getFieldPhotos, getFieldPhotosByEmployee, getOutlets, getEmployees, getProducts,
  getCompetitors, getVisits, FIELD_PHOTO_TYPES,
} from '../lib/db.js';
import {
  esc, safePhotoUrl, photoTypeLabel, formatDateShort, outletIcon,
} from '../lib/utils.js';
import { photoFilterBar, applyPhotoFilters } from '../field-sales.js';

const PHOTO_PAGE_SIZE = 24;
const state = () => window.FT?.state || {};
const myEmployeeId = () => String(state().account?.employeeId || '');
const isProjectAdmin = () => ['superadmin','head','admin','manager'].includes(String(state().account?.role || ''));

export function renderFieldPhotosGallery({ managerView }) {
  const empId = myEmployeeId();
  const basePhotos = managerView
    ? [...getFieldPhotos()]
    : [...getFieldPhotosByEmployee(empId)];
  let photos = [...basePhotos];
  photos.sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  photos = applyPhotoFilters(photos);
  const visibleCount = Math.min(
    photos.length,
    Math.max(PHOTO_PAGE_SIZE, Number(state()._photoVisibleCount) || PHOTO_PAGE_SIZE),
  );
  const visiblePhotos = photos.slice(0, visibleCount);

  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const compMap = Object.fromEntries(getCompetitors().map(c => [c.id, c]));
  const activeVisits = !managerView && empId
    ? getVisits().filter(v => v.employeeId === empId && v.status === 'checked-in')
    : [];

  const typeCounts = new Map();
  for (const photo of basePhotos) {
    const key = photo.photoType || photo.type || '';
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }
  const byType = FIELD_PHOTO_TYPES.map(t => ({
    ...t,
    count: typeCounts.get(t.code) || 0,
  }));

  return `
    ${!managerView && activeVisits.length > 0 ? `
      <div class="card" style="margin-bottom:16px;border-color:#93c5fd;background:var(--blue-50);">
        <div style="font-size:15px;font-weight:700;color:var(--blue-600);margin-bottom:8px;">Ambil foto saat visit aktif</div>
        ${activeVisits.map(v => {
          const o = outletMap[v.outletId];
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:white;border-radius:10px;margin-bottom:8px;">
              <div style="font-size:22px;">${o ? outletIcon(o.type) : '🏪'}</div>
              <div style="flex:1;">
                <div style="font-weight:600;">${o?.name || v.outletId}</div>
                <div style="font-size:12px;color:var(--gray-400);">Check in: ${v.checkInTime || '—'}</div>
              </div>
              <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.openVisitPhotoInput('${v.id}','${v.outletId}')">+ Foto</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="grid-4" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">▣</div>
        <div class="stat-label">Total Foto</div>
        <div class="stat-value">${basePhotos.length}</div>
      </div>
      ${byType.slice(0, 3).map(t => `
        <div class="stat-card">
          <div class="stat-label">${t.label}</div>
          <div class="stat-value" style="font-size:22px;">${t.count}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-title" style="margin:0 0 10px">${managerView ? 'Galeri Tim' : 'Galeri Saya'}</div>
      ${photoFilterBar(managerView)}
      <div class="card-subtitle">${managerView ? 'Semua foto field sales & supervisor' : 'Hanya foto yang Anda ambil'}</div>

      ${photos.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">▣</div>
          <h3>Belum ada foto</h3>
          <p>${managerView ? 'Tim belum mengunggah foto lapangan' : 'Ambil foto saat check-in di outlet'}</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:14px;">
          ${visiblePhotos.map(p => {
            const o = outletMap[p.outletId];
            const emp = empMap[p.recordedBy || p.employeeId];
            const prod = p.productId ? productMap[p.productId] : null;
            const comp = p.competitorId ? compMap[p.competitorId] : null;
            const imageSrc = safePhotoUrl(p.dataUrl || p.photoUrl);
            const thumb = imageSrc
              ? `<img src="${imageSrc}" alt="" loading="lazy" decoding="async" fetchpriority="low" style="width:100%;height:120px;object-fit:cover;border-radius:10px 10px 0 0;display:block;">`
              : `<div style="width:100%;height:120px;border-radius:10px 10px 0 0;background:linear-gradient(135deg,#e2e8f0,#f1f5f9);display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-size:13px;font-weight:600;">${photoTypeLabel(p.photoType || p.type)}</div>`;
            return `
              <div style="border:1px solid var(--gray-200);border-radius:12px;overflow:hidden;background:white;">
                ${thumb}
                <div style="padding:10px;">
                  <div style="font-size:11px;font-weight:700;color:var(--blue-600);margin-bottom:2px;">${photoTypeLabel(p.type)}</div>
                  <div style="font-size:12px;font-weight:600;color:var(--gray-800);line-height:1.3;min-height:32px;">${esc(p.caption || p.title || 'Tanpa caption')}</div>
                  <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">${o ? outletIcon(o.type) + ' ' + esc(o.name) : esc(p.outletId || '—')}</div>
                  ${managerView ? `<div style="font-size:11px;color:var(--gray-400);">${esc(emp?.name || '—')}</div>` : ''}
                  ${prod ? `<div style="font-size:10px;color:var(--gray-500);margin-top:2px;">📦 ${esc(prod.name)}</div>` : ''}
                  ${comp ? `<div style="font-size:10px;color:${comp.color || 'var(--gray-500)'};">◇ ${esc(comp.name)}</div>` : ''}
                  <div style="font-size:10px;color:var(--gray-400);margin-top:4px;">${formatDateShort((p.recordedAt || p.createdAt || '').slice(0, 10))}</div>
                  ${(!managerView || isProjectAdmin()) ? `
                    <button class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%;" data-pqt-onclick="FT.deleteFieldPhotoConfirm('${p.id}')">Hapus</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        ${visiblePhotos.length < photos.length ? `
          <div style="display:flex;justify-content:center;margin-top:16px;">
            <button class="btn btn-secondary" type="button" data-pqt-onclick="FT.loadMorePhotos()">Muat lebih banyak (${photos.length - visiblePhotos.length} tersisa)</button>
          </div>
        ` : ''}
      `}
    </div>
  `;
}

