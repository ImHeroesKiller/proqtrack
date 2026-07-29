import { getEmployees, getAccounts } from './lib/db.js';

const ROUTES = new Set(['#/employees', '#/users']);
const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 4_000;
const state = {
  source: 'localStorage', employees: [], accounts: [], error: null,
  loadedAt: 0, loadPromise: null, renderToken: 0,
};

const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' })[c]);
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map(v => v[0]).join('').toUpperCase();
const badge = (label, tone='gray') => `<span class="p15-badge p15-${tone}">${esc(label || '-')}</span>`;
const roleTone = role => role === 'super_admin' ? 'purple' : role === 'manager' ? 'orange' : role === 'supervisor' ? 'blue' : role === 'employee' ? 'green' : 'gray';
const statusTone = status => status === 'active' ? 'green' : status === 'invited' ? 'blue' : status === 'inactive' ? 'gray' : status === 'suspended' ? 'red' : 'orange';

function installStyles() {
  if (document.getElementById('phase1FrontendReadStyles')) return;
  const style = document.createElement('style');
  style.id = 'phase1FrontendReadStyles';
  style.textContent = `.p15-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.p15-search{flex:1;min-width:220px}.p15-source{font-size:11px;font-weight:700;padding:6px 10px;border-radius:999px;background:#f1f5f9;color:#475569}.p15-source.api{background:#ecfdf5;color:#047857}.p15-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.p15-metric{background:white;border:1px solid var(--gray-200);border-radius:12px;padding:14px}.p15-metric strong{display:block;font-size:22px;color:var(--gray-900)}.p15-metric span{font-size:11px;color:var(--gray-500)}.p15-row-title{display:flex;align-items:center;gap:10px}.p15-avatar{width:34px;height:34px;border-radius:10px;background:var(--brand-light);color:var(--brand-dark);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex:none}.p15-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;border:1px solid transparent}.p15-green{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.p15-blue{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.p15-purple{background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe}.p15-orange{background:#fff7ed;color:#c2410c;border-color:#fed7aa}.p15-red{background:#fef2f2;color:#b91c1c;border-color:#fecaca}.p15-gray{background:#f1f5f9;color:#475569;border-color:#e2e8f0}.p15-warning{padding:12px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;margin-bottom:14px}.p15-empty{padding:36px;text-align:center;color:var(--gray-400)}.p15-muted{font-size:11px;color:var(--gray-400)}@media(max-width:800px){.p15-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.p15-hide-mobile{display:none}}`;
  document.head.appendChild(style);
}

