import {
  getOrganizations, getOrganization,
  setCurrentOrgId, getCurrentOrgId, getEmployees, getAccounts, getOutlets,
  getProducts, getCompetitors, getVisits, getFieldPhotos, getDB,
} from './lib/db.js';
import { esc, statusBadge } from './lib/utils.js';
import { switchCloudOrganization } from './lib/cloud-data.js';
import {
  syncCloudOrganizations, createCloudOrganization, updateCloudOrganization,
} from './lib/cloud-organizations.js';

function canManageOrgs() {
  return window.FT?.state?.account?.role === 'superadmin';
}

function counts(orgId) {
  const match = row => row.organizationId === orgId;
  const db = JSON.parse(localStorage.getItem('proqtrack_db_v6') || '{}');
  return {
    clients: (db.clients || []).filter(match).length,
    projects: (db.projects || []).filter(match).length,
    employees: (db.employees || []).filter(match).length,
    accounts: (db.accounts || []).filter(match).length,
    outlets: (db.outlets || []).filter(match).length,
    products: (db.products || []).filter(match).length,
    competitors: (db.competitors || []).filter(match).length,
    photos: (db.fieldPhotos || []).filter(match).length,
    visits: (db.visits || []).filter(match).length,
  };
}

const HUB_LINKS = [
  ['#/clients', 'Klien', 'Brand / pemilik project'],
  ['#/projects', 'Project', 'SoW, periode, assignment'],
  ['#/employees', 'Karyawan', 'Tim lapangan organisasi'],
  ['#/accounts', 'Akun', 'Login dan role'],
  ['#/outlets', 'Toko / Outlet', 'Titik kunjungan'],
  ['#/products', 'Produk', 'SKU organisasi'],
  ['#/competitors', 'Kompetitor', 'Intel merek lawan'],
  ['#/field-photos', 'Aset & Foto', 'Bukti lapangan di R2'],
  ['#/reports', 'Reporting', 'Analitik organisasi'],
  ['#/visits', 'Kunjungan', 'Aktivitas harian'],
  ['#/attendance', 'Absensi', 'Kehadiran tim'],
  ['#/stocks', 'Stok', 'Ketersediaan outlet'],
];

let organizationSyncInFlight = false;
let organizationsSynced = false;

function scheduleOrganizationRefresh() {
  if (organizationsSynced || organizationSyncInFlight || !canManageOrgs()) return;
  organizationSyncInFlight = true;
  queueMicrotask(async () => {
    try {
      await syncCloudOrganizations();
      organizationsSynced = true;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      window.showToast?.(`Sinkronisasi organisasi gagal: ${error.message || error}`, 'error');
    } finally {
      organizationSyncInFlight = false;
    }
  });
}

export function renderOrganizations() {
  if (!canManageOrgs()) return '<div class="card"><p>Hanya superadmin yang mengelola daftar organisasi.</p></div>';
  scheduleOrganizationRefresh();
  const current = getCurrentOrgId();
  const rows = getOrganizations();
  return `
    <div class="card">
      <div class="filter-row">
        <div>
          <div class="card-title" style="margin:0">Organisasi</div>
          <div class="card-subtitle" style="margin:0">Setiap organisasi punya klien, project, karyawan, dan aset sendiri</div>
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="ORG.open()">+ Organisasi baru</button>
      </div>
      <div class="org-grid">
        ${rows.map(org => {
          const c = counts(org.id);
          const active = org.id === current;
          return `<article class="org-card ${active ? 'active' : ''}">
            <div class="org-card-head">
              <div>
                <strong>${esc(org.name)}</strong>
                <div class="am-muted">${esc(org.code)} · ${esc(org.city || '-')} · ${statusBadge(org.status)}</div>
              </div>
              ${active ? '<span class="org-pill">Aktif</span>' : ''}
            </div>
            <div class="org-metrics">
              <span>${c.clients} klien</span>
              <span>${c.projects} project</span>
              <span>${c.employees} karyawan</span>
              <span>${c.outlets} toko</span>
            </div>
            <div class="am-actions">
              <a class="btn btn-primary btn-sm" href="#/organizations/${org.id}">Buka workspace</a>
              ${active ? '' : `<button class="btn btn-secondary btn-sm" onclick="ORG.switchTo('${org.id}')">Jadikan aktif</button>`}
              <button class="btn btn-secondary btn-sm" onclick="ORG.open('${org.id}')">Edit</button>
            </div>
          </article>`;
        }).join('')}
      </div>
    </div>
  `;
}

