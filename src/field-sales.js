import {
  getVisits, getOutlets, getEmployees, getProducts, getStocks, getStocksByOutlet,
  getPriceObservations, getCompetitorIntel, getFieldPhotos, getFieldPhotosByEmployee,
  getAttendance, createAttendance, checkOutAttendance, getAttendancePoints, createAttendancePoint,
  getVisitLocations, getVisitsOnDate, visitDay, FIELD_PHOTO_TYPES,
  getOrganization, getCurrentOrgId, getDB, getActor,
  createOutletProposal, getOutletProposals, reviewOutletProposal,
  canEmployeeAddStore, outletProjectsForEmployee, storeCatalogForEmployee, formatOutletLabel,
  getAttendancePolicy, getProjectAttendancePolicy, getEmployeeAttendanceProjects, getEmployee,
} from './lib/db.js';
import {
  esc, formatDate, formatDateShort, formatDuration, formatCurrency, statusBadge,
  outletIcon, todayISO, photoTypeLabel, normalizeAttendanceStatus, safePhotoUrl,
} from './lib/utils.js';
import { icon as appIcon } from '../assets/icons.js';
import { locationFreshness, locationSourceLabel, visitLocationEvidence, currentTenantTimeHHMM } from './lib/location-evidence.js';
import { attendanceLeaveFriendlyErrorMessage, attendanceSourceKey, attendanceSourceLabel } from './lib/attendance-leave-ui.js';
import { refreshOperationalData, waitForOperationalSync, restoreOperationalBaseline } from './lib/cloud-data.js';

function empId() {
  return window.FT?.state?.account?.employeeId || null;
}

function openModal(title, body) {
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML = `<div class="modal-overlay" data-pqt-onclick="if(event.target===this)FT.closeModal()"><div class="modal animate-up"><div class="modal-header"><h3>${esc(title)}</h3><button class="modal-close" data-pqt-onclick="FT.closeModal()">✕</button></div><div class="modal-body">${body}</div></div></div>`;
}

export function renderLastLocation() {
  const id = empId();
  const rows = getVisitLocations(id);
  const today = todayISO();
  const todayRows = rows.filter(v => visitDay(v) === today);
  const outlets = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const uniqueToday = [...new Map(todayRows.map(v => [v.outletId, v])).values()];
  const evidenceFor = visit => {
    const outlet = outlets[visit.outletId] || null;
    const evidence = visitLocationEvidence(visit,outlet);
    return {
      outlet,
      evidence,
      freshness:locationFreshness(evidence,visit,Date.now(),today),
    };
  };
  return `
    <div class="grid-3" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-icon">${appIcon('pin')}</div><div class="stat-label">Lokasi hari ini</div><div class="stat-value">${uniqueToday.length}</div></div>
      <div class="stat-card"><div class="stat-icon">${appIcon('visits')}</div><div class="stat-label">Check-in hari ini</div><div class="stat-value">${todayRows.length}</div></div>
      <div class="stat-card"><div class="stat-icon">${appIcon('calendar')}</div><div class="stat-label">Riwayat tersimpan</div><div class="stat-value">${rows.length}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Last Location</div>
      <div class="card-subtitle">Sumber lokasi dibedakan antara GPS perangkat dan referensi outlet. Referensi outlet bukan posisi aktual perangkat.</div>
      ${!uniqueToday.length ? `<div class="empty-state">${appIcon('pin')}<h3>Belum ada check-in hari ini</h3><p>Check-in di kunjungan terjadwal agar lokasi tercatat.</p></div>` : `
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          ${uniqueToday.map(v => {
            const { outlet:o, evidence, freshness } = evidenceFor(v);
            const source = locationSourceLabel(evidence);
            const accuracy = evidence?.accuracyM != null ? ` · akurasi ±${Math.round(evidence.accuracyM)} m` : '';
            return `<div style="display:flex;gap:12px;padding:14px;border-radius:12px;background:var(--gray-50)">
              <div class="stat-icon">${appIcon('pin')}</div>
              <div style="flex:1">
                <strong>${esc(o?.name || v.outletId)}</strong>
                <div class="am-muted">${esc(o?.address || '')}</div>
                <div class="am-muted">${esc(source)}${esc(accuracy)} · ${esc(freshness.label)}</div>
                <div class="am-muted">Check-in ${v.checkInTime || '—'}${v.checkOutTime ? ' · check-out ' + v.checkOutTime : ' · belum check-out'}</div>
                ${evidence && !evidence.actual ? '<div class="tracking-reference-warning">Lokasi outlet referensi — bukan posisi aktual perangkat.</div>' : ''}
              </div>
              ${statusBadge(v.status)}
            </div>`;
          }).join('')}
        </div>`}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">Riwayat lokasi</div>
      <div class="visits-table-wrapper">
        <table class="table"><thead><tr><th>Tanggal</th><th>Lokasi</th><th>Sumber</th><th>Masuk</th><th>Keluar</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map(v => {
          const { outlet:o, evidence, freshness } = evidenceFor(v);
          return `<tr><td>${formatDateShort(visitDay(v))}</td><td>${esc(o?.name || '-')}</td><td>${esc(locationSourceLabel(evidence))}<div class="am-muted">${esc(freshness.label)}</div></td><td>${v.checkInTime || '—'}</td><td>${v.checkOutTime || 'Belum check-out'}</td><td>${statusBadge(v.status)}</td></tr>`;
        }).join('') : '<tr><td colspan="6"><div class="empty-state"><h3>Belum ada riwayat</h3></div></td></tr>'}</tbody></table>
      </div>
    </div>`;
}