async function apiJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, { headers:{accept:'application/json'}, signal:controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP_${response.status}`);
    }
    return response.json();
  } finally { clearTimeout(timer); }
}

function normalizeLocalEmployees() {
  return getEmployees().map(e => ({ id:e.id, employee_number:e.employeeNumber||e.nik||e.id, full_name:e.name||e.fullName||e.id, email:e.email||null, phone:e.phone||null, worker_type:e.workerType||e.role||'employee', status:e.status||'active', position_name:e.jobTitle||e.jobRole||e.role||'Employee', organization_unit_name:e.area||'-', manager_name:null }));
}
function normalizeLocalAccounts() {
  const employeeMap = new Map(getEmployees().map(e => [e.id,e]));
  return getAccounts().map(a => ({ id:a.id, email:a.email, employee_id:a.employeeId||null, employee_name:employeeMap.get(a.employeeId)?.name||null, status:a.status||'active', role_code:a.role||'employee', role_name:String(a.role||'employee').replaceAll('_',' '), scope_type:a.employeeId?'self':'global' }));
}

async function loadReadModel(force=false) {
  if (!force && state.loadedAt && Date.now()-state.loadedAt < CACHE_TTL_MS) return;
  if (state.loadPromise) return state.loadPromise;
  state.loadPromise = (async () => {
    state.error = null;
    try {
      const [employees, accounts] = await Promise.all([
        apiJson('/api/identity/employees?limit=200'), apiJson('/api/identity/accounts?limit=200'),
      ]);
      state.employees = employees.employees || [];
      state.accounts = accounts.accounts || [];
      state.source = 'D1 API';
    } catch (error) {
      state.employees = normalizeLocalEmployees();
      state.accounts = normalizeLocalAccounts();
      state.source = 'localStorage fallback';
      state.error = error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : String(error?.message || error);
    } finally {
      state.loadedAt = Date.now();
      state.loadPromise = null;
    }
  })();
  return state.loadPromise;
}

function addUserNavigation() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[href="#/users"]')) return;
  const employeeLink = nav.querySelector('[href="#/employees"]');
  if (!employeeLink) return;
  const link = document.createElement('a');
  link.href = '#/users';
  link.className = `nav-item ${location.hash === '#/users' ? 'active' : ''}`;
  link.innerHTML = '<span class="nav-icon">◫</span><span>User Management</span>';
  employeeLink.insertAdjacentElement('afterend', link);
}

function updateHeader(title, subtitle) {
  const titleEl = document.querySelector('.topbar-title');
  const subtitleEl = document.querySelector('.topbar-subtitle');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) { subtitleEl.textContent = subtitle; subtitleEl.style.display = 'block'; }
}

function employeeRows(rows) {
  if (!rows.length) return '<tr><td colspan="5"><div class="p15-empty">Tidak ada karyawan yang cocok.</div></td></tr>';
  return rows.map(e => `<tr><td><div class="p15-row-title"><div class="p15-avatar">${esc(initials(e.full_name))}</div><div><div style="font-weight:700;color:var(--gray-800)">${esc(e.full_name)}</div><div class="p15-muted">${esc(e.employee_number)} · ${esc(e.email||e.phone||'-')}</div></div></div></td><td>${esc(e.position_name||e.worker_type||'-')}</td><td>${esc(e.organization_unit_name||'-')}</td><td>${badge(e.status,statusTone(e.status))}</td><td class="p15-hide-mobile">${esc(e.manager_name||'-')}</td></tr>`).join('');
}
function accountRows(rows) {
  if (!rows.length) return '<tr><td colspan="5"><div class="p15-empty">Tidak ada akun yang cocok.</div></td></tr>';
  return rows.map(a => `<tr><td><div style="font-weight:700;color:var(--gray-800)">${esc(a.email)}</div><div class="p15-muted">${esc(a.id)}</div></td><td>${esc(a.employee_name||a.employee_id||'Belum terhubung')}</td><td>${badge(a.role_name||a.role_code,roleTone(a.role_code))}</td><td>${esc(a.scope_type||'-')}</td><td>${badge(a.status,statusTone(a.status))}</td></tr>`).join('');
}

function employeePage() {
  const active = state.employees.filter(e => e.status === 'active').length;
  const supervisors = state.employees.filter(e => /supervisor|manager|team_lead/i.test(`${e.worker_type} ${e.position_name}`)).length;
  const units = new Set(state.employees.map(e => e.organization_unit_name).filter(Boolean)).size;
  return `<div class="p15-grid"><div class="p15-metric"><strong>${state.employees.length}</strong><span>Total karyawan</span></div><div class="p15-metric"><strong>${active}</strong><span>Karyawan aktif</span></div><div class="p15-metric"><strong>${supervisors}</strong><span>Supervisor/leader</span></div><div class="p15-metric"><strong>${units}</strong><span>Unit/area</span></div></div><div class="card"><div class="p15-toolbar"><input id="p15EmployeeSearch" class="input p15-search" placeholder="Cari nama, email, nomor karyawan, area..."><span class="p15-source ${state.source==='D1 API'?'api':''}">${esc(state.source)}</span></div>${state.error?`<div class="p15-warning">API tidak tersedia (${esc(state.error)}). Data browser digunakan tanpa write ke D1.</div>`:''}<div class="visits-table-wrapper"><table class="table"><thead><tr><th>Karyawan</th><th>Posisi</th><th>Unit</th><th>Status</th><th class="p15-hide-mobile">Atasan</th></tr></thead><tbody id="p15EmployeeRows">${employeeRows(state.employees)}</tbody></table></div></div>`;
}
function accountsPage() {
  const active = state.accounts.filter(a => a.status === 'active').length;
  const invited = state.accounts.filter(a => a.status === 'invited').length;
  const privileged = state.accounts.filter(a => ['super_admin','manager','supervisor','team_leader'].includes(a.role_code)).length;
  const invalid = state.accounts.filter(a => a.role_code === 'employee' && (!a.employee_id || a.scope_type !== 'self'));
  return `<div class="p15-grid"><div class="p15-metric"><strong>${state.accounts.length}</strong><span>Total akun</span></div><div class="p15-metric"><strong>${active}</strong><span>Aktif</span></div><div class="p15-metric"><strong>${invited}</strong><span>Menunggu aktivasi</span></div><div class="p15-metric"><strong>${privileged}</strong><span>Akses pengelola</span></div></div>${invalid.length?`<div class="p15-warning"><strong>${invalid.length} account perlu review:</strong> role Employee harus terhubung ke employee dan menggunakan scope self. ${invalid.map(a=>esc(a.email)).join(', ')}</div>`:''}<div class="card"><div class="p15-toolbar"><input id="p15AccountSearch" class="input p15-search" placeholder="Cari email, nama karyawan, role..."><span class="p15-source ${state.source==='D1 API'?'api':''}">${esc(state.source)}</span></div><div class="visits-table-wrapper"><table class="table"><thead><tr><th>Akun</th><th>Employee</th><th>Role</th><th>Scope</th><th>Status</th></tr></thead><tbody id="p15AccountRows">${accountRows(state.accounts)}</tbody></table></div></div>`;
}

function bindFilters() {
  document.getElementById('p15EmployeeSearch')?.addEventListener('input', e => {
    const q=e.target.value.trim().toLowerCase();
    const rows=state.employees.filter(x=>[x.full_name,x.employee_number,x.email,x.phone,x.position_name,x.organization_unit_name].some(v=>String(v||'').toLowerCase().includes(q)));
    const target=document.getElementById('p15EmployeeRows'); if(target) target.innerHTML=employeeRows(rows);
  });
  document.getElementById('p15AccountSearch')?.addEventListener('input', e => {
    const q=e.target.value.trim().toLowerCase();
    const rows=state.accounts.filter(x=>[x.email,x.employee_name,x.employee_id,x.role_code,x.status].some(v=>String(v||'').toLowerCase().includes(q)));
    const target=document.getElementById('p15AccountRows'); if(target) target.innerHTML=accountRows(rows);
  });
}

async function renderCurrentRoute() {
  installStyles();
  addUserNavigation();
  const route = location.hash || '#/';
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('href') === route));
  if (!ROUTES.has(route)) return;
  const content = document.querySelector('.content');
  if (!content) return;
  const token = ++state.renderToken;
  content.innerHTML = '<div class="card"><div class="p15-empty">Memuat read model identity & organization...</div></div>';
  await loadReadModel();
  if (token !== state.renderToken || (location.hash || '#/') !== route) return;
  updateHeader(route === '#/employees' ? 'Karyawan' : 'User Management', route === '#/employees' ? 'Data identity & organization read-only' : 'Akun, role, scope, dan keterhubungan employee');
  content.innerHTML = route === '#/employees' ? employeePage() : accountsPage();
  bindFilters();
}

function scheduleRender() {
  setTimeout(() => { renderCurrentRoute().catch(error => console.error('phase1_frontend_read_failed', error)); }, 0);
}

window.addEventListener('hashchange', scheduleRender);
window.addEventListener('proqtrack:db-updated', () => { state.loadedAt = 0; scheduleRender(); });
window.addEventListener('load', scheduleRender, { once:true });
queueMicrotask(scheduleRender);
