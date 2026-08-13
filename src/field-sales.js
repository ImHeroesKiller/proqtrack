import {
  getVisits, getOutlets, getEmployees, getProducts, getStocks, getStocksByOutlet,
  getPriceObservations, getCompetitorIntel, getFieldPhotos, getFieldPhotosByEmployee,
  getAttendance, createAttendance, getAttendancePoints, createAttendancePoint,
  getVisitLocations, getVisitsOnDate, visitDay, FIELD_PHOTO_TYPES,
  getOrganization, getCurrentOrgId,
} from './lib/db.js';
import {
  esc, formatDate, formatDateShort, formatDuration, formatCurrency, statusBadge,
  outletIcon, todayISO, photoTypeLabel, normalizeAttendanceStatus, safePhotoUrl,
} from './lib/utils.js';
import { icon as appIcon } from '../assets/icons.js';

function empId() {
  return window.FT?.state?.account?.employeeId || null;
}

function openModal(title, body) {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()"><div class="modal animate-up"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" onclick="FT.closeModal()">✕</button></div><div class="modal-body">${body}</div></div></div>`;
}

export function renderLastLocation() {
  const id = empId();
  const rows = getVisitLocations(id);
  const today = todayISO();
  const todayRows = rows.filter(v => visitDay(v) === today);
  const outlets = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const uniqueToday = [...new Map(todayRows.map(v => [v.outletId, v])).values()];
  return `
    <div class="grid-3" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-icon">${appIcon('pin')}</div><div class="stat-label">Lokasi hari ini</div><div class="stat-value">${uniqueToday.length}</div></div>
      <div class="stat-card"><div class="stat-icon">${appIcon('visits')}</div><div class="stat-label">Check-in hari ini</div><div class="stat-value">${todayRows.length}</div></div>
      <div class="stat-card"><div class="stat-icon">${appIcon('calendar')}</div><div class="stat-label">Riwayat tersimpan</div><div class="stat-value">${rows.length}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Last Location</div>
      <div class="card-subtitle">Posisi terakhir dari check-in di toko atau lokasi kerja. Boleh lebih dari satu toko per hari; riwayat tidak dihapus.</div>
      ${!uniqueToday.length ? `<div class="empty-state">${appIcon('pin')}<h3>Belum ada check-in hari ini</h3><p>Check-in di kunjungan terjadwal agar last location tercatat.</p></div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          ${uniqueToday.map(v => {
            const o = outlets[v.outletId];
            return `<div style="display:flex;gap:12px;padding:14px;border-radius:12px;background:var(--gray-50)">
              <div class="stat-icon">${appIcon('pin')}</div>
              <div style="flex:1">
                <strong>${esc(o?.name || v.outletId)}</strong>
                <div class="am-muted">${esc(o?.address || '')}</div>
                <div class="am-muted">Check-in ${v.checkInTime || '—'}${v.checkOutTime ? ' · check-out ' + v.checkOutTime : ' · masih di lokasi'}</div>
              </div>
              ${statusBadge(v.status)}
            </div>`;
          }).join('')}
        </div>`}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">Riwayat lokasi</div>
      <div class="visits-table-wrapper">
        <table class="table"><thead><tr><th>Tanggal</th><th>Lokasi</th><th>Masuk</th><th>Keluar</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map(v => {
          const o = outlets[v.outletId];
          return `<tr><td>${formatDateShort(visitDay(v))}</td><td>${esc(o?.name || '-')}</td><td>${v.checkInTime || '—'}</td><td>${v.checkOutTime || '—'}</td><td>${statusBadge(v.status)}</td></tr>`;
        }).join('') : '<tr><td colspan="5"><div class="empty-state"><h3>Belum ada riwayat</h3></div></td></tr>'}</tbody></table>
      </div>
    </div>`;
}

export function attendanceCheckinCard() {
  const id = empId();
  const today = todayISO();
  const att = getAttendance().find(a => a.employeeId === id && a.date === today);
  const points = getAttendancePoints();
  const firstStore = getVisitsOnDate(today, id)[0];
  const store = firstStore ? getOutlets().find(o => o.id === firstStore.outletId) : null;
  if (att) {
    return `<div style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:12px;background:#ecfdf5">
      ${appIcon('attendance')}
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--green-600)">${esc(att.status === 'late' || att.status === 'terlambat' ? 'Terlambat' : 'Hadir')}</div>
        <div class="am-muted">Check in ${att.checkInTime || '-'} · ${esc(att.checkInLocation || att.locationName || '-')}${att.locationType ? ' · ' + locationTypeLabel(att.locationType) : ''}</div>
      </div>
    </div>`;
  }
  return `<div>
    <p class="am-muted" style="margin:0 0 10px">Pilih lokasi check-in yang ditentukan supervisor/manager.</p>
    <form onsubmit="FS.checkInAttendance(event)">
      <div class="form-group">
        <label class="label">Lokasi absensi</label>
        <select class="select" name="point" required>
          <option value="">Pilih lokasi</option>
          ${points.map(p => `<option value="${p.id}|${p.type}|${esc(p.name)}">${esc(p.name)} — ${locationTypeLabel(p.type)}</option>`).join('')}
          ${store ? `<option value="${store.id}|store|${esc(store.name)}">${esc(store.name)} — Toko pertama hari ini</option>` : ''}
        </select>
      </div>
      <button class="btn btn-primary" type="submit">Check in absensi</button>
    </form>
  </div>`;
}

function locationTypeLabel(type) {
  return { office: 'Kantor', store: 'Toko', meeting: 'Meeting point' }[type] || type || '—';
}

export function renderVisitDetailHtml(visitId) {
  const v = getVisits().find(x => x.id === visitId);
  if (!v) return '<p>Kunjungan tidak ditemukan.</p>';
  const o = getOutlets().find(x => x.id === v.outletId);
  const stocks = getStocks().filter(s => s.outletId === v.outletId);
  const prices = getPriceObservations().filter(p => p.visitId === visitId || (p.outletId === v.outletId && p.recordedAt?.slice(0, 10) === visitDay(v)));
  const intel = getCompetitorIntel().filter(i => i.visitId === visitId || (i.outletId === v.outletId && (i.recordedAt || '').slice(0, 10) === visitDay(v)));
  const photos = getFieldPhotos().filter(p => p.visitId === visitId || (p.outletId === v.outletId && (p.recordedAt || '').slice(0, 10) === visitDay(v)));
  const products = Object.fromEntries(getProducts().map(p => [p.id, p]));
  return `
    <div class="detail-grid" style="margin-bottom:14px">
      <div class="detail-label">Toko</div><div class="detail-value">${esc(o?.name || '-')}</div>
      <div class="detail-label">Tanggal</div><div class="detail-value">${formatDate(visitDay(v))}</div>
      <div class="detail-label">Check in</div><div class="detail-value">${v.checkInTime || '—'}</div>
      <div class="detail-label">Check out</div><div class="detail-value">${v.checkOutTime || '—'}</div>
      <div class="detail-label">Durasi</div><div class="detail-value">${formatDuration(v.checkInTime, v.checkOutTime)}</div>
      <div class="detail-label">Status</div><div class="detail-value">${statusBadge(v.status)}</div>
      <div class="detail-label">Catatan</div><div class="detail-value full">${esc(v.notes || '—')}</div>
    </div>
    <h4>Stok</h4>
    ${stocks.length ? `<ul>${stocks.map(s => `<li>${esc(products[s.productId]?.name || s.productId)}: <b>${s.quantity}</b></li>`).join('')}</ul>` : '<p class="am-muted">Belum ada stok.</p>'}
    <h4>Harga & diskon</h4>
    ${prices.length ? `<ul>${prices.map(p => `<li>${esc(products[p.productId]?.name || p.productId)}: ${formatCurrency(p.observedPrice || p.price || 0)}${p.discountPercent ? ' · diskon ' + p.discountPercent + '%' : ''}</li>`).join('')}</ul>` : '<p class="am-muted">Belum ada observasi harga.</p>'}
    <h4>Intel kompetitor</h4>
    ${intel.length ? `<ul>${intel.map(i => `<li>${esc(products[i.productId]?.name || 'Produk')} vs kompetitor · shelf ${i.shelfShare || 0}%</li>`).join('')}</ul>` : '<p class="am-muted">Belum ada intel.</p>'}
    <h4>Foto</h4>
    ${photos.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${photos.map(p => {
      const src = safePhotoUrl(p.dataUrl || p.photoUrl);
      return src ? `<img src="${src}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px">` : `<span class="am-muted">${photoTypeLabel(p.photoType || p.type)}</span>`;
    }).join('')}</div>` : '<p class="am-muted">Belum ada foto.</p>'}
    <div class="modal-footer"><button class="btn btn-secondary" onclick="FT.closeModal()">Tutup</button></div>
  `;
}

