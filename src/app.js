// ProQTrack — Main Application Module
// Simple hash-based router + global state + page renderers

import { getDashboardStats, getEmployees, getOutlets, getVisits, getAttendance, getVisitsByEmployee, resetDB, authenticate, createVisit, updateVisit, createEmployee, updateEmployee, createOutlet, updateOutlet, deleteEmployee, deleteOutlet, deleteVisit, getDB, getAccounts, getProducts, createProduct, updateProduct, deleteProduct, getLeaves, getLeavesByEmployee, getLeaveTypes, createLeave, updateLeave, deleteLeave, getStocks, getStocksByOutlet, getStocksByProduct, createStock, updateStock, deleteStock, getPriceObservations, getPriceObservationsByOutlet, getPriceObservationsByVisit, getPriceObservationsByEmployee, createPriceObservation, updatePriceObservation, deletePriceObservation, getVisitedOutletIds } from './lib/db.js';
import { formatDate, formatDateShort, getInitials, statusBadge, roleBadge, outletIcon, calculateDistance, formatDuration, uid, formatCurrency } from './lib/utils.js';

// Make utils available globally for inline handlers
window.FT = { formatDate, formatDateShort, getInitials, statusBadge, roleBadge, outletIcon, calculateDistance, formatDuration, uid, formatCurrency, resetDB,
  get state() { return state; }, get navigate() { return navigate; }
};

// ===== Global State =====
const state = {
  loggedIn: false,
  account: null,
  user: { name: 'Manager Demo', role: 'Manager', email: 'manager@proqtrack.id' },
  route: '#/',
  sidebarOpen: false,
  selectedEmployee: null,
  selectedMobileEmp: 'EMP001',
  mobileTab: 'home',
  livePolling: null,
};

function isManager() {
  return state.account && state.account.role === 'manager';
}

function myEmployeeId() {
  return state.account ? state.account.employeeId : null;
}

const NAV_ITEMS = [
  { section: 'Menu Utama', items: [
    { id: 'dashboard', label: 'Beranda',       icon: '▣', route: '#/' },
    { id: 'tracking',   label: 'Live Tracking', icon: '◎', route: '#/tracking' },
    { id: 'visits',     label: 'Lacak Kunjungan', icon: '☰', route: '#/visits' },
  ]},
  { section: 'Manajemen', items: [
    { id: 'employees', label: 'Karyawan', icon: '◉', route: '#/employees' },
    { id: 'outlets',   label: 'Outlet',    icon: '⬡', route: '#/outlets' },
    { id: 'products',  label: 'Produk',    icon: '▦', route: '#/products' },
    { id: 'stocks',    label: 'Stok Outlet', icon: '▥', route: '#/stocks' },
  ]},
  { section: 'SDM', items: [
    { id: 'attendance', label: 'Absensi',     icon: '✓', route: '#/attendance' },
    { id: 'leaves',     label: 'Ijin & Cuti', icon: '▤', route: '#/leaves' },
  ]},
];

const NAV_ITEMS_EMPLOYEE = [
  { section: 'Menu', items: [
    { id: 'myday',    label: 'Hari Saya',      icon: '⌂', route: '#/myday' },
    { id: 'myvisits', label: 'Kunjungan Saya', icon: '☰', route: '#/myvisits' },
  ]},
  { section: 'Data Lapangan', items: [
    { id: 'mystocks',  label: 'Stok Outlet',    icon: '▥', route: '#/mystocks' },
    { id: 'myprices',  label: 'Harga & Diskon', icon: '◈', route: '#/myprices' },
  ]},
  { section: 'SDM', items: [
    { id: 'myattendance', label: 'Absensi Saya',   icon: '✓', route: '#/myattendance' },
    { id: 'myleaves',     label: 'Ijin & Cuti',   icon: '▤', route: '#/myleaves' },
  ]},
];

// ===== Router =====
function getRoute() {
  return location.hash || '#/';
}

function navigate(route) {
  location.hash = route;
}

window.addEventListener('hashchange', () => {
  state.route = getRoute();
  state.sidebarOpen = false;
  render();
});

// ===== Toast =====
window.showToast = function(msg, type = '') {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; setTimeout(() => el.remove(), 300); }, 3000);
};