export function renderOrganizationHub(id) {
  const org = getOrganization(id);
  if (!org) return '<div class="card"><h3>Organisasi tidak ditemukan</h3></div>';
  const c = counts(org.id);
  const active = getCurrentOrgId() === org.id;
  return `
    <div class="card">
      <div class="filter-row">
        <div>
          <a href="#/organizations" class="am-muted">← Semua organisasi</a>
          <div class="card-title">${esc(org.name)}</div>
          <div class="card-subtitle">${esc(org.legalName || '')} · ${esc(org.industry || '-')} · ${esc(org.city || '-')}</div>
        </div>
        <div class="spacer"></div>
        ${active ? '<span class="org-pill">Workspace aktif</span>' : `<button class="btn btn-primary" onclick="ORG.switchTo('${org.id}')">Aktifkan workspace ini</button>`}
      </div>
      <p class="am-muted">${esc(org.notes || 'Workspace terpisah: data klien, project, dan karyawan tidak bercampur dengan organisasi lain.')}</p>
    </div>
    <div class="org-hub">
      ${HUB_LINKS.map(([href, title, sub]) => `<a class="org-tile" href="${href}" onclick="return ORG.ensureActive(event,'${org.id}','${href}')">
        <strong>${esc(title)}</strong>
        <span>${esc(sub)}</span>
      </a>`).join('')}
    </div>
    <div class="grid-4" style="margin-top:14px">
      ${[['Klien', c.clients],['Project', c.projects],['Karyawan', c.employees],['Akun', c.accounts],['Toko', c.outlets],['Produk', c.products],['Kompetitor', c.competitors],['Kunjungan', c.visits]].map(([l,v]) => `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('')}
    </div>
  `;
}

function form(existing) {
  return `<form onsubmit="ORG.save(event,'${existing?.id || ''}')">
    <div class="form-group"><label class="label">Nama organisasi</label><input class="input" name="name" value="${esc(existing?.name || '')}" required></div>
    <div class="form-group"><label class="label">Nama legal</label><input class="input" name="legalName" value="${esc(existing?.legalName || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label class="label">Kode</label><input class="input" name="code" value="${esc(existing?.code || '')}" placeholder="NFS"></div>
      <div class="form-group"><label class="label">Industri</label><input class="input" name="industry" value="${esc(existing?.industry || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Kota</label><input class="input" name="city" value="${esc(existing?.city || '')}"></div>
      <div class="form-group"><label class="label">Status</label>
        <select class="select" name="status">
          <option value="active" ${existing?.status !== 'inactive' ? 'selected' : ''}>Aktif</option>
          <option value="inactive" ${existing?.status === 'inactive' ? 'selected' : ''}>Nonaktif</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(existing?.notes || '')}</textarea></div>
    <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button><button class="btn btn-primary">Simpan</button></div>
  </form>`;
}

window.ORG = {
  async switchTo(id, targetRoute = '') {
    const target = String(id || '');
    const current = getCurrentOrgId();
    if (!target) return false;
    if (target === current) {
      if (targetRoute) location.hash = targetRoute;
      return true;
    }
    try {
      if (window.FT?.state?.account?.role !== 'superadmin') throw new Error('Akses ditolak');
      if (navigator.onLine === false || window.FT?.state?.account?.offlineSession) {
        throw new Error('Ganti organisasi memerlukan sesi cloud online.');
      }
      const { account } = await switchCloudOrganization(getDB(), target);
      setCurrentOrgId(target);
      if (account && window.FT?.state) {
        window.FT.state.account = account;
        window.FT.state.user = { name: account.name || account.email, role: 'Superadmin', email: account.email };
      }
      window.showToast?.(`Workspace ${getOrganization(target)?.name || target} aktif`, 'success');
      location.hash = targetRoute || `#/organizations/${target}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    } catch (error) {
      window.showToast?.(error.message || error, 'error');
      return false;
    }
  },
  ensureActive(event, id, href) {
    event?.preventDefault?.();
    if (getCurrentOrgId() === id) {
      location.hash = href;
      return false;
    }
    this.switchTo(id, href);
    return false;
  },
  open(id = '') {
    const existing = id ? getOrganization(id) : null;
    window.FT.closeModal?.();
    document.getElementById('modalRoot').innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()"><div class="modal animate-up"><div class="modal-header"><h3>${existing ? 'Edit organisasi' : 'Organisasi baru'}</h3><button class="modal-close" onclick="FT.closeModal()">✕</button></div><div class="modal-body">${form(existing)}</div></div></div>`;
  },
  async save(event, id) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      const org = id
        ? await updateCloudOrganization(id, data)
        : await createCloudOrganization(data);
      organizationsSynced = true;
      window.FT.closeModal?.();
      window.showToast?.(id ? 'Organisasi cloud diperbarui' : 'Organisasi cloud dibuat', 'success');

      if (!id) {
        const switched = await this.switchTo(org.id, `#/organizations/${org.id}`);
        if (!switched) {
          location.hash = '#/organizations';
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
        return;
      }

      location.hash = `#/organizations/${org.id}`;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (error) {
      window.showToast?.(error.message || error, 'error');
    }
  },
};

if (!document.getElementById('org-css')) {
  const s = document.createElement('style');
  s.id = 'org-css';
  s.textContent = `
    .org-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:12px}
    .org-card{border:1px solid var(--gray-200);border-radius:16px;padding:16px;background:#fff}
    .org-card.active{border-color:#fed7aa;box-shadow:0 0 0 3px #fff7ed}
    .org-card-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:10px}
    .org-metrics{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--gray-500);margin-bottom:12px}
    .org-pill{background:#ecfdf5;color:#047857;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}
    .org-hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    .org-tile{display:block;padding:16px;border:1px solid var(--gray-200);border-radius:14px;background:#fff;text-decoration:none;color:inherit}
    .org-tile:hover{border-color:#fed7aa;background:#fff7ed}
    .org-tile strong{display:block;margin-bottom:4px}
    .org-tile span{font-size:12px;color:var(--gray-400)}
    .org-switch{width:100%;margin:8px 10px 4px;max-width:calc(100% - 20px)}
  `;
  document.head.appendChild(s);
}

export function orgSwitcherHtml() {
  if (window.FT?.state?.account?.role !== 'superadmin') return '';
  const orgs = getOrganizations(true);
  if (orgs.length < 2) return '';
  const current = getCurrentOrgId();
  return `<select class="select org-switch" onchange="ORG.switchTo(this.value)">${orgs.map(o => `<option value="${o.id}" ${o.id === current ? 'selected' : ''}>${esc(o.code)} · ${esc(o.name)}</option>`).join('')}</select>`;
}

export {};