export function photoFilterBar(managerView) {
  const f = window.FT.state._photoFilters || {};
  const outlets = getOutlets();
  return `<div class="filter-row" style="flex-wrap:wrap;gap:8px">
    <input class="input search-input" placeholder="Cari caption, toko, jenis..." value="${esc(f.q || '')}" oninput="FS.setPhotoFilter('q',this.value)">
    <input class="input" type="date" value="${esc(f.date || '')}" onchange="FS.setPhotoFilter('date',this.value)" title="Tanggal">
    <select class="select" style="width:auto;min-width:160px" onchange="FS.setPhotoFilter('outletId',this.value)">
      <option value="">Semua toko</option>
      ${outlets.map(o => `<option value="${o.id}" ${f.outletId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
    </select>
    <select class="select" style="width:auto;min-width:140px" onchange="FS.setPhotoFilter('type',this.value)">
      <option value="">Semua jenis</option>
      ${FIELD_PHOTO_TYPES.map(t => `<option value="${t.code}" ${f.type === t.code ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
  </div>`;
}

export function applyPhotoFilters(photos) {
  const f = window.FT.state._photoFilters || {};
  const q = String(f.q || '').toLowerCase();
  return photos.filter(p => {
    if (f.type && (p.photoType || p.type) !== f.type) return false;
    if (f.outletId && p.outletId !== f.outletId) return false;
    if (f.date && String(p.recordedAt || p.createdAt || '').slice(0, 10) !== f.date) return false;
    if (q) {
      const blob = `${p.caption || ''} ${p.title || ''} ${p.note || ''} ${p.outletId || ''} ${p.photoType || p.type || ''}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export function productPickerRows(kind, outletId) {
  const products = getProducts().filter(p => p.status === 'active');
  const existing = kind === 'stock' ? getStocksByOutlet(outletId) : [];
  return `<div id="${kind}Rows">
    ${productRow(kind, products, existing, 0)}
  </div>
  <button type="button" class="btn btn-secondary btn-sm" style="margin:8px 0" onclick="FS.addProductRow('${kind}','${outletId}')">${appIcon('plus')} Tambah produk lain</button>`;
}

function productRow(kind, products, existing, idx) {
  return `<div class="fs-product-row" data-idx="${idx}" style="border:1px solid var(--gray-200);border-radius:12px;padding:12px;margin-bottom:8px">
    <div class="form-group"><label class="label">Produk dari katalog</label>
      <select class="select" name="productId" required>
        <option value="">— Pilih produk —</option>
        ${products.map(p => {
          const ex = existing.find(s => s.productId === p.id);
          return `<option value="${p.id}">${esc(p.name)} (${esc(p.sku || '-')})${ex ? ' · sudah ada' : ''}</option>`;
        }).join('')}
      </select>
    </div>
    ${kind === 'stock' ? `<div class="form-row"><div class="form-group"><label class="label">Qty</label><input class="input" type="number" name="quantity" min="0" required></div>
      <div class="form-group"><label class="label">Min</label><input class="input" type="number" name="minStock" value="5" min="0" required></div></div>` : ''}
    ${kind === 'price' ? `<div class="form-group"><label class="label">Harga teramati</label><input class="input" type="number" name="observedPrice" min="0" required></div>
      <div class="form-row"><div class="form-group"><label class="label">Diskon %</label><input class="input" type="number" name="discountPercent" value="0" min="0"></div>
      <div class="form-group"><label class="label">Diskon Rp</label><input class="input" type="number" name="discountAmount" value="0" min="0"></div></div>` : ''}
  </div>`;
}

window.FS = {
  checkInAttendance(e) {
    e.preventDefault();
    const raw = new FormData(e.target).get('point') || '';
    const [locationId, locationType, ...nameParts] = String(raw).split('|');
    const locationName = nameParts.join('|');
    const id = empId();
    if (!id) { window.showToast?.('Akses ditolak', 'error'); return; }
    const now = new Date();
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now));
    createAttendance({
      employeeId: id,
      date: todayISO(),
      checkInTime: now.toTimeString().slice(0, 5),
      status: hour >= 9 ? 'terlambat' : 'hadir',
      checkInLocation: locationName,
      locationType,
      locationId,
    });
    window.showToast?.('Absensi tercatat', 'success');
    window.FT?.state && (location.hash = '#/myday');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  openVisitDetail(id) {
    openModal('Detail kunjungan', renderVisitDetailHtml(id));
  },
  setPhotoFilter(key, value) {
    const state = window.FT.state;
    state._photoFilters = { ...(state._photoFilters || {}), [key]: value };
    if (key === 'type') state._photoFilterType = value;
    window.FT.navigate ? null : null;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  addProductRow(kind, outletId) {
    const wrap = document.getElementById(kind + 'Rows');
    if (!wrap) return;
    const products = getProducts().filter(p => p.status === 'active');
    wrap.insertAdjacentHTML('beforeend', productRow(kind, products, [], wrap.children.length));
  },
  addAttendancePoint(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      createAttendancePoint(data);
      window.showToast?.('Titik absensi ditambah', 'success');
      window.FT.closeModal?.();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      window.showToast?.(err.message || err, 'error');
    }
  },
};

export { locationTypeLabel };