export function outletNotesField(catalog, current = '') {
  const mode = catalog?.notesMode === 'dropdown' ? 'dropdown' : 'freetext';
  const options = catalog?.notesOptions || [];
  const value = String(current || '');
  if (mode === 'dropdown') {
    const rows = value && !options.includes(value) ? [value, ...options] : options;
    return `<div class="form-group">
      <label class="label">Notes</label>
      <input type="hidden" name="notesKind" value="dropdown">
      <select class="select" name="notesChoice" id="outletNotesSelect">
        <option value="">Select notes</option>
        ${rows.map(v => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
    </div>`;
  }
  return `<div class="form-group">
    <label class="label">Notes</label>
    <input type="hidden" name="notesKind" value="freetext">
    <textarea class="textarea" name="notes" id="outletNotesText" placeholder="Optional notes">${esc(value)}</textarea>
  </div>`;
}

export function attendanceCheckinCard() {
  const id = empId();
  const today = todayISO();
  const attendance = getAttendance().filter(a => String(a.employeeId) === String(id) && String(a.date || a.workDate) === today);
  const policy = getAttendancePolicy();
  const emp = getEmployee(id);
  const projects = getEmployeeAttendanceProjects(id);
  const projectMap = Object.fromEntries(projects.map(project => [String(project.id),project]));
  const recordedProjectIds = new Set(attendance.map(row => String(row.projectId || '')));
  const manualProjects = projects.filter(project =>
    getProjectAttendancePolicy(project.id).sourceMode === 'manual'
    && !recordedProjectIds.has(String(project.id))
  );
  const visitProjects = projects.filter(project => getProjectAttendancePolicy(project.id).sourceMode === 'visit');
  const firstStore = getVisitsOnDate(today, id)[0];
  const store = firstStore ? getOutlets().find(o => o.id === firstStore.outletId) : null;
  const assigned = emp?.attendancePointId
    ? getAttendancePoints().find(p => p.id === emp.attendancePointId)
    : null;

  let options = '';
  let hint = '';
  if (policy.mode === 'office') {
    const name = policy.officeName || 'Office';
    options = `<option value="office|office|${esc(name)}">${esc(name)} — Office</option>`;
    hint = `Check-in manual di kantor (radius referensi ${policy.radiusM} m).`;
  } else if (policy.mode === 'outlet') {
    const outlets = getOutlets().filter(o => o.status !== 'inactive');
    options = outlets.map(o => `<option value="${o.id}|store|${esc(o.name)}">${esc(formatOutletLabel(o))}</option>`).join('');
    if (store) options = `<option value="${store.id}|store|${esc(store.name)}">${esc(store.name)} — outlet kunjungan pertama hari ini</option>` + options;
    hint = `Check-in manual di outlet (radius referensi ${policy.radiusM} m).`;
  } else {
    if (assigned) options = `<option value="${assigned.id}|${assigned.type}|${esc(assigned.name)}">${esc(assigned.name)}</option>`;
    hint = assigned
      ? `Titik absensi: ${assigned.name} (radius referensi ${policy.radiusM} m).`
      : 'Belum ada titik absensi yang ditetapkan. Hubungi Manager.';
  }

  const recordedHtml = attendance.length
    ? `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">${attendance.map(att => {
        const project = projectMap[String(att.projectId)] || {};
        const source = attendanceSourceKey(att) === 'visit' ? 'Otomatis dari Visit' : attendanceSourceLabel(att);
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:#ecfdf5">
          ${appIcon('attendance')}
          <div style="flex:1">
            <strong>${esc(project.code || project.name || att.projectId || 'Project')}</strong>
            <div class="am-muted">Check-in ${esc(att.checkInTime || att.checkInAt || '-')} · Check-out ${esc(att.checkOutTime || att.checkOutAt || 'belum')} · ${esc(source)}</div>
          </div>
          ${attendanceSourceKey(att) !== 'visit' && !att.checkOutAt && !att.checkOutTime
            ? `<button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FS.checkOutAttendance('${att.id}')">Check out</button>`
            : statusBadge(att.status)}
        </div>`;
      }).join('')}</div>`
    : '';

  const visitHint = visitProjects.length
    ? `<div class="am-muted" style="margin:0 0 10px">Absensi otomatis dari check-in Visit: ${visitProjects.map(project => esc(project.code || project.name || project.id)).join(', ')}.</div>`
    : '';

  if (!projects.length) {
    return `<div class="empty-state"><h3>Belum ada project aktif</h3><p>Attendance mengikuti assignment project aktif.</p></div>`;
  }

  return `<div>
    ${recordedHtml}
    ${visitHint}
    ${manualProjects.length && options ? `
      <p class="am-muted" style="margin:0 0 10px">${esc(hint)}</p>
      <form data-pqt-onsubmit="FS.checkInAttendance(event)">
        <div class="form-group">
          <label class="label">Project</label>
          <select class="select" name="projectId" required>
            <option value="">Pilih project</option>
            ${manualProjects.map(project => `<option value="${project.id}">${esc(project.code || project.id)} — ${esc(project.name || '')}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="label">Lokasi check-in</label>
          <select class="select" name="point" required>
            <option value="">Pilih lokasi</option>
            ${options}
          </select>
        </div>
        <button class="btn btn-primary" type="submit">Check in</button>
      </form>`
      : (!manualProjects.length && !visitProjects.length ? '<div class="am-muted">Attendance hari ini sudah tercatat untuk seluruh project manual.</div>' : '')}
  </div>`;
}

function locationTypeLabel(type) {
  return { office: 'Office', store: 'Outlet', meeting: 'Meeting point', point: 'Point' }[type] || type || '—';
}

export function renderVisitDetailHtml(visitId) {
  const v = getVisits().find(x => x.id === visitId);
  if (!v) return '<p>Kunjungan tidak ditemukan.</p>';
  const o = getOutlets().find(x => x.id === v.outletId);
  const stocks = getStocks().filter(s => s.outletId === v.outletId);
  const prices = getPriceObservations().filter(p => String(p.visitId || '') === String(visitId));
  const intel = getCompetitorIntel().filter(i => String(i.visitId || '') === String(visitId));
  const photos = getFieldPhotos().filter(p => String(p.visitId || '') === String(visitId));
  const products = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const checkInEvidence = visitLocationEvidence(v, o);
  const checkInFreshness = locationFreshness(checkInEvidence, v, Date.now(), todayISO());
  const checkOutLat = Number(v.checkOutLat);
  const checkOutLng = Number(v.checkOutLng);
  const checkOutValid = Number.isFinite(checkOutLat) && Number.isFinite(checkOutLng);
  const checkOutAccuracy = Number(v.checkOutAccuracyM);
  const checkOutEvidence = checkOutValid ? {
    lat:checkOutLat, lng:checkOutLng, source:'device_gps', actual:true,
    accuracyM:Number.isFinite(checkOutAccuracy) ? Math.max(0, checkOutAccuracy) : null,
    capturedAt:v.checkOutCapturedAt || v.completedAt || null,
  } : null;
  return `
    <div class="detail-grid" style="margin-bottom:14px">
      <div class="detail-label">Toko</div><div class="detail-value">${esc(o?.name || '-')}</div>
      <div class="detail-label">Tanggal</div><div class="detail-value">${formatDate(visitDay(v))}</div>
      <div class="detail-label">Check in</div><div class="detail-value">${v.checkInTime || '—'}</div>
      <div class="detail-label">Check out</div><div class="detail-value">${v.checkOutTime || '—'}</div>
      <div class="detail-label">Durasi</div><div class="detail-value">${formatDuration(v.checkInTime, v.checkOutTime)}</div>
      <div class="detail-label">Status</div><div class="detail-value">${statusBadge(v.status)}</div>
      <div class="detail-label">Bukti GPS Check In</div><div class="detail-value">${checkInEvidence ? `${esc(locationSourceLabel(checkInEvidence))} · ${checkInEvidence.lat.toFixed(6)}, ${checkInEvidence.lng.toFixed(6)}${checkInEvidence.accuracyM != null ? ` · akurasi ±${Math.round(checkInEvidence.accuracyM)} m` : ''} · ${esc(checkInFreshness.label)}` : '—'}</div>
      <div class="detail-label">Bukti GPS Check Out</div><div class="detail-value">${checkOutEvidence ? `GPS perangkat · ${checkOutEvidence.lat.toFixed(6)}, ${checkOutEvidence.lng.toFixed(6)}${checkOutEvidence.accuracyM != null ? ` · akurasi ±${Math.round(checkOutEvidence.accuracyM)} m` : ''}${checkOutEvidence.capturedAt ? ` · ${esc(checkOutEvidence.capturedAt)}` : ''}` : '—'}</div>
      <div class="detail-label">Catatan</div><div class="detail-value full">${esc(v.notes || '—')}</div>
    </div>
    <h4>Stok outlet saat ini</h4>
    <p class="am-muted">Referensi kondisi outlet saat ini — bukan snapshot stok pada kunjungan ini.</p>
    ${stocks.length ? `<ul>${stocks.map(s => `<li>${esc(products[s.productId]?.name || s.productId)}: <b>${s.quantity}</b></li>`).join('')}</ul>` : '<p class="am-muted">Belum ada stok outlet.</p>'}
    <h4>Harga & diskon kunjungan</h4>
    ${prices.length ? `<ul>${prices.map(p => `<li>${esc(products[p.productId]?.name || p.productId)}: ${formatCurrency(p.observedPrice || p.price || 0)}${p.discountPercent ? ' · diskon ' + p.discountPercent + '%' : ''}</li>`).join('')}</ul>` : '<p class="am-muted">Belum ada observasi harga.</p>'}
    <h4>Intel kompetitor kunjungan</h4>
    ${intel.length ? `<ul>${intel.map(i => `<li>${esc(products[i.productId]?.name || 'Produk')} vs kompetitor · shelf ${i.shelfShare || 0}%</li>`).join('')}</ul>` : '<p class="am-muted">Belum ada intel.</p>'}
    <h4>Foto kunjungan</h4>
    ${photos.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${photos.map(p => {
      const src = safePhotoUrl(p.dataUrl || p.photoUrl);
      return src ? `<img src="${src}" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px">` : `<span class="am-muted">${photoTypeLabel(p.photoType || p.type)}</span>`;
    }).join('')}</div>` : '<p class="am-muted">Belum ada foto.</p>'}
    <div class="modal-footer"><button class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Tutup</button></div>
  `;
}

export function photoFilterBar(managerView) {
  const f = window.FT.state._photoFilters || {};
  const outlets = getOutlets();
  return `<div class="filter-row" style="flex-wrap:wrap;gap:8px">
    <input class="input search-input" placeholder="Cari caption, toko, jenis..." value="${esc(f.q || '')}" data-pqt-oninput="FS.setPhotoFilter('q',this.value)">
    <input class="input" type="date" value="${esc(f.date || '')}" data-pqt-onchange="FS.setPhotoFilter('date',this.value)" title="Tanggal">
    <select class="select" style="width:auto;min-width:160px" data-pqt-onchange="FS.setPhotoFilter('outletId',this.value)">
      <option value="">Semua toko</option>
      ${outlets.map(o => `<option value="${o.id}" ${f.outletId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
    </select>
    <select class="select" style="width:auto;min-width:140px" data-pqt-onchange="FS.setPhotoFilter('type',this.value)">
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

export function productPickerRows(kind, outletId, projectId = '') {
  const products = getProducts().filter(p =>
    p.status === 'active'
    && (!projectId || (p.projectIds || []).map(String).includes(String(projectId)))
  );
  const existing = kind === 'stock' ? getStocksByOutlet(outletId).filter(s => !projectId || String(s.projectId || '') === String(projectId)) : [];
  return `<div id="${kind}Rows" data-project-id="${esc(projectId)}">
    ${productRow(kind, products, existing, 0)}
  </div>
  <button type="button" class="btn btn-secondary btn-sm" style="margin:8px 0" data-pqt-onclick="FS.addProductRow('${kind}','${outletId}')">${appIcon('plus')} Tambah produk lain</button>`;
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
    ${kind === 'stock' ? `<div class="form-row"><div class="form-group"><label class="label">Closing stock</label><input class="input" type="number" name="quantity" min="0" step="1" required></div>
      <div class="form-group"><label class="label">Stock masuk</label><input class="input" type="number" name="stockInQty" value="0" min="0" step="1" required></div></div>
      <div class="form-group"><label class="label">Minimum stock</label><input class="input" type="number" name="minStock" value="5" min="0" step="1" required></div>` : ''}
    ${kind === 'price' ? `<div class="form-group"><label class="label">Harga teramati</label><input class="input" type="number" name="observedPrice" min="0" required></div>
      <div class="form-row"><div class="form-group"><label class="label">Diskon %</label><input class="input" type="number" name="discountPercent" value="0" min="0"></div>
      <div class="form-group"><label class="label">Diskon Rp</label><input class="input" type="number" name="discountAmount" value="0" min="0"></div></div>` : ''}
  </div>`;
}

const attendanceCheckoutInFlight = new Set();

window.FS = {
  async checkInAttendance(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const raw = fd.get('point') || '';
    const projectId = String(fd.get('projectId') || '');
    const [locationId, locationType, ...nameParts] = String(raw).split('|');
    const locationName = nameParts.join('|');
    const id = empId();
    const submit = form.querySelector('button[type="submit"]');
    if (!id || !projectId) { window.showToast?.('Project attendance tidak valid.', 'error'); return; }
    if (getProjectAttendancePolicy(projectId).sourceMode !== 'manual') {
      window.showToast?.('Attendance project ini dihitung otomatis dari Visit.', 'error');
      return;
    }
    const timeZone = getOrganization()?.timezone || 'Asia/Jakarta';
    const checkInTime = currentTenantTimeHHMM(timeZone);
    let cloudCommitted = false;
    try {
      if (submit) { submit.disabled = true; submit.textContent = 'Menyimpan…'; }
      createAttendance({
        employeeId:id,
        projectId,
        date:todayISO(),
        workDate:todayISO(),
        checkInAt:checkInTime,
        checkInTime,
        checkInLocation:locationName,
        locationType,
        locationId,
      });
      if (submit) submit.textContent = 'Sinkronisasi…';
      await waitForOperationalSync();
      cloudCommitted = true;
      await refreshOperationalData(getDB(), getActor());
      window.showToast?.('Absensi tercatat.', 'success');
      location.hash = '#/myday';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      if (!cloudCommitted) restoreOperationalBaseline(getDB());
      window.showToast?.(attendanceLeaveFriendlyErrorMessage(err,'Absensi gagal disimpan.'), 'error');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } finally {
      if (submit?.isConnected) { submit.disabled = false; submit.textContent = 'Check in'; }
    }
  },
  async checkOutAttendance(id) {
    const key = String(id || '');
    if (!key || attendanceCheckoutInFlight.has(key)) return;
    const att = getAttendance().find(row => String(row.id) === key);
    if (!att) { window.showToast?.('Data attendance tidak ditemukan.', 'error'); return; }
    if (attendanceSourceKey(att) === 'visit') { window.showToast?.('Check-out attendance ini mengikuti Visit.', 'error'); return; }
    attendanceCheckoutInFlight.add(key);
    const timeZone = getOrganization()?.timezone || 'Asia/Jakarta';
    const checkOutTime = currentTenantTimeHHMM(timeZone);
    let cloudCommitted = false;
    try {
      checkOutAttendance(id, checkOutTime);
      await waitForOperationalSync();
      cloudCommitted = true;
      await refreshOperationalData(getDB(), getActor());
      window.showToast?.('Check-out attendance tercatat.', 'success');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      if (!cloudCommitted) restoreOperationalBaseline(getDB());
      const message = attendanceLeaveFriendlyErrorMessage(err,'Check-out attendance gagal disimpan.');
      window.showToast?.(message, 'error');
      await refreshOperationalData(getDB(), getActor()).catch(() => null);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } finally {
      attendanceCheckoutInFlight.delete(key);
    }
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
  addProductRow(kind, outletId, projectId = '') {
    const wrap = document.getElementById(kind + 'Rows');
    if (!wrap) return;
    const scopedProjectId = String(projectId || wrap.dataset.projectId || '');
    const products = getProducts().filter(p =>
      p.status === 'active'
      && (!scopedProjectId || (p.projectIds || []).map(String).includes(scopedProjectId))
    );
    const existing = kind === 'stock'
      ? getStocksByOutlet(outletId).filter(s => !scopedProjectId || String(s.projectId || '') === scopedProjectId)
      : [];
    wrap.insertAdjacentHTML('beforeend', productRow(kind, products, existing, wrap.children.length));
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

function proposalStatusLabel(p) {
  if (p.status === 'approved') return 'Disetujui (toko aktif)';
  if (p.status === 'rejected') return 'Ditolak';
  const bits = [];
  bits.push(p.supervisorStatus === 'approved' ? 'SPV ✓' : p.supervisorStatus === 'rejected' ? 'SPV ✗' : 'SPV menunggu');
  bits.push(p.managerStatus === 'approved' ? 'Mgr ✓' : p.managerStatus === 'rejected' ? 'Mgr ✗' : 'Mgr menunggu');
  return bits.join(' · ');
}

export function renderOutletProposalForm() {
  const db = getDB();
  const projects = (db.projects || []).filter(p => p.status === 'active');
  const manualProjectIds = new Set(projects.filter(p => p.outletApprovalMode === 'manual').map(p => p.id));
  const mine = getOutletProposals();
  const role = window.FT?.state?.account?.role;
  const emp = getEmployees().find(e => e.id === empId());
  const outletProjects = role === 'employee' ? outletProjectsForEmployee(empId()) : [];
  const selectedProject = outletProjects[0] || null;
  const canAdd = role !== 'employee' || outletProjects.length > 0;
  const catalog = storeCatalogForEmployee(empId(), selectedProject?.id);
  const autoApproved = catalog.approvalMode !== 'manual';
  const reviewRows = role === 'employee' ? mine : getOutletProposals().filter(p => manualProjectIds.has(p.projectId));
  const opt = (rows) => (rows || []).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  return `
    ${role === 'employee' && canAdd ? `
    <div class="card">
      <div class="card-title" id="outletFormTitle">${autoApproved ? 'Tambah Outlet' : 'Ajukan toko baru'}</div>
      <div class="card-subtitle" id="outletApprovalHint">${autoApproved ? 'Outlet akan aktif otomatis setelah validasi.' : 'Project ini menggunakan Manual Approval.'} Ambil lokasi dari perangkat.</div>
      <form data-pqt-onsubmit="FS.submitOutlet(event)">
        ${outletProjects.length > 1 ? `<div class="form-group"><label class="label">Project</label><select class="select" name="projectId" id="outletProjectSelect" data-pqt-onchange="FS.changeOutletProject(this.value)" required>${outletProjects.map(project => `<option value="${esc(project.id)}">${esc(project.code || project.name)} — ${esc(project.name || '')}</option>`).join('')}</select><div class="am-muted">Pilih project tujuan outlet.</div></div>` : `<input type="hidden" name="projectId" value="${esc(selectedProject?.id || '')}">`}
        <div class="form-group"><label class="label">Nama toko</label><input class="input" name="name" required></div>
        <div class="form-group">
          <label class="label">Lokasi toko</label>
          <button type="button" class="btn btn-primary" id="outletLocBtn" data-pqt-onclick="FS.captureOutletLocation()" style="width:100%">Ambil lokasi / buka peta</button>
          <div class="am-muted" id="outletMapHint" style="margin-top:8px">Satu tombol: GPS perangkat, isi alamat otomatis, lalu buka aplikasi peta untuk konfirmasi.</div>
          <a id="outletOpenMaps" class="btn btn-secondary btn-sm" href="#" target="_blank" rel="noreferrer" style="display:none;margin-top:8px">Buka aplikasi peta</a>
          <input type="hidden" name="lat" id="outletLat" required>
          <input type="hidden" name="lng" id="outletLng" required>
          <input type="hidden" name="mapLabel" id="outletMapLabel">
        </div>
        <div class="form-group"><label class="label">Alamat (otomatis dari lokasi, bisa diedit)</label><textarea class="textarea" name="address" id="outletAddress" required placeholder="Terisi otomatis setelah ambil lokasi"></textarea></div>
        <div class="form-row">
          <div class="form-group"><label class="label">Segment</label>
            <select class="select" name="channel">${opt(catalog.segments)}</select>
          </div>
          <div class="form-group"><label class="label">Akun (ownership store)</label>
            <select class="select" name="ownership">${opt(catalog.ownerships)}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="label">Type (tipe store)</label>
            <select class="select" name="type">${opt(catalog.types)}</select>
          </div>
          <div class="form-group"><label class="label">Area / Kota</label><input class="input" name="area" id="outletArea" value="${esc(emp?.area || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone"></div>
          <div class="form-group"><label class="label">Pemilik / PIC toko</label><input class="input" name="owner"></div>
        </div>
        ${outletNotesField(catalog)}
        <button class="btn btn-primary" id="outletSubmitBtn" type="submit">${autoApproved ? 'Tambah Outlet' : 'Submit for Approval'}</button>
      </form>
    </div>` : ''}
    <div class="card" style="margin-top:16px">
      <div class="card-title">${role === 'employee' ? 'Outlet baru saya' : 'Antrian Manual Approval'}</div>
      ${role !== 'employee' ? '<div class="card-subtitle">Hanya project yang secara eksplisit menggunakan Manual Approval yang tampil di sini.</div>' : ''}
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Toko</th><th>Area</th><th>Diajukan</th><th>Status</th>${role !== 'employee' ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${reviewRows.length ? reviewRows.map(p => `
              <tr>
                <td><strong>${esc(p.outletNumber || '')} ${esc(p.name)}</strong><div class="am-muted">${esc(p.address || '')}</div></td>
                <td>${esc(p.area || p.city || '—')}</td>
                <td>${esc(p.submittedByName || '')}<div class="am-muted">${formatDateShort((p.submittedAt || '').slice(0,10))}</div></td>
                <td>${esc(proposalStatusLabel(p))}</td>
                ${role !== 'employee' && p.status === 'pending' ? `<td>
                  <input type="hidden" id="proj-${p.id}" value="${esc(p.projectId || '')}">
                  <div class="am-muted" style="margin-bottom:6px">${esc(projects.find(pr => pr.id === p.projectId)?.code || p.projectId || '')}</div>
                  <button class="btn btn-primary btn-sm" data-pqt-onclick="FS.reviewOutlet('${p.id}','approved')">Setujui</button>
                  <button class="btn btn-danger btn-sm" data-pqt-onclick="FS.reviewOutlet('${p.id}','rejected')">Tolak</button>
                </td>` : (role !== 'employee' ? '<td></td>' : '')}
              </tr>`).join('') : '<tr><td colspan="5"><div class="empty-state"><h3>Belum ada pengajuan</h3></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

window.FS.changeOutletProject = function(projectId) {
  const catalog = storeCatalogForEmployee(empId(), projectId);
  const manual = catalog.approvalMode === 'manual';
  const title = document.getElementById('outletFormTitle');
  const hint = document.getElementById('outletApprovalHint');
  const submit = document.getElementById('outletSubmitBtn');
  if (title) title.textContent = manual ? 'Ajukan toko baru' : 'Tambah Outlet';
  if (hint) hint.textContent = manual
    ? 'Project ini menggunakan Manual Approval. Ambil lokasi dari perangkat.'
    : 'Outlet akan aktif otomatis setelah validasi. Ambil lokasi dari perangkat.';
  if (submit) submit.textContent = manual ? 'Submit for Approval' : 'Tambah Outlet';
};

window.FS.submitOutlet = async function(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  let cloudCommitted = false;
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.lat || !data.lng) throw new Error('Ambil lokasi toko dulu.');
    if (data.notesKind === 'dropdown') data.notes = data.notesChoice || '';
    delete data.notesChoice;
    const catalog = storeCatalogForEmployee(empId(), data.projectId);
    if (submit) { submit.disabled = true; submit.textContent = 'Menyimpan…'; }
    createOutletProposal(data);
    if (submit) submit.textContent = 'Sinkronisasi…';
    await waitForOperationalSync();
    cloudCommitted = true;
    await refreshOperationalData(getDB(), getActor()).catch(() => null);
    window.showToast?.(
      catalog.approvalMode === 'manual'
        ? 'Pengajuan outlet terkirim untuk approval.'
        : 'Outlet berhasil ditambahkan dan aktif.',
      'success'
    );
    form.reset();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (err) {
    if (!cloudCommitted) restoreOperationalBaseline(getDB());
    window.showToast?.(err.message || err, 'error');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } finally {
    if (submit?.isConnected) {
      submit.disabled = false;
      const projectId = new FormData(form).get('projectId');
      submit.textContent = storeCatalogForEmployee(empId(), projectId).approvalMode === 'manual' ? 'Submit for Approval' : 'Tambah Outlet';
    }
  }
};

window.FS.reviewOutlet = async function(id, decision) {
  let cloudCommitted = false;
  try {
    const projectId = document.getElementById('proj-' + id)?.value || null;
    const row = reviewOutletProposal(id, decision, '', projectId);
    await waitForOperationalSync();
    cloudCommitted = true;
    await refreshOperationalData(getDB(), getActor()).catch(() => null);
    window.showToast?.(row.status === 'approved' ? 'Outlet disetujui dan aktif.' : decision === 'approved' ? 'Persetujuan Anda tercatat.' : 'Pengajuan ditolak.', 'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (err) {
    if (!cloudCommitted) restoreOperationalBaseline(getDB());
    window.showToast?.(err.message || err, 'error');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
};



async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

function applyGeocode(data, lat, lng) {
  const addr = data?.address || {};
  document.getElementById('outletLat').value = lat;
  document.getElementById('outletLng').value = lng;
  document.getElementById('outletMapLabel').value = data?.display_name || '';
  const addressEl = document.getElementById('outletAddress');
  if (addressEl && (!addressEl.value || addressEl.dataset.fromMap === '1')) {
    addressEl.value = data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    addressEl.dataset.fromMap = '1';
  }
  const areaEl = document.getElementById('outletArea');
  if (areaEl && (!areaEl.value || areaEl.dataset.fromMap === '1')) {
    areaEl.value = addr.city || addr.town || addr.county || addr.state || '';
    areaEl.dataset.fromMap = '1';
  }
  const hint = document.getElementById('outletMapHint');
  if (hint) hint.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} · ${data?.display_name || 'Titik ditandai'}`;
}

function mapsAppUrl(lat, lng, label = 'Toko baru') {
  const q = encodeURIComponent(label);
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return `https://maps.apple.com/?ll=${lat},${lng}&q=${q}`;
  if (/Android/i.test(ua)) return `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function showMapsLink(lat, lng) {
  const a = document.getElementById('outletOpenMaps');
  if (!a) return;
  a.href = mapsAppUrl(lat, lng);
  a.style.display = 'inline-flex';
}

let _outletMap = null;
let _outletMarker = null;

window.FS.initOutletMap = function() {
  const el = document.getElementById('outletPickMap');
  if (!el || typeof L === 'undefined') return;
  if (_outletMap) {
    _outletMap.remove();
    _outletMap = null;
    _outletMarker = null;
  }
  const currentLat = Number(document.getElementById('outletLat')?.value);
  const currentLng = Number(document.getElementById('outletLng')?.value);
  const hasCurrent = Number.isFinite(currentLat) && Number.isFinite(currentLng)
    && currentLat >= -90 && currentLat <= 90 && currentLng >= -180 && currentLng <= 180;
  const start = hasCurrent ? [currentLat, currentLng] : [-6.2, 106.82];
  _outletMap = L.map(el, { zoomControl: true }).setView(start, hasCurrent ? 16 : 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(_outletMap);
  if (hasCurrent) {
    _outletMarker = L.marker(start).addTo(_outletMap);
    showMapsLink(currentLat, currentLng);
    const hint = document.getElementById('outletMapHint');
    if (hint) hint.textContent = `${currentLat.toFixed(6)}, ${currentLng.toFixed(6)} · Lokasi outlet saat ini`;
  }
  _outletMap.on('click', async ev => {
    const { lat, lng } = ev.latlng;
    if (_outletMarker) _outletMarker.setLatLng([lat, lng]);
    else _outletMarker = L.marker([lat, lng]).addTo(_outletMap);
    try {
      const geo = await reverseGeocode(lat, lng);
      applyGeocode(geo, lat, lng);
    } catch {
      applyGeocode(null, lat, lng);
    }
    showMapsLink(lat, lng);
  });
  setTimeout(() => _outletMap?.invalidateSize(), 220);
};

window.FS.searchOutletMap = async function() {
  const q = document.getElementById('outletMapSearch')?.value?.trim();
  if (!q) return;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const rows = await res.json();
    const hit = rows[0];
    if (!hit) { window.showToast?.('Alamat tidak ditemukan', 'error'); return; }
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (_outletMap) {
      _outletMap.setView([lat, lng], 16);
      if (_outletMarker) _outletMarker.setLatLng([lat, lng]);
      else _outletMarker = L.marker([lat, lng]).addTo(_outletMap);
    }
    applyGeocode(hit, lat, lng);
    showMapsLink(lat, lng);
  } catch {
    window.showToast?.('Gagal mencari lokasi', 'error');
  }
};

window.FS.toggleNotesKind = function() {};

window.FS.captureOutletLocation = function() {
  const hint = document.getElementById('outletMapHint');
  const btn = document.getElementById('outletLocBtn');
  if (!navigator.geolocation) {
    window.showToast?.('GPS tidak tersedia di perangkat ini', 'error');
    return;
  }
  if (hint) hint.textContent = 'Mengambil lokasi GPS...';
  if (btn) btn.disabled = true;
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    try {
      const geo = await reverseGeocode(lat, lng);
      applyGeocode(geo, lat, lng);
    } catch {
      applyGeocode(null, lat, lng);
    }
    showMapsLink(lat, lng);
    if (btn) btn.disabled = false;
    window.showToast?.('Lokasi diambil. Alamat terisi otomatis.', 'success');
    const open = document.getElementById('outletOpenMaps');
    if (open && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) setTimeout(() => open.click(), 280);
  }, err => {
    if (btn) btn.disabled = false;
    if (hint) hint.textContent = 'Gagal mengambil GPS. Izinkan akses lokasi di browser.';
    window.showToast?.(err.message || 'Izin lokasi ditolak', 'error');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
};

export { locationTypeLabel };