// ===== Main Render =====
function render() {
  const app = document.getElementById('app');

  if (!state.loggedIn) {
    app.innerHTML = renderLogin();
    return;
  }

  const route = state.route;
  let pageContent = '';
  let pageTitle = '';
  let pageSubtitle = '';
  const manager = isManager();

  // Employee role: only allow their own dashboard + their own visits + mobile view
  if (!manager) {
    if (route === '#/myday') {
      pageTitle = 'Hari Saya'; pageSubtitle = 'Aktivitas kunjungan Anda hari ini';
      pageContent = renderMyDay();
    } else if (route === '#/myvisits') {
      pageTitle = 'Kunjungan Saya'; pageSubtitle = 'Riwayat semua kunjungan Anda';
      pageContent = renderMyVisits();
    } else if (route === '#/mystocks') {
      pageTitle = 'Stok Outlet'; pageSubtitle = 'Stok produk di outlet yang Anda kunjungi';
      pageContent = renderMyStocks();
    } else if (route === '#/myprices') {
      pageTitle = 'Harga & Diskon'; pageSubtitle = 'Pantau harga dan diskon di outlet yang Anda kunjungi';
      pageContent = renderMyPrices();
    } else if (route === '#/myattendance') {
      pageTitle = 'Absensi Saya'; pageSubtitle = 'Riwayat kehadiran Anda';
      pageContent = renderMyAttendance();
    } else if (route === '#/myleaves') {
      pageTitle = 'Ijin & Cuti'; pageSubtitle = 'Ajukan dan pantau pengajuan ijin/cuti Anda';
      pageContent = renderMyLeaves();
    } else {
      // redirect any other route to the employee home
      if (route !== '#/myday') { location.hash = '#/myday'; return; }
      pageTitle = 'Hari Saya'; pageSubtitle = 'Aktivitas kunjungan Anda hari ini';
      pageContent = renderMyDay();
    }
  } else if (route === '#/' || route === '#') {
    pageTitle = 'Beranda'; pageSubtitle = 'Ringkasan aktivitas tim lapangan hari ini';
    pageContent = renderDashboard();
  } else if (route === '#/tracking') {
    pageTitle = 'Live Tracking'; pageSubtitle = 'Pantau lokasi tim lapangan secara real-time';
    pageContent = renderTracking();
  } else if (route === '#/visits') {
    pageTitle = 'Lacak Kunjungan'; pageSubtitle = 'Daftar kunjungan outlet oleh tim lapangan';
    pageContent = renderVisits();
  } else if (route === '#/employees') {
    pageTitle = 'Karyawan'; pageSubtitle = 'Kelola data karyawan lapangan';
    pageContent = renderEmployees();
  } else if (route === '#/outlets') {
    pageTitle = 'Outlet'; pageSubtitle = 'Kelola data outlet/toko';
    pageContent = renderOutlets();
  } else if (route === '#/products') {
    pageTitle = 'Produk'; pageSubtitle = 'Kelola katalog produk distribusi';
    pageContent = renderProducts();
  } else if (route === '#/stocks') {
    pageTitle = 'Stok Outlet'; pageSubtitle = 'Pantau stok produk di setiap outlet';
    pageContent = renderStocks();
  } else if (route === '#/attendance') {
    pageTitle = 'Absensi'; pageSubtitle = 'Rekap kehadiran tim lapangan';
    pageContent = renderAttendanceManager();
  } else if (route === '#/leaves') {
    pageTitle = 'Ijin & Cuti'; pageSubtitle = 'Kelola pengajuan ijin dan cuti karyawan';
    pageContent = renderLeavesManager();
  } else if (route.startsWith('#/employee/')) {
    const id = route.replace('#/employee/', '');
    pageContent = renderEmployeeDetail(id);
    pageTitle = 'Detail Karyawan'; pageSubtitle = '';
  } else if (route.startsWith('#/outlet/')) {
    const id = route.replace('#/outlet/', '');
    pageContent = renderOutletDetail(id);
    pageTitle = 'Detail Outlet'; pageSubtitle = ''; else {
    pageContent = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Halaman tidak ditemukan</h3><p>Route: ${route}</p></div>`;
  }

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="sidebar-backdrop" onclick="FT.closeSidebar()" style="display:none;"></div>
      <div class="main-area">
        <div class="topbar">
          <button class="mobile-menu-btn" onclick="FT.toggleSidebar()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div class="topbar-title">${pageTitle}</div>
            ${pageSubtitle ? `<div class="topbar-subtitle">${pageSubtitle}</div>` : ''}
          </div>
          <div class="topbar-spacer"></div>
          <div class="topbar-actions">
            ${route === '#/tracking' ? '<div class="live-badge"><span class="live-dot"></span> LIVE</div>' : ''}
            <div class="live-badge" style="color: var(--gray-600); background: var(--gray-100); border-color: var(--gray-200);">
              <span>${formatDateShort('2024-07-27')}</span>
            </div>
          </div>
        </div>
        <div class="content">
          ${pageContent}
        </div>
      </div>
    </div>
  `;

  attachPageHandlers();
  if (route === '#/tracking') initMap();
}

// ===== Sidebar =====
function renderSidebar() {
  const currentRoute = state.route;
  const navSource = isManager() ? NAV_ITEMS : NAV_ITEMS_EMPLOYEE;
  let navHTML = '';
  for (const section of navSource) {
    navHTML += `<div class="nav-section-label">${section.section}</div>`;
    for (const item of section.items) {
      const active = currentRoute === item.route
        || (item.id === 'dashboard' && (currentRoute === '#/' || currentRoute === '#'))
        || (item.id === 'myday' && (currentRoute === '#/myday' || currentRoute === '#'));
      let badge = '';
      if (isManager() && item.id === 'tracking') {
        const activeEmps = getEmployees().filter(e => e.status === 'active').length;
        badge = `<span class="nav-badge">${activeEmps}</span>`;
      }
      if (isManager() && item.id === 'leaves') {
        const pending = getLeaves().filter(l => l.status === 'pending').length;
        if (pending > 0) badge = `<span class="nav-badge" style="background:var(--amber-500);">${pending}</span>`;
      }
      if (isManager() && item.id === 'stocks') {
        const low = getStocks().filter(s => s.quantity <= s.minStock).length;
        if (low > 0) badge = `<span class="nav-badge" style="background:var(--red-500);">${low}</span>`;
      }
      navHTML += `<a href="${item.route}" class="nav-item ${active ? 'active' : ''}" onclick="FT.closeSidebar()">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
        ${badge}
      </a>`;
    }
  }

  return `
    <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}">
      <div class="sidebar-header">
        <div class="sidebar-logo">PQ</div>
        <div class="sidebar-logo-text">ProQTrack<small>Monitoring System</small></div>
      </div>
      <nav class="sidebar-nav">${navHTML}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-avatar">${getInitials(state.user.name)}</div>
          <div class="sidebar-user-info">
            <div class="name">${state.user.name}</div>
            <div class="role">${state.user.role}</div>
          </div>
          <button class="logout-btn" onclick="FT.logout()" title="Keluar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// ===== Login =====
function renderLogin() {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">PQ</div>
        <h1>ProQTrack</h1>
        <div class="subtitle">Field Team Real-time Monitoring System</div>
        <form onsubmit="FT.handleLogin(event)">
          <div class="form-group">
            <label class="label">Email</label>
            <input class="input" type="email" id="loginEmail" placeholder="email@proqtrack.id" required>
          </div>
          <div class="form-group">
            <label class="label">Password</label>
            <input class="input" type="password" id="loginPassword" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; margin-top:8px;">
            Masuk ke Dashboard
          </button>
        </form>
        <div style="text-align:center; margin-top:24px; font-size:12px; color:var(--gray-400);">
          <div style="font-weight:600; color:var(--gray-500); margin-bottom:6px;">Akun Tersedia:</div>
          <div style="text-align:left; display:inline-block; line-height:1.8;">
            <div>👔 <b>manager@proqtrack.id</b> / demo123</div>
            <div>👤 budi.santoso@proqtrack.id / budi123</div>
            <div>👤 siti.nurhaliza@proqtrack.id / siti123</div>
            <div style="color:var(--gray-300); font-size:11px;">…dan 6 akun karyawan lainnya</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.FT.handleLogin = function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const acc = authenticate(email, password);
  if (!acc) {
    showToast('Email atau password salah', 'error');
    return;
  }
  state.loggedIn = true;
  state.account = acc;
  state.user = { name: acc.name, role: acc.role === 'manager' ? 'Manager' : 'Field Sales', email: acc.email };
  state.route = acc.role === 'manager' ? '#/' : '#/myday';
  location.hash = state.route;
  render();
};

window.FT.logout = function() {
  state.loggedIn = false;
  state.account = null;
  state.route = '#/login';
  if (state.livePolling) { clearInterval(state.livePolling); state.livePolling = null; }
  render();
};

// ===== Dashboard =====
function renderDashboard() {
  const stats = getDashboardStats();
  const employees = getEmployees();
  const todayVisits = getVisits().filter(v => v.date === '2024-07-27');
  const attendance = getAttendance().filter(a => a.date === '2024-07-27');

  const statCards = [
    { label: 'Total Karyawan',      value: stats.totalEmployees, icon: '👥', bg: 'bg-blue-50', color: 'var(--blue-600)' },
    { label: 'Kunjungan Hari Ini',  value: stats.todayVisits,    icon: '📋', bg: 'bg-amber-50', color: 'var(--amber-500)' },
    { label: 'Stok Menipis',        value: stats.lowStocks,     icon: '📊', bg: 'bg-emerald-50', color: 'var(--green-600)' },
    { label: 'Ijin/Cuti Pending',  value: stats.pendingLeaves,  icon: '📄', bg: 'bg-purple-50', color: '#7c3aed' },
  ];

  // Activity feed (latest visits)
  const recentVisits = [...todayVisits].sort((a,b) => (b.checkInTime||'').localeCompare(a.checkInTime||'')).slice(0, 6);
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));

  // Attendance summary
  const attSummary = [
    { label: 'Hadir',       value: stats.attendanceHadir,      color: 'var(--green-600)', bg: '#ecfdf5' },
    { label: 'Terlambat',   value: stats.attendanceTerlambat,  color: 'var(--amber-500)', bg: '#fffbeb' },
    { label: 'Tidak Hadir', value: stats.attendanceTidakHadir, color: 'var(--red-500)',  bg: '#fef2f2' },
  ];

  // Top performers
  const topPerformers = [...employees].sort((a,b) => b.todayVisits - a.todayVisits).slice(0, 5);

  return `
    <div class="grid-4" style="margin-bottom:24px;">
      ${statCards.map(s => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${s.bg}; color:${s.color};">${s.icon}</div>
          <div class="stat-label">${s.label}</div>
          <div class="stat-value">${s.value}</div>
        </div>
      `).join('')}
    </div>

    <div class="grid-3" style="margin-bottom:24px;">
      <div class="card" style="grid-column: span 2;">
        <div class="card-title">Aktivitas Kunjungan Terkini</div>
        <div class="card-subtitle">Kunjungan outlet hari ini</div>
        ${recentVisits.length === 0 ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada kunjungan</h3></div>` : `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${recentVisits.map(v => {
            const emp = empMap[v.employeeId]; const out = outletMap[v.outletId];
            if (!emp || !out) return '';
            const avatarColors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
            const cIdx = emp.name.charCodeAt(0) % avatarColors.length;
            return `
              <div style="display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; background:var(--gray-50);">
                <div class="avatar" style="background:${avatarColors[cIdx]};">${getInitials(emp.name)}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:14px; font-weight:600; color:var(--gray-800);">${emp.name}</div>
                  <div style="font-size:12px; color:var(--gray-400);">${outletIcon(out.type)} ${out.name}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:12px; color:var(--gray-400);">${v.checkInTime || 'planned'}</div>
                  ${statusBadge(v.status)}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        `}
      </div>

      <div class="card">
        <div class="card-title">Absensi Hari Ini</div>
        <div class="card-subtitle">Status kehadiran tim</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${attSummary.map(a => `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-radius:10px; background:${a.bg};">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:10px; height:10px; border-radius:50%; background:${a.color};"></div>
                <span style="font-size:14px; font-weight:600; color:var(--gray-700);">${a.label}</span>
              </div>
              <span style="font-size:20px; font-weight:800; color:${a.color};">${a.value}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Top Performer Hari Ini</div>
        <div class="card-subtitle">Karyawan dengan kunjungan terbanyak</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${topPerformers.map((e, i) => {
            const pct = Math.round(e.todayVisits / e.targetVisits * 100);
            const avatarColors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
            const cIdx = e.name.charCodeAt(0) % avatarColors.length;
            return `
              <div style="display:flex; align-items:center; gap:12px; padding:10px; border-radius:10px; background:var(--gray-50);">
                <div style="font-size:16px; font-weight:800; color:${i===0?'var(--amber-500)':'var(--gray-300)'}; width:24px;">#${i+1}</div>
                <div class="avatar" style="background:${avatarColors[cIdx]};">${getInitials(e.name)}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:14px; font-weight:600; color:var(--gray-800);">${e.name}</div>
                  <div style="font-size:12px; color:var(--gray-400);">${e.area}</div>
                </div>
                <div style="text-align:right; min-width:80px;">
                  <div style="font-size:14px; font-weight:700; color:var(--gray-800);">${e.todayVisits}/${e.targetVisits}</div>
                  <div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Progress Kunjungan</div>
        <div class="card-subtitle">Target vs realisasi hari ini</div>
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
          ${[
            { label: 'Selesai',  value: stats.completedVisits, total: stats.todayVisits, color: 'var(--green-600)' },
            { label: 'Aktif',    value: stats.activeVisits,   total: stats.todayVisits, color: 'var(--blue-600)' },
            { label: 'Direncanakan', value: stats.plannedVisits, total: stats.todayVisits, color: 'var(--amber-500)' },
          ].map(r => {
            const pct = r.total > 0 ? Math.round(r.value / r.total * 100) : 0;
            return `
              <div>
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
                  <span style="color:var(--gray-600); font-weight:500;">${r.label}</span>
                  <span style="color:var(--gray-800); font-weight:600;">${r.value} (${pct}%)</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${r.color};"></div></div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="padding:16px; background:var(--blue-50); border-radius:12px; display:flex; align-items:center; gap:12px;">
          <div style="font-size:32px; font-weight:800; color:var(--blue-700);">${stats.avgRating || '-'}</div>
          <div>
            <div style="font-size:13px; font-weight:600; color:var(--gray-700);">Rata-rata Rating</div>
            <div style="font-size:12px; color:var(--gray-400);">Dari kunjungan selesai hari ini</div>
          </div>
          <div style="margin-left:auto; font-size:20px; color:#fbbf24;">${'★'.repeat(Math.round(stats.avgRating || 0))}${'☆'.repeat(5 - Math.round(stats.avgRating || 0))}</div>
        </div>
      </div>
    </div>
  `;
}

// ===== Tracking Page =====
function renderTracking() {
  const employees = getEmployees().filter(e => e.status === 'active');
  return `
    <div style="display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap;">
      <div class="map-container" style="flex:1; min-width:0; position:relative;">
        <div id="trackingMap"></div>
        <div class="map-sidebar-panel">
          <h3>Tim Lapangan (${employees.length})</h3>
          <div id="mapEmpList">
            ${employees.map(e => {
              const dotColor = e.status === 'active' ? 'var(--green-500)' : 'var(--gray-300)';
              const visits = getVisits().filter(v => v.employeeId === e.id && v.date === '2024-07-27');
              const activeVisit = visits.find(v => v.status === 'checked-in');
              return `
                <div class="map-emp-item" data-emp="${e.id}" onclick="FT.focusEmployee('${e.id}')">
                  <div class="emp-status-dot" style="background:${dotColor};"></div>
                  <div class="emp-info">
                    <div class="emp-name">${e.name}</div>
                    <div class="emp-area">${e.area} · ${e.todayVisits} kunjungan${activeVisit ? ' · 🟢 active' : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

let _map = null;
let _markers = {};

function initMap() {
  if (typeof L === 'undefined') {
    setTimeout(initMap, 200);
    return;
  }
  const employees = getEmployees().filter(e => e.status === 'active');

  if (_map) { _map.remove(); _map = null; _markers = {}; }
  _map = L.map('trackingMap', { zoomControl: true }).setView([-6.2, 106.85], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(_map);

  const avatarColors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  employees.forEach(e => {
    const cIdx = e.name.charCodeAt(0) % avatarColors.length;
    const color = avatarColors[cIdx];
    const visits = getVisits().filter(v => v.employeeId === e.id && v.date === '2024-07-27');
    const activeVisit = visits.find(v => v.status === 'checked-in');
    const icon = L.divIcon({
      className: 'ft-marker',
      html: `<div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;${activeVisit?'border-color:#10b981;border-width:4px;':''}">${getInitials(e.name)}</div>`,
      iconSize: [36,36], iconAnchor: [18,18]
    });
    const m = L.marker([e.lat, e.lng], { icon }).addTo(_map);
    const outlet = activeVisit ? getOutlets().find(o => o.id === activeVisit.outletId) : null;
    m.bindPopup(`
      <div style="font-size:13px; min-width:160px;">
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${e.name}</div>
        <div style="color:#666;">${e.role} · ${e.area}</div>
        <div style="margin-top:6px;">📞 ${e.phone}</div>
        <div>📋 ${e.todayVisits}/${e.targetVisits} kunjungan hari ini</div>
        ${activeVisit && outlet ? `<div style="margin-top:6px; padding-top:6px; border-top:1px solid #eee; color:#ea580c;">📍 Sedang di: ${outlet.name}</div>` : ''}
      </div>
    `);
    _markers[e.id] = m;
  });

  // Simulate live movement: nudge employees slightly every 5s
  if (state.livePolling) clearInterval(state.livePolling);
  state.livePolling = setInterval(() => {
    const emps = getEmployees().filter(e => e.status === 'active');
    emps.forEach(e => {
      const m = _markers[e.id];
      if (m) {
        const newLat = e.lat + (Math.random() - 0.5) * 0.002;
        const newLng = e.lng + (Math.random() - 0.5) * 0.002;
        m.setLatLng([newLat, newLng]);
      }
    });
  }, 5000);
}

window.FT.focusEmployee = function(empId) {
  const emp = getEmployees().find(e => e.id === empId);
  if (!emp || !_map || !_markers[empId]) return;
  _map.setView([emp.lat, emp.lng], 15, { animate: true });
  _markers[empId].openPopup();
  document.querySelectorAll('.map-emp-item').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.map-emp-item[data-emp="${empId}"]`)?.classList.add('selected');
};

// ===== Visits Page =====
function renderVisits() {
  const visits = getVisits().sort((a,b) => b.date.localeCompare(a.date) || (b.checkInTime||'').localeCompare(a.checkInTime||''));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));

  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="visitSearch" placeholder="🔍 Cari kunjungan..." oninput="FT.filterVisits()">
        <select class="select" id="visitStatusFilter" style="width:180px;" onchange="FT.filterVisits()">
          <option value="">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="checked-in">Sedang Berlangsung</option>
          <option value="planned">Direncanakan</option>
        </select>
        <select class="select" id="visitEmpFilter" style="width:200px;" onchange="FT.filterVisits()">
          <option value="">Semua Karyawan</option>
          ${getEmployees().map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openVisitModal()">+ Tambah Kunjungan</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="visitsTable">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Karyawan</th>
              <th>Outlet</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Durasi</th>
              <th>Status</th>
              <th>Rating</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${visits.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada data kunjungan</h3><p>Klik "Tambah Kunjungan" untuk membuat data baru</p></div></td></tr>` :
            visits.map(v => {
              const emp = empMap[v.employeeId]; const out = outletMap[v.outletId];
              if (!emp || !out) return '';
              const stars = v.rating > 0 ? `${'★'.repeat(v.rating)}${'☆'.repeat(5-v.rating)}` : '-';
              return `
                <tr>
                  <td>${formatDateShort(v.date)}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div class="avatar" style="width:28px;height:28px;font-size:11px;background:${['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'][emp.name.charCodeAt(0)%6]};">${getInitials(emp.name)}</div>
                      <span style="font-weight:600;">${emp.name}</span>
                    </div>
                  </td>
                  <td>${outletIcon(out.type)} ${out.name}</td>
                  <td>${v.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${v.checkOutTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${formatDuration(v.checkInTime, v.checkOutTime)}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td style="color:#fbbf24;">${stars}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="FT.viewVisit('${v.id}')">Detail</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterVisits = function() {
  const search = document.getElementById('visitSearch').value.toLowerCase();
  const status = document.getElementById('visitStatusFilter').value;
  const empF = document.getElementById('visitEmpFilter').value;
  const rows = document.querySelectorAll('#visitsTable tbody tr');
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const empId = row.dataset.emp || '';
    const outId = row.dataset.outlet || '';
    // re-derive from cell content
    let show = true;
    if (search && !text.includes(search)) show = false;
    if (status && !text.includes(status)) show = false;
    if (empF) {
      const empName = empMap[empF]?.name || '';
      if (!text.includes(empName.toLowerCase())) show = false;
    }
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openVisitModal = function() {
  const employees = getEmployees();
  const outlets = getOutlets();
  openModal('Tambah Kunjungan', `
    <form onsubmit="FT.createVisit(event)">
      <div class="form-group">
        <label class="label">Karyawan</label>
        <select class="select" name="employeeId" required>
          ${employees.map(e => `<option value="${e.id}">${e.name} — ${e.area}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Outlet</label>
        <select class="select" name="outletId" required>
          ${outlets.map(o => `<option value="${o.id}">${o.name} — ${o.area}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Tanggal</label>
          <input class="input" type="date" name="date" value="2024-07-27" required>
        </div>
        <div class="form-group">
          <label class="label">Status</label>
          <select class="select" name="status">
            <option value="planned">Direncanakan</option>
            <option value="checked-in">Sedang Berlangsung</option>
            <option value="completed">Selesai</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Check In</label>
          <input class="input" type="time" name="checkInTime">
        </div>
        <div class="form-group">
          <label class="label">Check Out</label>
          <input class="input" type="time" name="checkOutTime">
        </div>
      </div>
      <div class="form-group">
        <label class="label">Catatan</label>
        <textarea class="textarea" name="notes" placeholder="Catatan kunjungan..."></textarea>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createVisit = function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  if (data.checkInTime === '') data.checkInTime = null;
  if (data.checkOutTime === '') data.checkOutTime = null;
  createVisit(data);
  closeModal();
  showToast('Kunjungan berhasil ditambahkan', 'success');
  render();
};

window.FT.viewVisit = function(id) {
  const v = getVisits().find(x => x.id === id);
  if (!v) return;
  const emp = getEmployees().find(e => e.id === v.employeeId);
  const out = getOutlets().find(o => o.id === v.outletId);
  const stars = v.rating > 0 ? `${'★'.repeat(v.rating)}${'☆'.repeat(5-v.rating)}` : 'Belum dinilai';
  openModal('Detail Kunjungan', `
    <div class="detail-grid">
      <div class="detail-label">Karyawan</div><div class="detail-value">${emp ? emp.name : '-'}</div>
      <div class="detail-label">Outlet</div><div class="detail-value">${out ? outletIcon(out.type)+' '+out.name : '-'}</div>
      <div class="detail-label">Tanggal</div><div class="detail-value">${formatDate(v.date)}</div>
      <div class="detail-label">Check In</div><div class="detail-value">${v.checkInTime || '-'}</div>
      <div class="detail-label">Check Out</div><div class="detail-value">${v.checkOutTime || '-'}</div>
      <div class="detail-label">Durasi</div><div class="detail-value">${formatDuration(v.checkInTime, v.checkOutTime)}</div>
      <div class="detail-label">Status</div><div class="detail-value">${statusBadge(v.status)}</div>
      <div class="detail-label">Rating</div><div class="detail-value" style="color:#fbbf24;">${stars}</div>
      <div class="detail-label">Catatan</div><div class="detail-value full">${v.notes || '-'}</div>
    </div>
    ${v.status !== 'completed' ? `
      <div style="margin-top:16px; display:flex; gap:8px;">
        ${v.status === 'planned' ? `<button class="btn btn-primary btn-sm" onclick="FT.checkInVisit('${v.id}')">Check In</button>` : ''}
        ${v.status === 'checked-in' ? `<button class="btn btn-primary btn-sm" onclick="FT.checkOutVisit('${v.id}')">Check Out</button>` : ''}
      </div>
    ` : ''}
    <div class="modal-footer" style="padding:24px 0 0;">
      <button class="btn btn-secondary" onclick="FT.closeModal()">Tutup</button>
      <button class="btn btn-danger" onclick="FT.deleteVisit('${v.id}')">Hapus</button>
    </div>
  `);
};


window.FT.toggleSidebar = function() {
  const sb = document.querySelector('.sidebar');
  const bd = document.querySelector('.sidebar-backdrop');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  if (bd) {
    if (open) { bd.classList.add('show'); bd.style.display = 'block'; }
    else { bd.classList.remove('show'); setTimeout(() => { if (!sb.classList.contains('open')) bd.style.display = 'none'; }, 250); }
  }
};
window.FT.closeSidebar = function() {
  const sb = document.querySelector('.sidebar');
  const bd = document.querySelector('.sidebar-backdrop');
  if (sb) sb.classList.remove('open');
  if (bd) { bd.classList.remove('show'); setTimeout(() => { bd.style.display = 'none'; }, 250); }
};

window.FT.checkInVisit = function(id) {
  updateVisit(id, { status: 'checked-in', checkInTime: new Date().toTimeString().slice(0,5) });
  closeModal(); showToast('Berhasil check in', 'success'); render();
};
window.FT.checkOutVisit = function(id) {
  updateVisit(id, { status: 'completed', checkOutTime: new Date().toTimeString().slice(0,5) });
  closeModal(); showToast('Berhasil check out', 'success'); render();
};
window.FT.deleteVisit = function(id) {
  if (!confirm('Hapus kunjungan ini?')) return;
  deleteVisit(id);
  closeModal(); showToast('Kunjungan dihapus', 'success'); render();
};

// ===== Employees Page =====
function renderEmployees() {
  const employees = getEmployees();
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="empSearch" placeholder="🔍 Cari karyawan..." oninput="FT.filterEmployees()">
        <select class="select" id="empRoleFilter" style="width:180px;" onchange="FT.filterEmployees()">
          <option value="">Semua Role</option>
          <option value="Field Sales">Field Sales</option>
          <option value="Supervisor">Supervisor</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openEmployeeModal()">+ Tambah Karyawan</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="empTable">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Role</th>
              <th>Area</th>
              <th>Telepon</th>
              <th>Hari Ini</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${employees.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👥</div><h3>Belum ada karyawan</h3></div></td></tr>` :
            employees.map(e => {
              const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
              const cIdx = e.name.charCodeAt(0) % colors.length;
              return `
                <tr>
                  <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                      <div class="avatar" style="background:${colors[cIdx]};">${getInitials(e.name)}</div>
                      <div>
                        <div style="font-weight:600; color:var(--gray-800);">${e.name}</div>
                        <div style="font-size:12px; color:var(--gray-400);">${e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>${roleBadge(e.role)}</td>
                  <td>${e.area}</td>
                  <td>${e.phone}</td>
                  <td><span style="font-weight:600;">${e.todayVisits}</span>/${e.targetVisits}</td>
                  <td>${e.totalVisits}</td>
                  <td>${statusBadge(e.status)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="location.hash='#/employee/${e.id}'">Detail</button>
                    <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="FT.deleteEmployee('${e.id}')">Hapus</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterEmployees = function() {
  const search = document.getElementById('empSearch').value.toLowerCase();
  const role = document.getElementById('empRoleFilter').value;
  document.querySelectorAll('#empTable tbody tr').forEach(row => {
    const text = row.textContent.toLowerCase();
    let show = true;
    if (search && !text.includes(search)) show = false;
    if (role && !text.includes(role.toLowerCase())) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openEmployeeModal = function() {
  openModal('Tambah Karyawan', `
    <form onsubmit="FT.createEmployee(event)">
      <div class="form-group"><label class="label">Nama Lengkap</label><input class="input" name="name" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" required></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" placeholder="08xx-xxxx-xxxx" required></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Role</label>
          <select class="select" name="role"><option>Field Sales</option><option>Supervisor</option><option>Admin</option></select>
        </div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" placeholder="Jakarta Pusat" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Latitude</label><input class="input" type="number" step="0.0001" name="lat" value="-6.2000" required></div>
        <div class="form-group"><label class="label">Longitude</label><input class="input" type="number" step="0.0001" name="lng" value="106.8000" required></div>
      </div>
      <div class="form-group"><label class="label">Target Kunjungan Harian</label><input class="input" type="number" name="targetVisits" value="6" required></div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createEmployee = function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  data.lat = parseFloat(data.lat); data.lng = parseFloat(data.lng);
  data.targetVisits = parseInt(data.targetVisits);
  data.joinDate = new Date().toISOString().slice(0,10);
  createEmployee(data);
  closeModal(); showToast('Karyawan berhasil ditambahkan', 'success'); render();
};

window.FT.deleteEmployee = function(id) {
  if (!confirm('Hapus karyawan ini?')) return;
  deleteEmployee(id);
  showToast('Karyawan dihapus', 'success'); render();
};

// ===== Employee Detail =====
function renderEmployeeDetail(id) {
  const emp = getEmployees().find(e => e.id === id);
  if (!emp) return `<div class="empty-state"><h3>Karyawan tidak ditemukan</h3></div>`;
  const visits = getVisits().filter(v => v.employeeId === id).sort((a,b) => b.date.localeCompare(a.date));
  const attendance = getAttendance().filter(a => a.employeeId === id);
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const cIdx = emp.name.charCodeAt(0) % colors.length;

  return `
    <div style="display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:24px;">
      <div class="card" style="flex:0 0 320px;">
        <div style="text-align:center; padding:12px 0 20px;">
          <div class="avatar avatar-lg" style="background:${colors[cIdx]}; margin:0 auto 12px;">${getInitials(emp.name)}</div>
          <div style="font-size:20px; font-weight:800; color:var(--gray-900);">${emp.name}</div>
          <div style="margin-top:4px;">${roleBadge(emp.role)}</div>
          <div style="margin-top:8px;">${statusBadge(emp.status)}</div>
        </div>
        <div class="detail-grid">
          <div class="detail-label">ID</div><div class="detail-value">${emp.id}</div>
          <div class="detail-label">Email</div><div class="detail-value">${emp.email}</div>
          <div class="detail-label">Telepon</div><div class="detail-value">${emp.phone}</div>
          <div class="detail-label">Area</div><div class="detail-value">${emp.area}</div>
          <div class="detail-label">Bergabung</div><div class="detail-value">${formatDate(emp.joinDate)}</div>
          <div class="detail-label">Lokasi</div><div class="detail-value">${emp.lat.toFixed(4)}, ${emp.lng.toFixed(4)}</div>
        </div>
        <div style="display:flex; gap:8px; margin-top:20px;">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/employees'">← Kembali</button>
          <button class="btn btn-primary btn-sm" onclick="FT.editEmployee('${emp.id}')">Edit</button>
        </div>
      </div>
      <div style="flex:1; min-width:300px;">
        <div class="grid-3" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-label">Kunjungan Hari Ini</div><div class="stat-value">${emp.todayVisits}</div><div style="font-size:12px; color:var(--gray-400); margin-top:4px;">Target: ${emp.targetVisits}</div></div>
          <div class="stat-card"><div class="stat-label">Total Kunjungan</div><div class="stat-value">${emp.totalVisits}</div></div>
          <div class="stat-card"><div class="stat-label">Kehadiran</div><div class="stat-value">${attendance.length}</div><div style="font-size:12px; color:var(--gray-400); margin-top:4px;">catatan</div></div>
        </div>
        <div class="card">
          <div class="card-title">Riwayat Kunjungan</div>
          <div class="card-subtitle">${visits.length} kunjungan</div>
          ${visits.length === 0 ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada riwayat</h3></div>` : `
          <div class="visits-table-wrapper"><table class="table">
            <thead><tr><th>Tanggal</th><th>Outlet</th><th>Check In</th><th>Status</th></tr></thead>
            <tbody>
              ${visits.map(v => { const o = outletMap[v.outletId]; return `
                <tr>
                  <td>${formatDateShort(v.date)}</td>
                  <td>${o ? outletIcon(o.type)+' '+o.name : '-'}</td>
                  <td>${v.checkInTime || '-'}</td>
                  <td>${statusBadge(v.status)}</td>
                </tr>
              `; }).join('')}
            </tbody>
          </table></div>
          `}
        </div>
      </div>
    </div>
  `;
}

window.FT.editEmployee = function(id) {
  const emp = getEmployees().find(e => e.id === id);
  if (!emp) return;
  openModal('Edit Karyawan', `
    <form onsubmit="FT.updateEmployee(event, '${id}')">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${emp.name}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Email</label><input class="input" type="email" name="email" value="${emp.email}" required></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" value="${emp.phone}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Role</label><select class="select" name="role"><option ${emp.role==='Field Sales'?'selected':''}>Field Sales</option><option ${emp.role==='Supervisor'?'selected':''}>Supervisor</option></select></div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" value="${emp.area}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Lat</label><input class="input" type="number" step="0.0001" name="lat" value="${emp.lat}" required></div>
        <div class="form-group"><label class="label">Lng</label><input class="input" type="number" step="0.0001" name="lng" value="${emp.lng}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Target Harian</label><input class="input" type="number" name="targetVisits" value="${emp.targetVisits}" required></div>
        <div class="form-group"><label class="label">Status</label><select class="select" name="status"><option value="active" ${emp.status==='active'?'selected':''}>Active</option><option value="inactive" ${emp.status==='inactive'?'selected':''}>Inactive</option></select></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateEmployee = function(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  data.lat = parseFloat(data.lat); data.lng = parseFloat(data.lng);
  data.targetVisits = parseInt(data.targetVisits);
  updateEmployee(id, data);
  closeModal(); showToast('Data karyawan diperbarui', 'success'); render();
};

// ===== Outlets Page =====
function renderOutlets() {
  const outlets = getOutlets();
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="outletSearch" placeholder="🔍 Cari outlet..." oninput="FT.filterOutlets()">
        <select class="select" id="outletTypeFilter" style="width:180px;" onchange="FT.filterOutlets()">
          <option value="">Semua Tipe</option>
          <option>Toko Kelontong</option><option>Minimarket</option><option>Restoran</option>
          <option>Warung Kopi</option><option>Apotek</option><option>Toko Bangunan</option>
          <option>Toko Elektronik</option><option>Bakery</option><option>Toko Fashion</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openOutletModal()">+ Tambah Outlet</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="outletTable">
          <thead>
            <tr><th>Nama</th><th>Tipe</th><th>Area</th><th>Pemilik</th><th>Telepon</th><th>Frekuensi</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${outlets.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏪</div><h3>Belum ada outlet</h3></div></td></tr>` :
            outlets.map(o => `
              <tr>
                <td><div style="font-weight:600; color:var(--gray-800);">${outletIcon(o.type)} ${o.name}</div><div style="font-size:12px; color:var(--gray-400);">${o.address}</div></td>
                <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${o.type}</span></td>
                <td>${o.area}</td>
                <td>${o.owner}</td>
                <td>${o.phone}</td>
                <td>${o.visitFrequency}</td>
                <td>${statusBadge(o.status)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="location.hash='#/outlet/${o.id}'">Detail</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="FT.deleteOutlet('${o.id}')">Hapus</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterOutlets = function() {
  const search = document.getElementById('outletSearch').value.toLowerCase();
  const type = document.getElementById('outletTypeFilter').value;
  document.querySelectorAll('#outletTable tbody tr').forEach(row => {
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (type && !row.textContent.includes(type)) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openOutletModal = function() {
  openModal('Tambah Outlet', `
    <form onsubmit="FT.createOutlet(event)">
      <div class="form-group"><label class="label">Nama Outlet</label><input class="input" name="name" required></div>
      <div class="form-group"><label class="label">Alamat</label><input class="input" name="address" required></div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Tipe</label>
          <select class="select" name="type">
            <option>Toko Kelontong</option><option>Minimarket</option><option>Restoran</option>
            <option>Warung Kopi</option><option>Apotek</option><option>Toko Bangunan</option>
            <option>Toko Elektronik</option><option>Bakery</option><option>Toko Fashion</option>
          </select>
        </div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Pemilik</label><input class="input" name="owner" required></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Latitude</label><input class="input" type="number" step="0.0001" name="lat" value="-6.2000" required></div>
        <div class="form-group"><label class="label">Longitude</label><input class="input" type="number" step="0.0001" name="lng" value="106.8000" required></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Frekuensi Kunjungan</label>
          <select class="select" name="visitFrequency"><option>Mingguan</option><option>Bulanan</option></select>
        </div>
        <div class="form-group">
          <label class="label">Status</label>
          <select class="select" name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createOutlet = function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  data.lat = parseFloat(data.lat); data.lng = parseFloat(data.lng);
  createOutlet(data);
  closeModal(); showToast('Outlet berhasil ditambahkan', 'success'); render();
};

window.FT.deleteOutlet = function(id) {
  if (!confirm('Hapus outlet ini?')) return;
  deleteOutlet(id);
  showToast('Outlet dihapus', 'success'); render();
};

// ===== Outlet Detail =====
function renderOutletDetail(id) {
  const o = getOutlets().find(x => x.id === id);
  if (!o) return `<div class="empty-state"><h3>Outlet tidak ditemukan</h3></div>`;
  const visits = getVisits().filter(v => v.outletId === id).sort((a,b) => b.date.localeCompare(a.date));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));

  return `
    <div style="display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:24px;">
      <div class="card" style="flex:0 0 320px;">
        <div style="text-align:center; padding:12px 0 20px;">
          <div style="font-size:48px; margin-bottom:8px;">${outletIcon(o.type)}</div>
          <div style="font-size:18px; font-weight:800; color:var(--gray-900);">${o.name}</div>
          <div style="margin-top:4px;">${statusBadge(o.status)}</div>
        </div>
        <div class="detail-grid">
          <div class="detail-label">ID</div><div class="detail-value">${o.id}</div>
          <div class="detail-label">Tipe</div><div class="detail-value">${o.type}</div>
          <div class="detail-label">Alamat</div><div class="detail-value full">${o.address}</div>
          <div class="detail-label">Pemilik</div><div class="detail-value">${o.owner}</div>
          <div class="detail-label">Telepon</div><div class="detail-value">${o.phone}</div>
          <div class="detail-label">Area</div><div class="detail-value">${o.area}</div>
          <div class="detail-label">Lokasi</div><div class="detail-value">${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}</div>
          <div class="detail-label">Frekuensi</div><div class="detail-value">${o.visitFrequency}</div>
        </div>
        <div style="display:flex; gap:8px; margin-top:20px;">
          <button class="btn btn-secondary btn-sm" onclick="location.hash='#/outlets'">← Kembali</button>
          <button class="btn btn-primary btn-sm" onclick="FT.editOutlet('${o.id}')">Edit</button>
        </div>
      </div>
      <div style="flex:1; min-width:300px;">
        <div class="card">
          <div class="card-title">Riwayat Kunjungan</div>
          <div class="card-subtitle">${visits.length} kunjungan</div>
          ${visits.length === 0 ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada riwayat</h3></div>` : `
          <div class="visits-table-wrapper"><table class="table">
            <thead><tr><th>Tanggal</th><th>Karyawan</th><th>Check In</th><th>Status</th></tr></thead>
            <tbody>
              ${visits.map(v => { const emp = empMap[v.employeeId]; return `
                <tr>
                  <td>${formatDateShort(v.date)}</td>
                  <td>${emp ? emp.name : '-'}</td>
                  <td>${v.checkInTime || '-'}</td>
                  <td>${statusBadge(v.status)}</td>
                </tr>
              `; }).join('')}
            </tbody>
          </table></div>
          `}
        </div>
      </div>
    </div>
  `;
}

window.FT.editOutlet = function(id) {
  const o = getOutlets().find(x => x.id === id);
  if (!o) return;
  openModal('Edit Outlet', `
    <form onsubmit="FT.updateOutlet(event, '${id}')">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${o.name}" required></div>
      <div class="form-group"><label class="label">Alamat</label><input class="input" name="address" value="${o.address}" required></div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Tipe</label>
          <select class="select" name="type">${['Toko Kelontong','Minimarket','Restoran','Warung Kopi','Apotek','Toko Bangunan','Toko Elektronik','Bakery','Toko Fashion'].map(t => `<option ${o.type===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" value="${o.area}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Pemilik</label><input class="input" name="owner" value="${o.owner}" required></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" value="${o.phone}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Lat</label><input class="input" type="number" step="0.0001" name="lat" value="${o.lat}" required></div>
        <div class="form-group"><label class="label">Lng</label><input class="input" type="number" step="0.0001" name="lng" value="${o.lng}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Frekuensi</label><select class="select" name="visitFrequency"><option ${o.visitFrequency==='Mingguan'?'selected':''}>Mingguan</option><option ${o.visitFrequency==='Bulanan'?'selected':''}>Bulanan</option></select></div>
        <div class="form-group"><label class="label">Status</label><select class="select" name="status"><option value="active" ${o.status==='active'?'selected':''}>Active</option><option value="inactive" ${o.status==='inactive'?'selected':''}>Inactive</option></select></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateOutlet = function(e, id) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  data.lat = parseFloat(data.lat); data.lng = parseFloat(data.lng);
  updateOutlet(id, data);
  closeModal(); showToast('Data outlet diperbarui', 'success'); render();
};

// ===== Employee: My Day Dashboard =====
function renderMyDay() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  if (!emp) return `<div class="empty-state"><h3>Data karyawan tidak ditemukan</h3></div>`;
  const visits = getVisits().filter(v => v.employeeId === empId && v.date === '2024-07-27');
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const att = getAttendance().find(a => a.employeeId === empId && a.date === '2024-07-27');
  const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const cIdx = emp.name.charCodeAt(0) % colors.length;
  const completed = visits.filter(v => v.status === 'completed');
  const activeV = visits.filter(v => v.status === 'checked-in');
  const planned = visits.filter(v => v.status === 'planned');
  const pct = emp.targetVisits > 0 ? Math.round(emp.todayVisits / emp.targetVisits * 100) : 0;

  return `
    <div class="grid-3" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50); color:var(--blue-600);">📋</div>
        <div class="stat-label">Kunjungan Hari Ini</div>
        <div class="stat-value">${emp.todayVisits}<span style="font-size:16px; color:var(--gray-400); font-weight:500;"> / ${emp.targetVisits}</span></div>
        <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50); color:var(--green-600);">✅</div>
        <div class="stat-label">Selesai</div>
        <div class="stat-value">${completed.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50); color:var(--amber-500);">⏳</div>
        <div class="stat-label">Aktif & Direncanakan</div>
        <div class="stat-value">${activeV.length + planned.length}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Status Absensi</div>
        <div class="card-subtitle">Kehadiran Anda hari ini</div>
        ${att ? `
          <div style="display:flex; align-items:center; gap:12px; padding:16px; border-radius:12px; background:${att.status==='hadir'?'#ecfdf5':att.status==='terlambat'?'#fffbeb':'#fef2f2'};">
            <div style="font-size:32px;">${att.status==='hadir'?'✅':att.status==='terlambat'?'⏰':'❌'}</div>
            <div>
              <div style="font-size:18px; font-weight:800; color:${att.status==='hadir'?'var(--green-600)':att.status==='terlambat'?'var(--amber-500)':'var(--red-500)'};">${att.status === 'hadir' ? 'Hadir' : att.status === 'terlambat' ? 'Terlambat' : 'Tidak Hadir'}</div>
              <div style="font-size:13px; color:var(--gray-500);">Check in: ${att.checkInTime || '-'} · ${att.checkInLocation || '-'}</div>
            </div>
          </div>
        ` : `<div class="empty-state"><div class="empty-icon">📝</div><h3>Belum check in</h3></div>`}
      </div>

      <div class="card">
        <div class="card-title">Profil Saya</div>
        <div class="card-subtitle">Informasi akun</div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="avatar avatar-lg" style="background:${colors[cIdx]};">${getInitials(emp.name)}</div>
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--gray-900);">${emp.name}</div>
            <div style="font-size:13px; color:var(--gray-400);">${roleBadge(emp.role)}</div>
            <div style="font-size:12px; color:var(--gray-400); margin-top:4px;">📍 ${emp.area} · 📞 ${emp.phone}</div>
            <div style="font-size:12px; color:var(--gray-400);">Total kunjungan: ${emp.totalVisits}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="card-title">Kunjungan Hari Ini</div>
      <div class="card-subtitle">${visits.length} kunjungan terjadwal</div>
      ${visits.length === 0 ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada kunjungan hari ini</h3></div>` : `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${visits.map(v => {
            const o = outletMap[v.outletId];
            if (!o) return '';
            return `
              <div style="display:flex; align-items:center; gap:12px; padding:14px; border-radius:12px; background:var(--gray-50); ${v.status==='checked-in'?'border:2px solid var(--blue-200);':''}">
                <div style="font-size:28px;">${outletIcon(o.type)}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:15px; font-weight:600; color:var(--gray-800);">${o.name}</div>
                  <div style="font-size:12px; color:var(--gray-400);">${o.address}</div>
                  ${v.checkInTime ? `<div style="font-size:11px; color:var(--gray-400); margin-top:2px;">⏱ ${v.checkInTime}${v.checkOutTime ? ` → ${v.checkOutTime}` : ''} (${formatDuration(v.checkInTime, v.checkOutTime)})</div>` : ''}
                </div>
                <div style="text-align:right;">
                  ${statusBadge(v.status)}
                  ${v.status === 'planned' ? `<br><button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="FT.mobileCheckIn('${v.id}')">Check In</button>` : ''}
                  ${v.status === 'checked-in' ? `
                    <br><button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="FT.mobileCheckOut('${v.id}')">Check Out</button>
                    <br><button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="FT.openVisitStockInput('${v.id}', '${v.outletId}')">📊 Stok</button>
                    <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="FT.openVisitPriceInput('${v.id}', '${v.outletId}')">💰 Harga</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ===== Employee: My Visits History =====
function renderMyVisits() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  const visits = getVisits().filter(v => v.employeeId === empId).sort((a,b) => b.date.localeCompare(a.date) || (b.checkInTime||'').localeCompare(a.checkInTime||''));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));

  return `
    <div class="card">
      <div class="card-title">Riwayat Kunjungan Saya</div>
      <div class="card-subtitle">${visits.length} total kunjungan — ${emp ? emp.name : ''}</div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead>
            <tr><th>Tanggal</th><th>Outlet</th><th>Check In</th><th>Check Out</th><th>Durasi</th><th>Status</th><th>Rating</th></tr>
          </thead>
          <tbody>
            ${visits.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada riwayat kunjungan</h3></div></td></tr>` :
            visits.map(v => {
              const o = outletMap[v.outletId];
              const stars = v.rating > 0 ? `${'★'.repeat(v.rating)}${'☆'.repeat(5-v.rating)}` : '-';
              return `
                <tr>
                  <td>${formatDateShort(v.date)}</td>
                  <td>${o ? outletIcon(o.type)+' '+o.name : '-'}</td>
                  <td>${v.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${v.checkOutTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${formatDuration(v.checkInTime, v.checkOutTime)}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td style="color:#fbbf24;">${stars}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== Products Page (Manager) =====
function renderProducts() {
  const products = getProducts();
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="productSearch" placeholder="🔍 Cari produk..." oninput="FT.filterTable('productTable','productSearch')">
        <select class="select" id="productCatFilter" style="width:160px;" onchange="FT.filterProducts()">
          <option value="">Semua Kategori</option>
          ${[...new Set(products.map(p=>p.category))].map(c=>`<option>${c}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openProductModal()">+ Tambah Produk</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="productTable">
          <thead><tr><th>SKU</th><th>Nama Produk</th><th>Kategori</th><th>Satuan</th><th>Harga</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${products.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📦</div><h3>Belum ada produk</h3></div></td></tr>` :
            products.map(p => `
              <tr>
                <td><span style="font-family:monospace; font-size:12px; color:var(--gray-500);">${p.sku}</span></td>
                <td><span style="font-weight:600; color:var(--gray-800);">${p.name}</span></td>
                <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${p.category}</span></td>
                <td>${p.unit}</td>
                <td style="font-weight:600;">${formatCurrency(p.price)}</td>
                <td>${statusBadge(p.status)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="FT.editProduct('${p.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="FT.deleteProduct('${p.id}')">Hapus</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterProducts = function() {
  const search = document.getElementById('productSearch').value.toLowerCase();
  const cat = document.getElementById('productCatFilter').value;
  document.querySelectorAll('#productTable tbody tr').forEach(row => {
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (cat && !row.textContent.includes(cat)) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openProductModal = function() {
  openModal('Tambah Produk', `
    <form onsubmit="FT.createProduct(event)">
      <div class="form-group"><label class="label">Nama Produk</label><input class="input" name="name" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" placeholder="ABC-001" required></div>
        <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" placeholder="Minuman, Sembako..." required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Satuan</label><input class="input" name="unit" placeholder="dus, pcs, kardus" required></div>
        <div class="form-group"><label class="label">Harga (Rp)</label><input class="input" type="number" name="price" required></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createProduct = function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.price = parseInt(data.price);
  createProduct(data);
  closeModal(); showToast('Produk berhasil ditambahkan', 'success'); render();
};

window.FT.editProduct = function(id) {
  const p = getProducts().find(x => x.id === id);
  if (!p) return;
  openModal('Edit Produk', `
    <form onsubmit="FT.updateProduct(event,'${id}')">
      <div class="form-group"><label class="label">Nama Produk</label><input class="input" name="name" value="${p.name}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" value="${p.sku}" required></div>
        <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" value="${p.category}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Satuan</label><input class="input" name="unit" value="${p.unit}" required></div>
        <div class="form-group"><label class="label">Harga (Rp)</label><input class="input" type="number" name="price" value="${p.price}" required></div>
      </div>
      <div class="form-group"><label class="label">Status</label><select class="select" name="status"><option value="active" ${p.status==='active'?'selected':''}>Active</option><option value="inactive" ${p.status==='inactive'?'selected':''}>Inactive</option></select></div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateProduct = function(e, id) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.price = parseInt(data.price);
  updateProduct(id, data);
  closeModal(); showToast('Produk diperbarui', 'success'); render();
};

window.FT.deleteProduct = function(id) {
  if (!confirm('Hapus produk ini?')) return;
  deleteProduct(id);
  showToast('Produk dihapus', 'success'); render();
};

// ===== Stocks Page (Manager) =====
function renderStocks() {
  const stocks = getStocks();
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const lowStocks = stocks.filter(s => s.quantity <= s.minStock);

  return `
    ${lowStocks.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-color:var(--red-500); background:var(--red-50);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:32px;">⚠️</div>
          <div>
            <div style="font-size:16px; font-weight:700; color:var(--red-700);">${lowStocks.length} Produk Stok Menipis</div>
            <div style="font-size:13px; color:var(--red-500);">Segera lakukan restock ke outlet berikut</div>
          </div>
        </div>
      </div>
    ` : ''}
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="stockSearch" placeholder="🔍 Cari stok..." oninput="FT.filterStocks()">
        <select class="select" id="stockOutletFilter" style="width:200px;" onchange="FT.filterStocks()">
          <option value="">Semua Outlet</option>
          ${getOutlets().map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
        </select>
        <select class="select" id="stockStatusFilter" style="width:160px;" onchange="FT.filterStocks()">
          <option value="">Semua Status</option>
          <option value="low">Stok Menipis</option>
          <option value="ok">Stok Aman</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openStockModal()">+ Tambah Stok</button>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="stockTable">
          <thead><tr><th>Outlet</th><th>Produk</th><th>Qty</th><th>Min. Stok</th><th>Status</th><th>Update</th><th></th></tr></thead>
          <tbody>
            ${stocks.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📊</div><h3>Belum ada data stok</h3></div></td></tr>` :
            stocks.map(s => {
              const p = productMap[s.productId]; const o = outletMap[s.outletId];
              if (!p || !o) return '';
              const isLow = s.quantity <= s.minStock;
              return `
                <tr>
                  <td>${outletIcon(o.type)} ${o.name}</td>
                  <td><span style="font-weight:600;">${p.name}</span><br><span style="font-size:11px; color:var(--gray-400);">${p.sku}</span></td>
                  <td style="font-weight:700; color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="FT.editStock('${s.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="FT.deleteStock('${s.id}')">Hapus</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterStocks = function() {
  const search = (document.getElementById('stockSearch')?.value || '').toLowerCase();
  const statusF = document.getElementById('stockStatusFilter')?.value || '';
  document.querySelectorAll('#stockTable tbody tr').forEach(row => {
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (statusF === 'low' && !row.textContent.includes('Menipis')) show = false;
    if (statusF === 'ok' && !row.textContent.includes('Aman')) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openStockModal = function() {
  openModal('Tambah Stok', `
    <form onsubmit="FT.createStock(event)">
      <div class="form-group"><label class="label">Outlet</label><select class="select" name="outletId" required>${getOutlets().map(o=>`<option value="${o.id}">${o.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Produk</label><select class="select" name="productId" required>${getProducts().filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Quantity</label><input class="input" type="number" name="quantity" required></div>
        <div class="form-group"><label class="label">Min. Stok</label><input class="input" type="number" name="minStock" value="5" required></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createStock = function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.quantity = parseInt(data.quantity);
  data.minStock = parseInt(data.minStock);
  data.updatedBy = myEmployeeId() || 'system';
  createStock(data);
  closeModal(); showToast('Stok berhasil ditambahkan', 'success'); render();
};

window.FT.editStock = function(id) {
  const s = getStocks().find(x => x.id === id);
  if (!s) return;
  const pMap = Object.fromEntries(getProducts().map(p=>[p.id,p]));
  const oMap = Object.fromEntries(getOutlets().map(o=>[o.id,o]));
  openModal('Edit Stok', `
    <form onsubmit="FT.updateStock(event,'${id}')">
      <div class="form-group"><label class="label">Outlet / Produk</label><div style="padding:10px 12px; background:var(--gray-50); border-radius:10px; font-size:14px;">${oMap[s.outletId]?.name||'-'} → ${pMap[s.productId]?.name||'-'}</div></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Quantity</label><input class="input" type="number" name="quantity" value="${s.quantity}" required></div>
        <div class="form-group"><label class="label">Min. Stok</label><input class="input" type="number" name="minStock" value="${s.minStock}" required></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateStock = function(e, id) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.quantity = parseInt(data.quantity);
  data.minStock = parseInt(data.minStock);
  updateStock(id, data);
  closeModal(); showToast('Stok diperbarui', 'success'); render();
};

window.FT.deleteStock = function(id) {
  if (!confirm('Hapus data stok ini?')) return;
  deleteStock(id);
  showToast('Stok dihapus', 'success'); render();
};

// ===== Attendance Manager Page =====
function renderAttendanceManager() {
  const attendance = getAttendance();
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="attSearch" placeholder="🔍 Cari karyawan..." oninput="FT.filterAttendance()">
        <select class="select" id="attStatusFilter" style="width:160px;" onchange="FT.filterAttendance()">
          <option value="">Semua Status</option>
          <option>hadir</option><option>terlambat</option><option>tidak hadir</option>
        </select>
        <div class="spacer"></div>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="attTable">
          <thead><tr><th>Karyawan</th><th>Tanggal</th><th>Check In</th><th>Lokasi</th><th>Status</th></tr></thead>
          <tbody>
            ${attendance.length === 0 ? `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">✅</div><h3>Belum ada data absensi</h3></div></td></tr>` :
            attendance.map(a => {
              const emp = empMap[a.employeeId];
              if (!emp) return '';
              return `
                <tr>
                  <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatar" style="width:28px;height:28px;font-size:11px;background:${['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'][emp.name.charCodeAt(0)%6]};">${getInitials(emp.name)}</div><span style="font-weight:600;">${emp.name}</span></div></td>
                  <td>${formatDateShort(a.date)}</td>
                  <td>${a.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td style="font-size:13px;">${a.checkInLocation || '-'}</td>
                  <td>${statusBadge(a.status)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterAttendance = function() {
  const search = document.getElementById('attSearch').value.toLowerCase();
  const status = document.getElementById('attStatusFilter').value;
  document.querySelectorAll('#attTable tbody tr').forEach(row => {
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (status && !row.textContent.toLowerCase().includes(status)) show = false;
    row.style.display = show ? '' : 'none';
  });
};

// ===== Leaves Manager Page =====
function renderLeavesManager() {
  const leaves = getLeaves().sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const accMap = Object.fromEntries(getAccounts().map(a => [a.id, a.name || a.email]));
  const pending = leaves.filter(l => l.status === 'pending');
  return `
    ${pending.length > 0 ? `
      <div class="grid-3" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-icon" style="background:var(--amber-50);color:var(--amber-500);">⏳</div><div class="stat-label">Menunggu Approval</div><div class="stat-value">${pending.length}</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">✅</div><div class="stat-label">Disetujui</div><div class="stat-value">${leaves.filter(l=>l.status==='approved').length}</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:var(--red-50);color:var(--red-500);">❌</div><div class="stat-label">Ditolak</div><div class="stat-value">${leaves.filter(l=>l.status==='rejected').length}</div></div>
      </div>
    ` : ''}
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="leaveSearch" placeholder="🔍 Cari pengajuan..." oninput="FT.filterLeaves()">
        <select class="select" id="leaveStatusFilter" style="width:160px;" onchange="FT.filterLeaves()">
          <option value="">Semua Status</option>
          <option>pending</option><option>approved</option><option>rejected</option>
        </select>
        <div class="spacer"></div>
      </div>
      <div class="visits-table-wrapper">
        <table class="table" id="leaveTable">
          <thead><tr><th>Karyawan</th><th>Tipe</th><th>Mulai</th><th>Sampai</th><th>Hari</th><th>Alasan</th><th>Status</th><th>Approver</th><th></th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📄</div><h3>Belum ada pengajuan</h3></div></td></tr>` :
            leaves.map(l => {
              const emp = empMap[l.employeeId];
              if (!emp) return '';
              return `
                <tr>
                  <td><span style="font-weight:600;">${emp.name}</span></td>
                  <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${l.type}</span></td>
                  <td>${formatDateShort(l.startDate)}</td>
                  <td>${formatDateShort(l.endDate)}</td>
                  <td style="text-align:center; font-weight:600;">${l.days}</td>
                  <td style="max-width:200px; font-size:13px; color:var(--gray-500);">${l.reason}</td>
                  <td>${statusBadge(l.status)}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${l.status === 'pending' ? '-' : (accMap[l.approverId] || '-')}</td>
                  <td>
                    ${l.status === 'pending' ? `
                      <button class="btn btn-primary btn-sm" style="background:var(--green-600);border-color:var(--green-600);" onclick="FT.approveLeave('${l.id}')">✓ Setujui</button>
                      <button class="btn btn-danger btn-sm" style="margin-left:4px;margin-top:4px;" onclick="FT.rejectLeave('${l.id}')">✕ Tolak</button>
                    ` : `<button class="btn btn-secondary btn-sm" onclick="FT.viewLeave('${l.id}')">Detail</button>`}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.filterLeaves = function() {
  const search = document.getElementById('leaveSearch').value.toLowerCase();
  const status = document.getElementById('leaveStatusFilter').value;
  document.querySelectorAll('#leaveTable tbody tr').forEach(row => {
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (status && !row.textContent.toLowerCase().includes(status)) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.approveLeave = function(id) {
  updateLeave(id, { status: 'approved', approverId: state.account.id, approvedAt: new Date().toISOString().slice(0,10) });
  showToast('Pengajuan disetujui', 'success'); render();
};

window.FT.rejectLeave = function(id) {
  updateLeave(id, { status: 'rejected', approverId: state.account.id, approvedAt: new Date().toISOString().slice(0,10) });
  showToast('Pengajuan ditolak', 'success'); render();
};

window.FT.viewLeave = function(id) {
  const l = getLeaves().find(x => x.id === id);
  if (!l) return;
  const emp = getEmployees().find(e => e.id === l.employeeId);
  const accMap = Object.fromEntries(getAccounts().map(a => [a.id, a.name || a.email]));
  openModal('Detail Pengajuan', `
    <div class="detail-grid">
      <div class="detail-label">Karyawan</div><div class="detail-value">${emp ? emp.name : '-'}</div>
      <div class="detail-label">Tipe</div><div class="detail-value">${l.type}</div>
      <div class="detail-label">Mulai</div><div class="detail-value">${formatDate(l.startDate)}</div>
      <div class="detail-label">Sampai</div><div class="detail-value">${formatDate(l.endDate)}</div>
      <div class="detail-label">Durasi</div><div class="detail-value">${l.days} hari</div>
      <div class="detail-label">Alasan</div><div class="detail-value full">${l.reason}</div>
      <div class="detail-label">Status</div><div class="detail-value">${statusBadge(l.status)}</div>
      <div class="detail-label">Diajukan</div><div class="detail-value">${formatDateShort(l.submittedAt)}</div>
      <div class="detail-label">Approver</div><div class="detail-value">${accMap[l.approverId] || '-'}</div>
    </div>
    <div class="modal-footer" style="padding:24px 0 0;">
      <button class="btn btn-secondary" onclick="FT.closeModal()">Tutup</button>
    </div>
  `);
};

// ===== My Attendance (Employee) =====
function renderMyAttendance() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  const records = getAttendance().filter(a => a.employeeId === empId).sort((a,b) => b.date.localeCompare(a.date));
  const summary = {
    hadir: records.filter(r => r.status === 'hadir').length,
    terlambat: records.filter(r => r.status === 'terlambat').length,
    tidakHadir: records.filter(r => r.status === 'tidak hadir').length,
  };
  return `
    <div class="grid-3" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">✅</div><div class="stat-label">Hadir</div><div class="stat-value">${summary.hadir}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--amber-50);color:var(--amber-500);">⏰</div><div class="stat-label">Terlambat</div><div class="stat-value">${summary.terlambat}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--red-50);color:var(--red-500);">❌</div><div class="stat-label">Tidak Hadir</div><div class="stat-value">${summary.tidakHadir}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Riwayat Absensi</div>
      <div class="card-subtitle">${emp ? emp.name : ''} — ${records.length} catatan</div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Tanggal</th><th>Check In</th><th>Lokasi Check In</th><th>Status</th></tr></thead>
          <tbody>
            ${records.length === 0 ? `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">✅</div><h3>Belum ada riwayat absensi</h3></div></td></tr>` :
            records.map(a => `
              <tr>
                <td>${formatDateShort(a.date)}</td>
                <td>${a.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                <td style="font-size:13px;">${a.checkInLocation || '-'}</td>
                <td>${statusBadge(a.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== My Leaves (Employee) =====
function renderMyLeaves() {
  const empId = myEmployeeId();
  const leaves = getLeavesByEmployee(empId).sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));
  const leaveTypes = getLeaveTypes();
  const pending = leaves.filter(l => l.status === 'pending').length;
  const approved = leaves.filter(l => l.status === 'approved').length;

  return `
    <div class="grid-3" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-icon" style="background:var(--amber-50);color:var(--amber-500);">⏳</div><div class="stat-label">Menunggu</div><div class="stat-value">${pending}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">✅</div><div class="stat-label">Disetujui</div><div class="stat-value">${approved}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">📄</div><div class="stat-label">Total Pengajuan</div><div class="stat-value">${leaves.length}</div></div>
    </div>
    <div class="card">
      <div class="filter-row">
        <div class="card-title" style="margin:0;">Pengajuan Ijin & Cuti Saya</div>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openMyLeaveModal()">+ Ajukan Ijin/Cuti</button>
      </div>
      <div class="visits-table-wrapper" style="margin-top:16px;">
        <table class="table">
          <thead><tr><th>Tipe</th><th>Mulai</th><th>Sampai</th><th>Hari</th><th>Alasan</th><th>Status</th><th>Diajukan</th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📄</div><h3>Belum ada pengajuan</h3><p>Klik "Ajukan Ijin/Cuti" untuk membuat baru</p></div></td></tr>` :
            leaves.map(l => `
              <tr>
                <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${l.type}</span></td>
                <td>${formatDateShort(l.startDate)}</td>
                <td>${formatDateShort(l.endDate)}</td>
                <td style="text-align:center; font-weight:600;">${l.days}</td>
                <td style="max-width:200px; font-size:13px; color:var(--gray-500);">${l.reason}</td>
                <td>${statusBadge(l.status)}</td>
                <td style="font-size:12px; color:var(--gray-400);">${formatDateShort(l.submittedAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.FT.openMyLeaveModal = function() {
  const leaveTypes = getLeaveTypes();
  openModal('Ajukan Ijin / Cuti', `
    <form onsubmit="FT.createMyLeave(event)">
      <div class="form-group">
        <label class="label">Tipe</label>
        <select class="select" name="type" required>
          ${leaveTypes.map(t => `<option>${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Tanggal Mulai</label><input class="input" type="date" name="startDate" id="leaveStart" required onchange="FT.calcLeaveDays()"></div>
        <div class="form-group"><label class="label">Tanggal Selesai</label><input class="input" type="date" name="endDate" id="leaveEnd" required onchange="FT.calcLeaveDays()"></div>
      </div>
      <div class="form-group">
        <label class="label">Durasi (hari)</label>
        <input class="input" type="number" name="days" id="leaveDays" value="1" readonly style="background:var(--gray-50);">
      </div>
      <div class="form-group">
        <label class="label">Alasan</label>
        <textarea class="textarea" name="reason" placeholder="Jelaskan alasan pengajuan..." required></textarea>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Kirim Pengajuan</button>
      </div>
    </form>
  `);
};

window.FT.calcLeaveDays = function() {
  const start = document.getElementById('leaveStart').value;
  const end = document.getElementById('leaveEnd').value;
  if (start && end) {
    const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    document.getElementById('leaveDays').value = diff > 0 ? diff : 1;
  }
};

window.FT.createMyLeave = function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.employeeId = myEmployeeId();
  data.days = parseInt(data.days);
  createLeave(data);
  closeModal(); showToast('Pengajuan terkirim, menunggu approval', 'success'); render();
};

// ===== Generic table filter helper =====
window.FT.filterTable = function(tableId, searchId) {
  const search = document.getElementById(searchId).value.toLowerCase();
  document.querySelectorAll('#' + tableId + ' tbody tr').forEach(row => {
    row.style.display = (!search || row.textContent.toLowerCase().includes(search)) ? '' : 'none';
  });
};


// ===== Employee: My Stocks (only visited outlets) =====
function renderMyStocks() {
  const empId = myEmployeeId();
  const visitedIds = getVisitedOutletIds(empId);
  const outlets = getOutlets().filter(o => visitedIds.includes(o.id));
  const allStocks = getStocks().filter(s => visitedIds.includes(s.outletId));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(outlets.map(o => [o.id, o]));
  const lowStocks = allStocks.filter(s => s.quantity <= s.minStock);

  // Also get active (checked-in) visits for quick stock input
  const activeVisits = getVisits().filter(v => v.employeeId === empId && v.status === 'checked-in');

  return `
    ${activeVisits.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-color:var(--blue-300); background:var(--blue-50);">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="font-size:28px;">📍</div>
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--blue-700);">Sedang di Outlet</div>
            <div style="font-size:13px; color:var(--blue-500);">Update stok langsung dari kunjungan aktif</div>
          </div>
        </div>
        ${activeVisits.map(v => {
          const o = outletMap[v.outletId] || getOutlets().find(x => x.id === v.outletId);
          return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:white; border-radius:10px; margin-bottom:8px;">
              <div style="font-size:24px;">${o ? outletIcon(o.type) : '🏪'}</div>
              <div style="flex:1;">
                <div style="font-weight:600;">${o?.name || v.outletId}</div>
                <div style="font-size:12px; color:var(--gray-400);">Check in: ${v.checkInTime}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="FT.openVisitStockInput('${v.id}', '${v.outletId}')">Update Stok</button>
              <button class="btn btn-secondary btn-sm" onclick="FT.openVisitPriceInput('${v.id}', '${v.outletId}')">Catat Harga</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    ${lowStocks.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-color:var(--red-500); background:var(--red-50);">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="font-size:28px;">⚠️</div>
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--red-700);">${lowStocks.length} Produk Stok Menipis</div>
            <div style="font-size:13px; color:var(--red-500);">Di outlet yang pernah Anda kunjungi</div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">Stok Outlet yang Dikunjungi</div>
      <div class="card-subtitle">${outlets.length} outlet · ${allStocks.length} record stok</div>
      ${allStocks.length === 0 ? `<div class="empty-state"><div class="empty-icon">📊</div><h3>Belum ada data stok</h3><p>Update stok saat check-in di outlet</p></div>` : `
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Outlet</th><th>Produk</th><th>Qty</th><th>Min</th><th>Status</th><th>Update</th><th></th></tr></thead>
          <tbody>
            ${allStocks.map(s => {
              const p = productMap[s.productId];
              const o = outletMap[s.outletId];
              if (!p || !o) return '';
              const isLow = s.quantity <= s.minStock;
              return `
                <tr>
                  <td>${outletIcon(o.type)} ${o.name}</td>
                  <td><span style="font-weight:600;">${p.name}</span><br><span style="font-size:11px;color:var(--gray-400);">${p.sku}</span></td>
                  <td style="font-weight:700;color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px;color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  <td><button class="btn btn-secondary btn-sm" onclick="FT.editStock('${s.id}')">Edit</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>
  `;
}

// ===== Employee: My Prices (Harga & Diskon) =====
function renderMyPrices() {
  const empId = myEmployeeId();
  const visitedIds = getVisitedOutletIds(empId);
  const observations = getPriceObservations().filter(p => visitedIds.includes(p.outletId));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));

  // Active visits for quick input
  const activeVisits = getVisits().filter(v => v.employeeId === empId && v.status === 'checked-in');

  // Group by outlet for summary
  const byOutlet = {};
  observations.forEach(obs => {
    if (!byOutlet[obs.outletId]) byOutlet[obs.outletId] = [];
    byOutlet[obs.outletId].push(obs);
  });

  return `
    ${activeVisits.length > 0 ? `
      <div class="card" style="margin-bottom:20px; border-color:var(--amber-300); background:#fffbeb;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="font-size:28px;">💰</div>
          <div>
            <div style="font-size:15px; font-weight:700; color:var(--amber-700);">Catat Harga Saat Ini</div>
            <div style="font-size:13px; color:var(--amber-600);">Anda sedang di outlet — catat harga & diskon yang teramati</div>
          </div>
        </div>
        ${activeVisits.map(v => {
          const o = outletMap[v.outletId];
          return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:white; border-radius:10px; margin-bottom:8px;">
              <div style="font-size:24px;">${o ? outletIcon(o.type) : '🏪'}</div>
              <div style="flex:1;">
                <div style="font-weight:600;">${o?.name || v.outletId}</div>
                <div style="font-size:12px; color:var(--gray-400);">Check in: ${v.checkInTime}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="FT.openVisitPriceInput('${v.id}', '${v.outletId}')">+ Catat Harga/Diskon</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="grid-3" style="margin-bottom:20px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">💰</div>
        <div class="stat-label">Total Observasi</div>
        <div class="stat-value">${observations.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber-500);">🏷️</div>
        <div class="stat-label">Ada Diskon</div>
        <div class="stat-value">${observations.filter(o => o.discountPercent > 0 || o.discountAmount > 0).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">🏪</div>
        <div class="stat-label">Outlet</div>
        <div class="stat-value">${Object.keys(byOutlet).length}</div>
      </div>
    </div>

    <div class="card">
      <div class="filter-row">
        <div class="card-title" style="margin:0;">Riwayat Harga & Diskon</div>
        <div class="spacer"></div>
        <button class="btn btn-primary" onclick="FT.openPriceObsModal()">+ Catat Observasi</button>
      </div>
      <div class="card-subtitle" style="margin-top:8px;">Data dari outlet yang pernah Anda kunjungi</div>
      ${observations.length === 0 ? `<div class="empty-state"><div class="empty-icon">💰</div><h3>Belum ada data harga</h3><p>Catat harga saat kunjungan ke outlet</p></div>` : `
      <div class="visits-table-wrapper" style="margin-top:12px;">
        <table class="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Outlet</th>
              <th>Produk</th>
              <th>Harga Teramati</th>
              <th>Diskon</th>
              <th>Harga Resmi</th>
              <th>Selisih</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${observations.sort((a,b) => (b.recordedAt||'').localeCompare(a.recordedAt||'')).map(obs => {
              const p = productMap[obs.productId];
              const o = outletMap[obs.outletId];
              if (!p || !o) return '';
              const official = p.price;
              const diff = obs.observedPrice - official;
              const diffStr = diff === 0 ? '-' : (diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff));
              const diffColor = diff > 0 ? 'var(--red-500)' : diff < 0 ? 'var(--green-600)' : 'var(--gray-400)';
              const discStr = obs.discountPercent > 0
                ? `${obs.discountPercent}%${obs.discountAmount ? ' (Rp '+obs.discountAmount.toLocaleString('id-ID')+')' : ''}`
                : (obs.discountAmount > 0 ? 'Rp '+obs.discountAmount.toLocaleString('id-ID') : '-');
              return `
                <tr>
                  <td style="font-size:13px;">${formatDateShort(obs.recordedAt)}</td>
                  <td>${outletIcon(o.type)} ${o.name}</td>
                  <td><span style="font-weight:600;">${p.name}</span><br><span style="font-size:11px;color:var(--gray-400);">${p.sku}</span></td>
                  <td style="font-weight:700;">${formatCurrency(obs.observedPrice)}</td>
                  <td>${discStr !== '-' ? '<span style="color:var(--amber-600);font-weight:600;">'+discStr+'</span>' : '-'}</td>
                  <td style="color:var(--gray-400);">${formatCurrency(official)}</td>
                  <td style="font-weight:600;color:${diffColor};">${diffStr}</td>
                  <td style="font-size:12px;color:var(--gray-500);max-width:160px;">${obs.notes || '-'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>
  `;
}

// ===== Stock input during visit =====
window.FT.openVisitStockInput = function(visitId, outletId) {
  const outlet = getOutlets().find(o => o.id === outletId);
  const stocks = getStocksByOutlet(outletId);
  const products = getProducts().filter(p => p.status === 'active');
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  openModal('Update Stok — ' + (outlet?.name || outletId), `
    <div style="margin-bottom:16px; padding:12px; background:var(--blue-50); border-radius:10px; font-size:13px; color:var(--blue-700);">
      📍 Update stok produk di outlet ini berdasarkan pengamatan lapangan
    </div>
    <form onsubmit="FT.saveVisitStock(event, '${visitId}', '${outletId}')">
      <div class="form-group">
        <label class="label">Produk</label>
        <select class="select" name="productId" id="stockProductSelect" required onchange="FT.prefillStockQty('${outletId}')">
          <option value="">— Pilih produk —</option>
          ${products.map(p => {
            const existing = stocks.find(s => s.productId === p.id);
            return `<option value="${p.id}" data-qty="${existing ? existing.quantity : ''}" data-min="${existing ? existing.minStock : 5}">${p.name} (${p.sku})${existing ? ' — stok: '+existing.quantity : ''}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Quantity Saat Ini</label>
          <input class="input" type="number" name="quantity" id="stockQtyInput" required min="0">
        </div>
        <div class="form-group">
          <label class="label">Min. Stok</label>
          <input class="input" type="number" name="minStock" id="stockMinInput" value="5" required min="0">
        </div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Stok</button>
      </div>
    </form>
  `);
};

window.FT.prefillStockQty = function(outletId) {
  const sel = document.getElementById('stockProductSelect');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.qty !== undefined && opt.dataset.qty !== '') {
    document.getElementById('stockQtyInput').value = opt.dataset.qty;
    document.getElementById('stockMinInput').value = opt.dataset.min || 5;
  } else {
    document.getElementById('stockQtyInput').value = '';
    document.getElementById('stockMinInput').value = 5;
  }
};

window.FT.saveVisitStock = function(e, visitId, outletId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const productId = fd.get('productId');
  const quantity = parseInt(fd.get('quantity'));
  const minStock = parseInt(fd.get('minStock'));
  const empId = myEmployeeId();

  // Update existing or create new
  const existing = getStocksByOutlet(outletId).find(s => s.productId === productId);
  if (existing) {
    updateStock(existing.id, { quantity, minStock, updatedBy: empId });
  } else {
    createStock({ outletId, productId, quantity, minStock, updatedBy: empId });
  }
  closeModal();
  showToast('Stok berhasil diupdate', 'success');
  render();
};

// ===== Price/Discount input during visit =====
window.FT.openVisitPriceInput = function(visitId, outletId) {
  const outlet = getOutlets().find(o => o.id === outletId);
  const products = getProducts().filter(p => p.status === 'active');

  openModal('Catat Harga & Diskon — ' + (outlet?.name || outletId), `
    <div style="margin-bottom:16px; padding:12px; background:#fffbeb; border-radius:10px; font-size:13px; color:var(--amber-700);">
      💰 Catat harga jual dan diskon yang teramati di outlet ini
    </div>
    <form onsubmit="FT.saveVisitPrice(event, '${visitId}', '${outletId}')">
      <div class="form-group">
        <label class="label">Produk</label>
        <select class="select" name="productId" required>
          <option value="">— Pilih produk —</option>
          ${products.map(p => `<option value="${p.id}">${p.name} (${p.sku}) — resmi: ${formatCurrency(p.price)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Harga Teramati (Rp)</label>
        <input class="input" type="number" name="observedPrice" required min="0" placeholder="Harga yang terlihat di toko">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Diskon (%)</label>
          <input class="input" type="number" name="discountPercent" value="0" min="0" max="100" step="0.5">
        </div>
        <div class="form-group">
          <label class="label">Diskon Nominal (Rp)</label>
          <input class="input" type="number" name="discountAmount" value="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="label">Catatan</label>
        <textarea class="textarea" name="notes" placeholder="Promo, kompetitor, perubahan harga, dll..."></textarea>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Observasi</button>
      </div>
    </form>
  `);
};

window.FT.saveVisitPrice = function(e, visitId, outletId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const empId = myEmployeeId();
  createPriceObservation({
    visitId,
    outletId,
    productId: fd.get('productId'),
    observedPrice: parseInt(fd.get('observedPrice')),
    discountPercent: parseFloat(fd.get('discountPercent')) || 0,
    discountAmount: parseInt(fd.get('discountAmount')) || 0,
    notes: fd.get('notes') || '',
    recordedBy: empId,
  });
  closeModal();
  showToast('Observasi harga berhasil dicatat', 'success');
  render();
};

// ===== Standalone price observation modal (from My Prices page) =====
window.FT.openPriceObsModal = function() {
  const empId = myEmployeeId();
  const visitedIds = getVisitedOutletIds(empId);
  const outlets = getOutlets().filter(o => visitedIds.includes(o.id));
  const products = getProducts().filter(p => p.status === 'active');
  // Get latest visit per outlet for linking
  const myVisits = getVisits().filter(v => v.employeeId === empId);

  openModal('Catat Observasi Harga', `
    <form onsubmit="FT.saveStandalonePrice(event)">
      <div class="form-group">
        <label class="label">Outlet (yang pernah dikunjungi)</label>
        <select class="select" name="outletId" required>
          <option value="">— Pilih outlet —</option>
          ${outlets.map(o => `<option value="${o.id}">${outletIcon(o.type)} ${o.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Produk</label>
        <select class="select" name="productId" required>
          <option value="">— Pilih produk —</option>
          ${products.map(p => `<option value="${p.id}">${p.name} — resmi: ${formatCurrency(p.price)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Harga Teramati (Rp)</label>
        <input class="input" type="number" name="observedPrice" required min="0">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Diskon (%)</label>
          <input class="input" type="number" name="discountPercent" value="0" min="0" max="100">
        </div>
        <div class="form-group">
          <label class="label">Diskon (Rp)</label>
          <input class="input" type="number" name="discountAmount" value="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="label">Catatan</label>
        <textarea class="textarea" name="notes" placeholder="Keterangan tambahan..."></textarea>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.saveStandalonePrice = function(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const empId = myEmployeeId();
  const outletId = fd.get('outletId');
  // Link to most recent visit at this outlet if available
  const recentVisit = getVisits().filter(v => v.employeeId === empId && v.outletId === outletId)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
  createPriceObservation({
    visitId: recentVisit?.id || null,
    outletId,
    productId: fd.get('productId'),
    observedPrice: parseInt(fd.get('observedPrice')),
    discountPercent: parseFloat(fd.get('discountPercent')) || 0,
    discountAmount: parseInt(fd.get('discountAmount')) || 0,
    notes: fd.get('notes') || '',
    recordedBy: empId,
  });
  closeModal();
  showToast('Observasi harga berhasil dicatat', 'success');
  render();
};


// ===== Mobile Simulation =====
function renderMobileSim() {
  const employees = getEmployees().filter(e => e.role === 'Field Sales');
  const myId = myEmployeeId();
  if (!isManager() && myId) {
    state.selectedMobileEmp = myId;
  }
  const current = employees.find(e => e.id === state.selectedMobileEmp) || employees[0];
  if (current) state.selectedMobileEmp = current.id;
  const visits = getVisits().filter(v => v.employeeId === (current?.id) && v.date === '2024-07-27');
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const att = getAttendance().find(a => a.employeeId === current?.id && a.date === '2024-07-27');

  const tabs = [
    { id: 'home',   icon: '🏠', label: 'Beranda' },
    { id: 'visits', icon: '📋', label: 'Kunjungan' },
    { id: 'route',  icon: '🗺️', label: 'Rute' },
    { id: 'profile', icon: '👤', label: 'Profil' },
  ];

  let screenContent = '';
  if (state.mobileTab === 'home') {
    screenContent = `
      <div class="mobile-sim-header">
        <div>
          <div style="font-size:12px; opacity:0.8;">Selamat datang,</div>
          <h2>${current?.name || 'Field Sales'}</h2>
        </div>
        <div class="avatar avatar-lg" style="background:rgba(255,255,255,0.2);">${current ? getInitials(current.name) : '?'}</div>
      </div>
      <div class="mobile-sim-body">
        <div style="display:flex; gap:8px; margin-bottom:16px; overflow-x:auto;">
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
        </div>

        <div class="mobile-card" style="background:linear-gradient(135deg,#ea580c,#c2410c); color:white; border:none;">
          <div style="font-size:12px; opacity:0.8;">Status Absensi</div>
          ${att ? `
            <div style="font-size:20px; font-weight:800; margin-top:4px;">${att.status === 'hadir' ? '✅ Hadir' : att.status === 'terlambat' ? '⏰ Terlambat' : '❌ Tidak Hadir'}</div>
            <div style="font-size:13px; opacity:0.8; margin-top:4px;">Check in: ${att.checkInTime || '-'} · ${att.checkInLocation || '-'}</div>
          ` : '<div style="margin-top:8px; font-size:14px;">Belum check in hari ini</div>'}
        </div>

        <div class="mobile-section-title">Statistik Hari Ini</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
          <div class="mobile-card" style="text-align:center;">
            <div style="font-size:28px; font-weight:800; color:var(--blue-600);">${current?.todayVisits || 0}</div>
            <div style="font-size:12px; color:var(--gray-400);">Kunjungan</div>
          </div>
          <div class="mobile-card" style="text-align:center;">
            <div style="font-size:28px; font-weight:800; color:var(--green-600);">${visits.filter(v => v.status === 'completed').length}</div>
            <div style="font-size:12px; color:var(--gray-400);">Selesai</div>
          </div>
        </div>

        <div class="mobile-section-title">Kunjungan Mendatang</div>
        ${visits.filter(v => v.status === 'planned').length === 0 ? `<div class="mobile-card" style="text-align:center; color:var(--gray-400); font-size:13px;">Tidak ada kunjungan terjadwal</div>` :
          visits.filter(v => v.status === 'planned').map(v => { const o = outletMap[v.outletId]; return `
            <div class="mobile-card">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:24px;">${o ? outletIcon(o.type) : '🏪'}</div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:600;">${o?.name || '?'}</div>
                  <div style="font-size:12px; color:var(--gray-400);">${o?.address || ''}</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="FT.mobileCheckIn('${v.id}')">Check In</button>
              </div>
            </div>
          `; }).join('')
        }

        <div class="mobile-section-title">Sedang Berlangsung</div>
        ${visits.filter(v => v.status === 'checked-in').length === 0 ? `<div class="mobile-card" style="text-align:center; color:var(--gray-400); font-size:13px;">Tidak ada kunjungan aktif</div>` :
          visits.filter(v => v.status === 'checked-in').map(v => { const o = outletMap[v.outletId]; return `
            <div class="mobile-card" style="border-color:var(--blue-300); background:var(--blue-50);">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="font-size:24px;">${o ? outletIcon(o.type) : '🏪'}</div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:600;">${o?.name || '?'}</div>
                  <div style="font-size:12px; color:var(--blue-600);">⏱️ Check in: ${v.checkInTime}</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="FT.mobileCheckOut('${v.id}')">Check Out</button>
              </div>
            </div>
          `; }).join('')
        }
      </div>
    `;
  } else if (state.mobileTab === 'visits') {
    screenContent = `
      <div class="mobile-sim-header"><h2>Kunjungan Saya</h2></div>
      <div class="mobile-sim-body">
        <div style="display:flex; gap:8px; margin-bottom:16px; overflow-x:auto;">
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
        </div>
        <div class="mobile-section-title">Hari Ini (27 Jul 2024)</div>
        ${visits.length === 0 ? `<div class="mobile-card" style="text-align:center; color:var(--gray-400);">Belum ada kunjungan</div>` :
          visits.map(v => { const o = outletMap[v.outletId]; return `
            <div class="mobile-card">
              <div style="display:flex; align-items:flex-start; gap:10px;">
                <div style="font-size:24px;">${o ? outletIcon(o.type) : '🏪'}</div>
                <div style="flex:1;">
                  <div style="font-size:14px; font-weight:600;">${o?.name || '?'}</div>
                  <div style="font-size:12px; color:var(--gray-400); margin-bottom:6px;">${o?.address || ''}</div>
                  <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    ${statusBadge(v.status)}
                    ${v.checkInTime ? `<span style="font-size:11px; color:var(--gray-400);">⏱ ${v.checkInTime}${v.checkOutTime ? ` → ${v.checkOutTime}` : ''}</span>` : ''}
                  </div>
                  ${v.notes ? `<div style="font-size:12px; color:var(--gray-500); margin-top:6px; font-style:italic;">"${v.notes}"</div>` : ''}
                </div>
              </div>
            </div>
          `; }).join('')
        }
      </div>
    `;
  } else if (state.mobileTab === 'route') {
      const todayPlanned = visits.filter(v => v.status === 'planned' || v.status === 'checked-in');
      const completed = visits.filter(v => v.status === 'completed');
      screenContent = `
      <div class="mobile-sim-header"><h2>Rute Kunjungan</h2></div>
      <div class="mobile-sim-body">
        <div style="display:flex; gap:8px; margin-bottom:16px; overflow-x:auto;">
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
        </div>
        <div class="mobile-card" style="background:var(--blue-50); border-color:var(--blue-200); margin-bottom:16px;">
          <div style="font-size:13px; color:var(--blue-700); font-weight:600;">📍 ${todayPlanned.length} kunjungan tersisa · ${completed.length} selesai</div>
        </div>
        <div style="position:relative; padding-left:24px;">
          <div style="position:absolute; left:7px; top:8px; bottom:8px; width:2px; background:var(--gray-200);"></div>
          ${visits.map((v, i) => {
            const o = outletMap[v.outletId];
            const dotColor = v.status === 'completed' ? 'var(--green-500)' : v.status === 'checked-in' ? 'var(--blue-500)' : 'var(--gray-300)';
            return `
              <div style="position:relative; margin-bottom:16px; padding-left:8px;">
                <div style="position:absolute; left:-22px; top:4px; width:14px; height:14px; border-radius:50%; background:${dotColor}; border:3px solid white; box-shadow:0 0 0 1px var(--gray-200);"></div>
                <div style="font-size:11px; color:var(--gray-400); font-weight:600;">STOP #${i+1}</div>
                <div style="font-size:14px; font-weight:600; color:var(--gray-800);">${o ? outletIcon(o.type)+' '+o.name : '?'}</div>
                <div style="font-size:12px; color:var(--gray-400);">${o?.address || ''}</div>
                <div style="margin-top:4px;">${statusBadge(v.status)} ${v.checkInTime ? `<span style="font-size:11px; color:var(--gray-400);">· ${v.checkInTime}</span>` : ''}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else if (state.mobileTab === 'profile') {
      const myVisits = getVisits().filter(v => v.employeeId === current?.id);
      screenContent = `
      <div class="mobile-sim-header"><h2>Profil Saya</h2></div>
      <div class="mobile-sim-body">
        <div style="text-align:center; margin-bottom:20px;">
          <div class="avatar avatar-lg" style="background:var(--blue-600); margin:0 auto 12px;">${current ? getInitials(current.name) : '?'}</div>
          <div style="font-size:18px; font-weight:800;">${current?.name || '-'}</div>
          <div style="font-size:13px; color:var(--gray-400);">${current?.role} · ${current?.area}</div>
        </div>
        <div class="mobile-card">
          <div class="mobile-section-title" style="font-size:14px; margin-bottom:8px;">Informasi</div>
          <div class="mobile-info-row"><span class="label">ID Karyawan</span><span class="value">${current?.id}</span></div>
          <div class="mobile-info-row"><span class="label">Email</span><span class="value" style="font-size:12px;">${current?.email}</span></div>
          <div class="mobile-info-row"><span class="label">Telepon</span><span class="value">${current?.phone}</span></div>
          <div class="mobile-info-row"><span class="label">Bergabung</span><span class="value">${current ? formatDateShort(current.joinDate) : '-'}</span></div>
        </div>
        <div class="mobile-card">
          <div class="mobile-section-title" style="font-size:14px; margin-bottom:8px;">Statistik</div>
          <div class="mobile-info-row"><span class="label">Kunjungan Hari Ini</span><span class="value">${current?.todayVisits} / ${current?.targetVisits}</span></div>
          <div class="mobile-info-row"><span class="label">Total Kunjungan</span><span class="value">${current?.totalVisits}</span></div>
          <div class="mobile-info-row"><span class="label">Total Riwayat</span><span class="value">${myVisits.length}</span></div>
          <div style="margin-top:12px;">
            <div style="font-size:12px; color:var(--gray-400); margin-bottom:6px;">Progress hari ini</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${current ? Math.round(current.todayVisits/current.targetVisits*100) : 0}%;"></div></div>
          </div>
        </div>
        <button class="btn btn-danger" style="width:100%; justify-content:center;" onclick="FT.logout()">Keluar</button>
      </div>
    `;
  }

  return `
    <div style="padding:32px 20px;">
      <div style="text-align:center; margin-bottom:24px;">
        <h1 style="font-size:20px; font-weight:800; color:var(--gray-900);">Simulasi Mobile App</h1>
        <p style="font-size:14px; color:var(--gray-400);">Tampilan field sales di perangkat mobile</p>
      </div>
      <div class="mobile-sim-frame">
        <div class="mobile-sim-screen">${screenContent}</div>
        <div class="mobile-bottom-nav">
          ${tabs.map(t => `
            <button class="mobile-nav-item ${state.mobileTab === t.id ? 'active' : ''}" onclick="FT.setMobileTab('${t.id}')">
              <span class="mobile-nav-icon">${t.icon}</span>
              <span>${t.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

window.FT.setMobileTab = function(tab) { state.mobileTab = tab; render(); };
window.FT.selectMobileEmp = function(id) { state.selectedMobileEmp = id; render(); };

window.FT.mobileCheckIn = function(visitId) {
  updateVisit(visitId, { status: 'checked-in', checkInTime: new Date().toTimeString().slice(0,5) });
  showToast('Berhasil check in!', 'success'); render();
};
window.FT.mobileCheckOut = function(visitId) {
  updateVisit(visitId, { status: 'completed', checkOutTime: new Date().toTimeString().slice(0,5) });
  showToast('Berhasil check out!', 'success'); render();
};

// ===== Modal Helper =====
function openModal(title, content) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()">
      <div class="modal">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" onclick="FT.closeModal()">✕</button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    </div>
  `;
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
window.FT.closeModal = closeModal;

// ===== Page-specific handler attachments =====
function attachPageHandlers() {
  // nothing extra needed; handlers are global via window.FT
}
function attachMobileHandlers() {
  // nothing extra needed
}

// ===== Init =====
function init() {
  // Initialize DB
  getDB();
  state.route = getRoute();
  render();
}

init();
