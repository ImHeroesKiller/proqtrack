// ProQTrack — Main Application Module
// Simple hash-based router + global state + page renderers

import {
  getDashboardStats, getEmployees, getOutlets, getVisits, getAttendance, getVisitsByEmployee,
  resetDB, authenticate, createVisit, updateVisit, createEmployee, updateEmployee,
  createOutlet, updateOutlet, deleteEmployee, deleteOutlet, deleteVisit, getDB, getAccounts,
  getProducts, createProduct, updateProduct, deleteProduct,
  getLeaves, getLeavesByEmployee, getLeaveTypes, createLeave, updateLeave, deleteLeave,
  getStocks, getStocksByOutlet, getStocksByProduct, createStock, updateStock, deleteStock,
  getPriceObservations, getPriceObservationsByOutlet, getPriceObservationsByVisit,
  getPriceObservationsByEmployee, createPriceObservation, updatePriceObservation, deletePriceObservation,
  getVisitedOutletIds, getProductsForVisitedOutlets,
  getCompetitors, createCompetitor, updateCompetitor, deleteCompetitor,
  getCompetitorProducts, getCompetitorProductsByCompetitor, createCompetitorProduct,
  updateCompetitorProduct, deleteCompetitorProduct,
  getCompetitorIntel, createCompetitorIntel, updateCompetitorIntel, deleteCompetitorIntel,
  getCompetitorAnalysisSummary,
  getPromoTypes, getPromoTypeLabel,
  getFieldPhotos, getFieldPhotosByEmployee, getAccessibleFieldPhotos,
  createFieldPhoto, deleteFieldPhoto, FIELD_PHOTO_TYPES, getAppSettings,
  getOrganization, getCurrentOrgId,
  getVisitsOnDate, visitDay, getAttendancePoints, getOutletProposals,
  canEmployeeAddStore, formatOutletLabel, getProjectStoreSettings, defaultStoreCatalog,
  getProductSales, createProductSale, deleteProductSale, monthSalesAmount,
  registerTestDevice, getActor, resetDB as resetDatabase,
  isOrgAdminRole, isProjectAdminRole,
} from './lib/db.js';
import { renderLastLocation, attendanceCheckinCard, photoFilterBar, applyPhotoFilters, productPickerRows, renderOutletProposalForm, renderVisitDetailHtml, outletNotesField } from './field-sales.js';
import { renderSettings, renderAccounts } from './account-settings.js';
import { renderOrganizations, renderOrganizationHub, orgSwitcherHtml } from './organization.js';
import {
  formatDate, formatDateShort, getInitials, statusBadge, roleBadge, outletIcon,
  calculateDistance, formatDuration, uid, formatCurrency, visibilityBadge,
  compressImage, photoTypeLabel, todayISO, esc, safePhotoUrl, displayValue,
  normalizeAttendanceStatus,
} from './lib/utils.js';
import { issueUploadSession, clearApiToken, bindAssetFields, uploadAsset, deleteUploadedAsset, assetField } from './lib/uploads.js';
import { refreshOperationalData, cloudDataStatus } from './lib/cloud-data.js';
import { defaultPortrait } from './lib/avatars.js';
import { applyOrganizationBranding } from './lib/organization-branding.js';
import {
  captureDevicePosition, currentTenantTimeHHMM, locationFreshness,
  locationSourceLabel, visitLocationEvidence, assertVisitGeofence, visitGeofenceEvidence,
} from './lib/location-evidence.js';
import { getDeviceIdentity, markSuperadminHost } from './lib/device.js';
import { VISITS_PAGE_SIZE, visitMatchesFilters, paginateVisits, visitCorrectionErrorMessage } from './lib/visit-ui.js';
import { EMPLOYEE_PAGE_SIZE, employeeSyncState, activeAssignmentsForEmployee, activeProjectIdsForEmployee, employeeSearchDocument, employeeMatchesFilters, paginateEmployees } from './lib/team-employee-ui.js';
import { icon as appIcon, iconSvg } from '../assets/icons.js';
import './bulk-employees.js';
import './bulk-master.js';

const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
const jsArg = value => esc(JSON.stringify(String(value ?? '')));

// Make utils available globally for inline handlers
window.FT = {
  formatDate, formatDateShort, getInitials, statusBadge, roleBadge, outletIcon,
  calculateDistance, formatDuration, uid, formatCurrency, visibilityBadge,
  compressImage, photoTypeLabel, getPromoTypeLabel,
  get state() { return state; }, get navigate() { return navigate; },
};

// ===== Global State =====
const state = {
  loggedIn: false,
  account: null,
  user: { name: 'Manager Demo', role: 'Manager', email: 'manager@proqtrack.id' },
  route: '#/',
  sidebarOpen: false,
  sidebarCollapsed: (() => { try { return localStorage.getItem('proqtrack_sidebar_collapsed') === '1'; } catch { return false; } })(),
  selectedEmployee: null,
  selectedMobileEmp: 'EMP001',
  mobileTab: 'home',
  livePolling: null,
  homeRefreshTimer: null,
  homeRefreshInFlight: false,
  homeRefreshedAt: null,
  trackingRefreshTimer: null,
  trackingRefreshInFlight: false,
  trackingRefreshedAt: null,
  visitsRefreshTimer: null,
  visitsRefreshInFlight: false,
  visitsRefreshedAt: null,
};

const PROJECT_MANAGEMENT_ROUTES = new Set([
  '#/clients',
  '#/projects',
  '#/assignments',
  '#/my-projects',
  '#/my-team',
  '#/supervisor-compare',
]);

function isSuperadmin() {
  return getActor()?.role === 'superadmin';
}

function isHead() {
  return getActor()?.role === 'head';
}

function isManager() {
  return getActor()?.role === 'manager';
}

function isOrgAdmin() {
  return isOrgAdminRole(getActor()?.role);
}

function isProjectAdmin() {
  return isProjectAdminRole(getActor()?.role);
}

function isSupervisor() {
  return getActor()?.role === 'supervisor';
}

function canViewTeamOps() {
  return isProjectAdmin() || isSupervisor();
}

function displayRole(account) {
  if (account?.role === 'superadmin') return 'Superadmin';
  if (account?.role === 'head') return 'Head';
  if (account?.role === 'admin') return 'Admin';
  if (account?.role === 'manager') return 'Manager';
  if (account?.role === 'supervisor') return 'Supervisor';
  return 'Field Sales';
}

function defaultRouteFor(account) {
  if (['superadmin', 'head', 'admin', 'manager', 'supervisor'].includes(account?.role)) return '#/';
  return '#/myday';
}

function visitsTodayCount(employeeId) {
  return getVisits().filter(v => v.employeeId === employeeId && visitDay(v) === todayISO()).length;
}

function salesTargetOf(employee) {
  return Number(employee?.salesTargetAmount) || 0;
}

function avatarStyle(person) {
  const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const name = person?.name || '?';
  const color = colors[name.charCodeAt(0) % colors.length];
  const photo = safePhotoUrl(person?.photo);
  const bg = photo ? `background-image:url('${photo}');background-size:cover;background-position:center;font-size:0;` : '';
  return `background:${color};${bg}`;
}

function myEmployeeId() {
  return state.account ? state.account.employeeId : null;
}

function teamFieldView() {
  return isSupervisor() || isProjectAdmin();
}

function visitedOutletIdsForView() {
  if (teamFieldView()) return [...new Set(getVisits().map(v => v.outletId))];
  return getVisitedOutletIds(myEmployeeId());
}

function entityScopeFields(entity = {}) {
  const db = getDB();
  const projects = (db.projects || []).filter(p => !['completed', 'cancelled'].includes(p.status));
  if (!projects.length) return '';
  const selectedProject = entity.projectIds?.[0] || '';
  return `
    <div class="form-group">
      <label class="label">Project / Klien</label>
      <select class="select" name="projectId" required>
        <option value="">Pilih project</option>
        ${projects.map(project => {
          const client = (db.clients || []).find(c => c.id === project.clientId);
          return `<option value="${project.id}" ${selectedProject === project.id ? 'selected' : ''}>${client?.name || 'Tanpa klien'} — ${project.code} / ${project.name}</option>`;
        }).join('')}
      </select>
      <div style="font-size:11px;color:var(--gray-400);margin-top:5px">Outlet/produk hanya tersedia untuk aktivitas pada project ini.</div>
    </div>`;
}

const NAV_ITEMS = [
  { section: 'Main', items: [
    { id: 'dashboard', label: 'Home',            icon: 'home', route: '#/' },
    { id: 'tracking',  label: 'Last Location',   icon: 'tracking', route: '#/tracking' },
    { id: 'visits',    label: 'Visits',          icon: 'visits', route: '#/visits' },
  ]},
  { section: 'Project', items: [
    { id: 'clients',     label: 'Clients',     icon: 'clients', route: '#/clients' },
    { id: 'projects',    label: 'Projects',    icon: 'briefcase', route: '#/projects' },
    { id: 'assignments', label: 'Assignments', icon: 'team', route: '#/assignments' },
  ]},
  { section: 'Management', items: [
    { id: 'employees',  label: 'Employees',        icon: 'employees', route: '#/employees' },
    { id: 'outlets',    label: 'Outlets',          icon: 'outlets', route: '#/outlets' },
    { id: 'outlet-approvals', label: 'Outlet Approvals', icon: 'store', route: '#/outlet-approvals' },
    { id: 'products',   label: 'Products',         icon: 'products', route: '#/products' },
    { id: 'sales',      label: 'Product Sales',    icon: 'chart', route: '#/sales' },
    { id: 'stocks',     label: 'Outlet Stock',     icon: 'stocks', route: '#/stocks' },
    { id: 'attendance', label: 'Attendance',       icon: 'attendance', route: '#/attendance' },
    { id: 'leaves',     label: 'Leave',            icon: 'leaves', route: '#/leaves' },
  ]},
  { section: 'Competitors', items: [
    { id: 'competitors',         label: 'Competitors',         icon: 'competitors', route: '#/competitors' },
    { id: 'competitor-analysis', label: 'Competitor Analysis', icon: 'analysis', route: '#/competitor-analysis' },
  ]},
  { section: 'Field', items: [
    { id: 'field-photos', label: 'Photos & Assets', icon: 'photos', route: '#/field-photos' },
  ]},
  { section: 'Analytics', items: [
    { id: 'reports', label: 'Reports', icon: 'chart', route: '#/reports' },
  ]},
  { section: 'System', items: [
    { id: 'organizations', label: 'Organizations', icon: 'organizations', route: '#/organizations' },
    { id: 'accounts',      label: 'Accounts',      icon: 'accounts', route: '#/accounts' },
    { id: 'settings',      label: 'Settings',      icon: 'settings', route: '#/settings' },
  ]},
];

const NAV_ITEMS_PM = [
  { section: 'Main', items: [
    { id: 'dashboard', label: 'Home',           icon: 'home', route: '#/' },
    { id: 'tracking',  label: 'Last Location',  icon: 'tracking', route: '#/tracking' },
    { id: 'visits',    label: 'Visits',         icon: 'visits', route: '#/visits' },
  ]},
  { section: 'Project', items: [
    { id: 'clients',     label: 'Clients',      icon: 'clients', route: '#/clients' },
    { id: 'projects',    label: 'My Project',   icon: 'briefcase', route: '#/projects' },
    { id: 'assignments', label: 'Assignments',  icon: 'team', route: '#/assignments' },
  ]},
  { section: 'Management', items: [
    { id: 'employees',  label: 'Employees',        icon: 'employees', route: '#/employees' },
    { id: 'outlets',    label: 'Outlets',          icon: 'outlets', route: '#/outlets' },
    { id: 'outlet-approvals', label: 'Outlet Approvals', icon: 'store', route: '#/outlet-approvals' },
    { id: 'products',   label: 'Products',         icon: 'products', route: '#/products' },
    { id: 'sales',      label: 'Product Sales',    icon: 'chart', route: '#/sales' },
    { id: 'stocks',     label: 'Outlet Stock',     icon: 'stocks', route: '#/stocks' },
    { id: 'attendance', label: 'Attendance',       icon: 'attendance', route: '#/attendance' },
    { id: 'leaves',     label: 'Leave',            icon: 'leaves', route: '#/leaves' },
  ]},
  { section: 'Competitors', items: [
    { id: 'competitors',         label: 'Competitors',         icon: 'competitors', route: '#/competitors' },
    { id: 'competitor-analysis', label: 'Competitor Analysis', icon: 'analysis', route: '#/competitor-analysis' },
  ]},
  { section: 'Field', items: [
    { id: 'field-photos', label: 'Photos & Assets', icon: 'photos', route: '#/field-photos' },
  ]},
  { section: 'Analytics', items: [
    { id: 'reports', label: 'Reports', icon: 'chart', route: '#/reports' },
  ]},
  { section: 'System', items: [
    { id: 'settings', label: 'Settings', icon: 'settings', route: '#/settings' },
  ]},
];

const NAV_ITEMS_SUPERVISOR = [
  { section: 'Main', items: [
    { id: 'dashboard', label: 'Home',               icon: 'home', route: '#/' },
    { id: 'myday',     label: 'My Day',             icon: 'calendar', route: '#/myday' },
    { id: 'tracking',  label: 'Team Last Location', icon: 'tracking', route: '#/tracking' },
    { id: 'visits',    label: 'Team Visits',        icon: 'visits', route: '#/visits' },
  ]},
  { section: 'Project', items: [
    { id: 'my-projects',         label: 'My Projects',          icon: 'briefcase', route: '#/my-projects' },
    { id: 'my-team',             label: 'My Team',              icon: 'team', route: '#/my-team' },
    { id: 'supervisor-compare',  label: 'Supervisor Compare',   icon: 'compare', route: '#/supervisor-compare' },
  ]},
  { section: 'Field', items: [
    { id: 'mystocks',      label: 'Outlet Stock',      icon: 'stocks', route: '#/mystocks' },
    { id: 'mysales',       label: 'Product Sales',     icon: 'chart', route: '#/mysales' },
    { id: 'myprices',      label: 'Price & Discount',  icon: 'price', route: '#/myprices' },
    { id: 'myintel',       label: 'Competitor Intel',  icon: 'intel', route: '#/myintel' },
    { id: 'field-photos',  label: 'Field Photos',      icon: 'photos', route: '#/field-photos' },
    { id: 'attendance',    label: 'Team Attendance',   icon: 'attendance', route: '#/attendance' },
    { id: 'leaves',        label: 'Leave',             icon: 'leaves', route: '#/leaves' },
    { id: 'outlet-approvals', label: 'Outlet Approvals', icon: 'store', route: '#/outlet-approvals' },
  ]},
  { section: 'System', items: [
    { id: 'settings', label: 'Settings', icon: 'settings', route: '#/settings' },
  ]},
];

const NAV_ITEMS_EMPLOYEE = [
  { section: 'Main', items: [
    { id: 'myday',    label: 'My Day',        icon: 'calendar', route: '#/myday' },
    { id: 'last-location', label: 'Last Location', icon: 'pin', route: '#/last-location' },
    { id: 'myvisits', label: 'My Visits',      icon: 'visits', route: '#/myvisits' },
  ]},
  { section: 'Project', items: [
    { id: 'my-projects', label: 'My Projects', icon: 'briefcase', route: '#/my-projects' },
    { id: 'new-outlet', label: 'New Outlet', icon: 'store', route: '#/new-outlet' },
  ]},
  { section: 'Field', items: [
    { id: 'mystocks',     label: 'Outlet Stock',     icon: 'stocks', route: '#/mystocks' },
    { id: 'mysales',      label: 'Product Sales',    icon: 'chart', route: '#/mysales' },
    { id: 'myprices',     label: 'Price & Discount', icon: 'price', route: '#/myprices' },
    { id: 'myintel',      label: 'Competitor Intel', icon: 'intel', route: '#/myintel' },
    { id: 'myphotos',     label: 'Field Photos',     icon: 'photos', route: '#/myphotos' },
    { id: 'myattendance', label: 'My Attendance',    icon: 'attendance', route: '#/myattendance' },
    { id: 'myleaves',     label: 'Leave',            icon: 'leaves', route: '#/myleaves' },
  ]},
  { section: 'System', items: [
    { id: 'settings', label: 'Settings', icon: 'settings', route: '#/settings' },
  ]},
];
// ===== Router =====
function getRoute() {
  return location.hash || '#/';
}

function navigate(route) {
  closeModal();
  location.hash = route;
}

window.FT.goNav = function(event, route) {
  event?.preventDefault?.();
  if (state.account?.mustChangePassword && route !== '#/settings') {
    showToast('Ganti password terlebih dahulu sebelum memakai menu lain.', 'error');
    location.hash = '#/settings';
    return false;
  }
  const nav = document.querySelector('.sidebar-nav');
  if (nav) state._sidebarScroll = nav.scrollTop;
  state.sidebarOpen = false;
  if (location.hash === route) {
    render();
    return false;
  }
  location.hash = route;
  return false;
};

window.addEventListener('hashchange', () => {
  if (state.loggedIn && state.account?.mustChangePassword && getRoute() !== '#/settings') {
    location.hash = '#/settings';
    return;
  }
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

const HOME_REFRESH_MS = 45000;

function isHomeRoute(route = state.route) {
  return route === '#/' || route === '#';
}

function formatHomeRefreshTime(value) {
  if (!value) return 'Auto refresh aktif';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Auto refresh aktif';
  const timezone = getOrganization()?.timezone || 'Asia/Jakarta';
  try {
    return `Diperbarui ${new Intl.DateTimeFormat('id-ID', {
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:timezone,
    }).format(date)}`;
  } catch {
    return 'Data terbaru';
  }
}

async function refreshHomeData({ manual = false } = {}) {
  if (state.homeRefreshInFlight || !state.loggedIn || !isHomeRoute()) return false;
  const actor = getActor();
  if (!actor?.organizationId) return false;
  state.homeRefreshInFlight = true;
  try {
    const result = await refreshOperationalData(getDB(), actor);
    if (result?.refreshed) {
      state.homeRefreshedAt = result.refreshedAt || new Date().toISOString();
      if (manual) showToast('Data Home diperbarui', 'success');
      if (isHomeRoute()) render();
      return true;
    }
    if (manual) {
      const message = ['local-sync-pending','local-changes-pending'].includes(result?.reason)
        ? 'Perubahan lokal sedang disinkronkan. Coba lagi setelah sinkronisasi selesai.'
        : 'Belum ada data baru untuk dimuat.';
      showToast(message);
    }
    return false;
  } catch (error) {
    if (manual) showToast(error?.message || 'Refresh Home gagal', 'error');
    else if (![401,403].includes(Number(error?.status || 0))) {
      console.warn('home_refresh_failed', error?.code || error?.message || error);
    }
    return false;
  } finally {
    state.homeRefreshInFlight = false;
  }
}

function configureHomeRefresh(route = state.route) {
  const shouldRun = state.loggedIn && isHomeRoute(route)
    && (isProjectAdmin() || isSupervisor())
    && !!getActor()?.organizationId;
  if (!shouldRun) {
    if (state.homeRefreshTimer) clearInterval(state.homeRefreshTimer);
    state.homeRefreshTimer = null;
    return;
  }
  if (!state.homeRefreshTimer) {
    state.homeRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshHomeData().catch(() => {});
    }, HOME_REFRESH_MS);
  }
}

window.FT.refreshHome = () => refreshHomeData({ manual:true });

const TRACKING_REFRESH_MS = 30000;

function isTrackingRoute(route = state.route) {
  return route === '#/tracking' || route === '#/last-location';
}

function formatTrackingRefreshTime(value) {
  if (!value) return 'Auto refresh 30 detik';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Auto refresh 30 detik';
  const timezone = getOrganization()?.timezone || 'Asia/Jakarta';
  try {
    return `Diperbarui ${new Intl.DateTimeFormat('id-ID', {
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:timezone,
    }).format(date)}`;
  } catch {
    return 'Data terbaru';
  }
}

async function refreshTrackingData({ manual = false } = {}) {
  if (state.trackingRefreshInFlight || !state.loggedIn || !isTrackingRoute()) return false;
  const actor = getActor();
  if (!actor?.organizationId) return false;
  state.trackingRefreshInFlight = true;
  try {
    const result = await refreshOperationalData(getDB(), actor);
    if (result?.refreshed) {
      state.trackingRefreshedAt = result.refreshedAt || new Date().toISOString();
      if (manual) showToast('Last Location diperbarui', 'success');
      if (isTrackingRoute()) render();
      return true;
    }
    if (manual) {
      const message = ['local-sync-pending','local-changes-pending'].includes(result?.reason)
        ? 'Perubahan lokal sedang disinkronkan. Coba lagi setelah sinkronisasi selesai.'
        : 'Belum ada data baru untuk dimuat.';
      showToast(message);
    }
    return false;
  } catch (error) {
    if (manual) showToast(error?.message || 'Refresh Last Location gagal', 'error');
    else if (![401,403].includes(Number(error?.status || 0))) {
      console.warn('tracking_refresh_failed', error?.code || error?.message || error);
    }
    return false;
  } finally {
    state.trackingRefreshInFlight = false;
  }
}

function configureTrackingRefresh(route = state.route) {
  const shouldRun = state.loggedIn && isTrackingRoute(route) && !!getActor()?.organizationId;
  if (!shouldRun) {
    if (state.trackingRefreshTimer) clearInterval(state.trackingRefreshTimer);
    state.trackingRefreshTimer = null;
    return;
  }
  if (!state.trackingRefreshTimer) {
    state.trackingRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshTrackingData().catch(() => {});
    }, TRACKING_REFRESH_MS);
  }
}

window.FT.refreshTracking = () => refreshTrackingData({ manual:true });

const VISITS_REFRESH_MS = 30000;

function isVisitsRoute(route = state.route) {
  return route === '#/visits' || route === '#/myvisits';
}

function formatVisitsRefreshTime(value) {
  if (!value) return 'Auto refresh 30 detik';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Auto refresh 30 detik';
  const timezone = getOrganization()?.timezone || 'Asia/Jakarta';
  try {
    return `Diperbarui ${new Intl.DateTimeFormat('id-ID', {
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:timezone,
    }).format(date)}`;
  } catch {
    return 'Data terbaru';
  }
}

async function refreshVisitsData({ manual = false } = {}) {
  if (state.visitsRefreshInFlight || !state.loggedIn || !isVisitsRoute()) return false;
  const actor = getActor();
  if (!actor?.organizationId) return false;
  state.visitsRefreshInFlight = true;
  try {
    const result = await refreshOperationalData(getDB(), actor);
    if (result?.refreshed) {
      state.visitsRefreshedAt = result.refreshedAt || new Date().toISOString();
      if (manual) showToast('Data kunjungan diperbarui', 'success');
      if (isVisitsRoute()) render();
      return true;
    }
    if (manual) {
      const message = ['local-sync-pending','local-changes-pending'].includes(result?.reason)
        ? 'Perubahan lokal sedang disinkronkan. Coba lagi setelah sinkronisasi selesai.'
        : 'Belum ada data baru untuk dimuat.';
      showToast(message);
    }
    return false;
  } catch (error) {
    if (manual) showToast(error?.message || 'Refresh kunjungan gagal', 'error');
    else if (![401,403].includes(Number(error?.status || 0))) {
      console.warn('visits_refresh_failed', error?.code || error?.message || error);
    }
    return false;
  } finally {
    state.visitsRefreshInFlight = false;
  }
}

function configureVisitsRefresh(route = state.route) {
  const shouldRun = state.loggedIn && isVisitsRoute(route) && !!getActor()?.organizationId;
  if (!shouldRun) {
    if (state.visitsRefreshTimer) clearInterval(state.visitsRefreshTimer);
    state.visitsRefreshTimer = null;
    return;
  }
  if (!state.visitsRefreshTimer) {
    state.visitsRefreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshVisitsData().catch(() => {});
    }, VISITS_REFRESH_MS);
  }
}

window.FT.refreshVisits = () => refreshVisitsData({ manual:true });


// ===== Main Render =====
function render() {
  const app = document.getElementById('app');
  const currentBrand = getOrganization(getCurrentOrgId()) || null;
  applyOrganizationBranding(currentBrand);
  const sidebarScroll = document.querySelector('.sidebar-nav')?.scrollTop || state._sidebarScroll || 0;
  state._sidebarScroll = sidebarScroll;

  if (state.loggedIn) {
    const actor = getActor();
    if (!actor) {
      state.loggedIn = false;
      state.account = null;
    } else {
      state.account = actor;
      state.user = { name: actor.name, role: displayRole(actor), email: actor.email };
    }
  }

  if (!state.loggedIn) {
    configureHomeRefresh('#/login');
    configureTrackingRefresh('#/login');
    configureVisitsRefresh('#/login');
    app.innerHTML = renderLogin();
    return;
  }

  if (state.account?.mustChangePassword && getRoute() !== '#/settings') {
    location.hash = '#/settings';
    return;
  }

  const route = state.route;
  let pageContent = '';
  let pageTitle = '';
  let pageSubtitle = '';
  const manager = isProjectAdmin();
  const teamOps = canViewTeamOps();
  if (route === '#/photos') {
    location.hash = '#/field-photos';
    return;
  }
  if (isSupervisor() && route === '#/last-location') {
    location.hash = '#/tracking';
    return;
  }

  // Project Management routes are rendered by src/types/index.js after the
  // application shell exists. This prevents false redirects and 404 states.
  if (PROJECT_MANAGEMENT_ROUTES.has(route)) {
    const managerOnlyPm = route === '#/clients' || route === '#/projects' || route === '#/assignments';
    if (managerOnlyPm && !isProjectAdmin()) {
      location.hash = defaultRouteFor(state.account);
      return;
    }
    pageTitle = 'Project Management';
    pageSubtitle = 'Memuat data project dan klien';
    pageContent = '<div class="card"><div class="empty-state"><p>Memuat modul Project Management...</p></div></div>';
  // Field personal routes (employee + supervisor)
  } else if (!manager && (
    route === '#/myday' || route === '#/last-location' || route === '#/myvisits' || route === '#/mystocks' ||
    route === '#/myprices' || route === '#/myintel' || route === '#/myphotos' ||
    route === '#/myattendance' || route === '#/myleaves' || route === '#/new-outlet' ||
    route === '#/mysales'
  )) {
    if (route === '#/myday') {
      pageTitle = 'My Day'; pageSubtitle = 'Today’s field activity';
      pageContent = renderMyDay();
    } else if (route === '#/last-location') {
      pageTitle = 'Last Location'; pageSubtitle = 'Lokasi check-in toko atau tempat kerja';
      pageContent = renderLastLocation();
    } else if (route === '#/myvisits') {
      pageTitle = 'My Visits'; pageSubtitle = 'Your visit history';
      pageContent = renderMyVisits();
    } else if (route === '#/mystocks') {
      pageTitle = 'Outlet Stock';
      pageSubtitle = isSupervisor() ? 'Stock at outlets your team visited' : 'Stock at outlets you visited';
      pageContent = renderMyStocks();
    } else if (route === '#/myprices') {
      pageTitle = 'Price & Discount';
      pageSubtitle = isSupervisor() ? 'Price observations from your team' : 'Prices and discounts at visited outlets';
      pageContent = renderMyPrices();
    } else if (route === '#/myintel') {
      pageTitle = 'Competitor Intel';
      pageSubtitle = isSupervisor() ? 'Competitor intel from your team' : 'Competitor intel at visited outlets';
      pageContent = renderMyIntel();
    } else if (route === '#/myphotos') {
      pageTitle = 'Field Photos'; pageSubtitle = 'Your visit photos';
      pageContent = renderFieldPhotosGallery({ managerView: false });
    } else if (route === '#/myattendance') {
      pageTitle = 'My Attendance'; pageSubtitle = 'Your attendance history';
      pageContent = renderMyAttendance();
    } else if (route === '#/myleaves') {
      pageTitle = 'Leave'; pageSubtitle = 'Submit and track leave requests';
      pageContent = renderMyLeaves();
    } else if (route === '#/new-outlet') {
      pageTitle = 'New Outlet'; pageSubtitle = 'New outlet submissions wait for supervisor and manager approval';
      pageContent = renderOutletProposalForm();
    } else if (route === '#/mysales') {
      pageTitle = 'Product Sales'; pageSubtitle = 'Record product sales against your monthly target';
      pageContent = renderProductSales({ mine: true });
    }
  } else if ((isProjectAdmin() || isSupervisor()) && (route === '#/' || route === '#')) {
    const org = getOrganization();
    pageTitle = isOrgAdmin() ? 'Organization Overview' : isManager() ? 'Project Overview' : 'Team Overview';
    pageSubtitle = org ? `${org.name} · ${org.code}` : 'Operational summary';
    pageContent = (isProjectAdmin() || isManager()) ? renderManagerDashboard() : renderSupervisorDashboard();
  } else if (teamOps && route === '#/tracking') {
    pageTitle = 'Last Location'; pageSubtitle = 'Lokasi check-in terakhir tim di toko atau lokasi kerja';
    pageContent = renderTracking();
  } else if (teamOps && route === '#/visits') {
    pageTitle = 'Visits'; pageSubtitle = 'Outlet visits by the field team';
    pageContent = renderVisits();
  } else if (isProjectAdmin() && route === '#/employees') {
    pageTitle = 'Employees'; pageSubtitle = 'Field employee records';
    pageContent = renderEmployees();
  } else if ((isProjectAdmin() || isSupervisor()) && route === '#/outlet-approvals') {
    pageTitle = 'Outlet Approvals'; pageSubtitle = 'New outlet queue. Supervisor and manager must both approve.';
    pageContent = renderOutletProposalForm();
  } else if (isProjectAdmin() && route === '#/outlets') {
    pageTitle = 'Outlet'; pageSubtitle = 'Kelola data outlet/toko';
    pageContent = renderOutlets();
  } else if (isProjectAdmin() && route === '#/products') {
    pageTitle = 'Products'; pageSubtitle = 'Product catalog';
    pageContent = renderProducts();
  } else if (isProjectAdmin() && route === '#/sales') {
    pageTitle = 'Product Sales'; pageSubtitle = 'Sales entries used to calculate monthly targets';
    pageContent = renderProductSales({ mine: false });
  } else if (isProjectAdmin() && route === '#/stocks') {
    pageTitle = 'Outlet Stock'; pageSubtitle = 'Stock levels at each outlet';
    pageContent = renderStocks();
  } else if (isProjectAdmin() && route === '#/competitors') {
    pageTitle = 'Competitors'; pageSubtitle = 'Competitor brands and catalog';
    pageContent = renderCompetitors();
  } else if (teamOps && route === '#/competitor-analysis') {
    pageTitle = 'Competitor Analysis'; pageSubtitle = 'Field intel summary';
    pageContent = renderCompetitorAnalysis();
  } else if (teamOps && route === '#/field-photos') {
    pageTitle = 'Field Photos'; pageSubtitle = 'Team visit photo gallery';
    pageContent = renderFieldPhotosGallery({ managerView: true });
  } else if (teamOps && route === '#/attendance') {
    pageTitle = 'Attendance'; pageSubtitle = isSupervisor() ? 'Your team attendance' : 'Field team attendance';
    pageContent = renderAttendanceManager();
  } else if (teamOps && route === '#/leaves') {
    pageTitle = 'Leave'; pageSubtitle = 'Leave and time-off requests';
    pageContent = renderLeavesManager();
  } else if (isProjectAdmin() && route.startsWith('#/employee/')) {
    const id = route.replace('#/employee/', '');
    pageContent = renderEmployeeDetail(id);
    pageTitle = 'Detail Karyawan'; pageSubtitle = '';
  } else if (isProjectAdmin() && route.startsWith('#/outlet/')) {
    const id = route.replace('#/outlet/', '');
    pageContent = renderOutletDetail(id);
    pageTitle = 'Detail Outlet'; pageSubtitle = '';
  } else if (route === '#/organizations' || route.startsWith('#/organizations/')) {
    if (!isSuperadmin()) {
      location.hash = defaultRouteFor(state.account);
      return;
    }
    if (route === '#/organizations') {
      pageTitle = 'Organizations'; pageSubtitle = 'Separate workspaces per tenant';
      pageContent = renderOrganizations();
    } else {
      const orgId = decodeURIComponent(route.replace('#/organizations/', ''));
      pageTitle = 'Workspace Organisasi'; pageSubtitle = 'Modul data milik organisasi ini';
      pageContent = renderOrganizationHub(orgId);
    }
  } else if (route === '#/settings') {
    pageTitle = 'Settings'; pageSubtitle = 'Account, security, and app preferences';
    pageContent = renderSettings();
  } else if (isProjectAdmin() && (route === '#/reports' || route.startsWith('#/reports/'))) {
    pageTitle = 'Reports';
    pageSubtitle = 'Operational analytics and custom extracts';
    pageContent = '<div class="card"><div class="empty-state"><p>Memuat laporan...</p></div></div>';
  } else if (isOrgAdmin() && route === '#/accounts') {
    pageTitle = 'Accounts'; pageSubtitle = 'Logins, roles, and employee links';
    pageContent = renderAccounts();
  } else if (!isProjectAdmin()) {
    location.hash = '#/myday';
    return;
  } else {
    pageContent = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Halaman tidak ditemukan</h3><p>Route: ${esc(route)}</p></div>`;
  }

  const fieldRole = !isProjectAdmin();
  const roleSkin = fieldRole ? `role-field ${isSupervisor() ? 'role-supervisor' : 'role-sales'}` : 'role-desk';
  app.innerHTML = `
    <div class="app-layout ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${roleSkin}">
      ${renderSidebar()}
      <div class="sidebar-backdrop" data-pqt-onclick="FT.closeSidebar()" style="display:none;"></div>
      <div class="main-area">
        <div class="topbar ${fieldRole && route === '#/myday' ? 'topbar-hidden-mobile' : ''}">
          <button class="mobile-menu-btn" data-pqt-onclick="FT.toggleSidebar()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div>
            <div class="topbar-title">${pageTitle}</div>
            ${pageSubtitle ? `<div class="topbar-subtitle">${pageSubtitle}</div>` : ''}
          </div>
          <div class="topbar-spacer"></div>
          <div class="topbar-actions">
            ${isHomeRoute(route) ? `<span class="home-freshness">${esc(formatHomeRefreshTime(state.homeRefreshedAt))}</span><button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.refreshHome()" ${state.homeRefreshInFlight ? 'disabled' : ''}>Refresh</button>` : ''}
            ${isTrackingRoute(route) ? `<span class="tracking-freshness">${esc(formatTrackingRefreshTime(state.trackingRefreshedAt))}</span><button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.refreshTracking()" ${state.trackingRefreshInFlight ? 'disabled' : ''}>Refresh</button>` : ''}
            ${isVisitsRoute(route) ? `<span class="tracking-freshness">${esc(formatVisitsRefreshTime(state.visitsRefreshedAt))}</span><button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.refreshVisits()" ${state.visitsRefreshInFlight ? 'disabled' : ''}>Refresh</button>` : ''}
          </div>
        </div>
        <div class="content">
          ${pageContent}
        </div>
        ${fieldRole ? renderFieldDock(route) : ''}
      </div>
    </div>
  `;

  if (PROJECT_MANAGEMENT_ROUTES.has(route)) {
    window.PM?.renderRoute?.();
  }

  attachPageHandlers();
  bindAssetFields(document);
  if (route === '#/tracking') initMap();
  if (route === '#/new-outlet') setTimeout(() => window.FS?.initOutletMap?.(), 50);
  configureHomeRefresh(route);
  configureTrackingRefresh(route);
  configureVisitsRefresh(route);
  const nav = document.querySelector('.sidebar-nav');
  if (nav) nav.scrollTop = state._sidebarScroll || 0;
}

// ===== Sidebar =====
function renderSidebar() {
  const currentRoute = state.route;
  const activeBrand = getOrganization(getCurrentOrgId()) || {};
  const brandLogo = activeBrand.logo || './assets/logo-light.svg';
  const brandName = activeBrand.name || 'ProQTrack';
  const navSource = isOrgAdmin() ? NAV_ITEMS : isManager() ? NAV_ITEMS_PM : isSupervisor() ? NAV_ITEMS_SUPERVISOR : NAV_ITEMS_EMPLOYEE;
  let navHTML = '';
  for (const section of navSource) {
    navHTML += `<div class="nav-section-label">${section.section}</div>`;
    for (const item of section.items) {
      if (item.id === 'organizations' && !isSuperadmin()) continue;
      if (item.id === 'new-outlet' && !canEmployeeAddStore(state.account?.employeeId)) continue;
      const active = currentRoute === item.route
        || (item.id === 'dashboard' && (currentRoute === '#/' || currentRoute === '#'))
        || (item.id === 'myday' && (currentRoute === '#/myday' || currentRoute === '#'));
      let badge = '';
      if (canViewTeamOps() && item.id === 'tracking') {
        const fieldNow = getVisits().filter(v =>
          visitDay(v) === todayISO() && ['checked-in','in_progress'].includes(String(v.status || ''))
        ).length;
        if (fieldNow > 0) badge = `<span class="nav-badge" title="Sedang di lapangan">${fieldNow}</span>`;
      }
      if (canViewTeamOps() && item.id === 'leaves' && getAppSettings().notifyLeave !== false) {
        const pending = getLeaves().filter(l => l.status === 'pending').length;
        if (pending > 0) badge = `<span class="nav-badge" style="background:var(--amber-500);">${pending}</span>`;
      }
      if (isProjectAdmin() && item.id === 'stocks' && getAppSettings().notifyLowStock !== false) {
        const low = getStocks().filter(s => s.quantity <= s.minStock).length;
        if (low > 0) badge = `<span class="nav-badge" style="background:var(--red-500);">${low}</span>`;
      }
      navHTML += `<a href="${item.route}" class="nav-item ${active ? 'active' : ''}" title="${esc(item.label)}" data-pqt-onclick="return FT.goNav(event,'${item.route}')">
        <span class="nav-icon" data-vector="1" data-icon="${item.icon}">${iconSvg(item.icon)}</span>
        <span class="nav-label">${item.label}</span>
        ${badge}
      </a>`;
    }
  }

  return `
    <aside class="sidebar ${state.sidebarOpen ? 'open' : ''} ${state.sidebarCollapsed ? 'collapsed' : ''}">
      <div class="sidebar-header">
        <div class="sidebar-logo">${brandLogo ? `<img src="${esc(brandLogo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">` : 'PQ'}</div>
        <div class="sidebar-logo-text">${esc(brandName)}<small>Monitoring System</small></div>
        <button class="sidebar-toggle" type="button" data-pqt-onclick="FT.toggleCollapse()" aria-expanded="${state.sidebarCollapsed ? 'false' : 'true'}" title="${state.sidebarCollapsed ? 'Perlebar menu' : 'Ciutkan menu'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${state.sidebarCollapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'}"/></svg>
        </button>
      </div>
      ${orgSwitcherHtml()}
      <nav class="sidebar-nav">${navHTML}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user" data-pqt-onclick="location.hash='#/settings'" style="cursor:pointer" title="Pengaturan akun">
          <div class="sidebar-avatar">${getInitials(state.user.name)}</div>
          <div class="sidebar-user-info">
            <div class="name">${esc(state.user.name)}</div>
            <div class="role">${esc(state.user.role)}</div>
          </div>
          <button class="logout-btn" data-pqt-onclick="FT.logout()" title="Keluar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderFieldDock(route) {
  const tabs = isSupervisor()
    ? [
        { route: '#/', label: 'Home', icon: 'home' },
        { route: '#/myday', label: 'My Day', icon: 'calendar' },
        { route: '#/tracking', label: 'Team Loc', icon: 'pin' },
        { route: '#/visits', label: 'Visits', icon: 'visits' },
      ]
    : [
        { route: '#/myday', label: 'Today', icon: 'calendar' },
        { route: '#/myvisits', label: 'Visits', icon: 'visits' },
        { route: '#/mysales', label: 'Sales', icon: 'chart' },
      ];
  return `
    <nav class="field-dock" aria-label="Menu cepat">
      ${tabs.map(t => {
        const active = route === t.route || (t.route === '#/' && (route === '#' || route === '#/'));
        return `<a href="${t.route}" class="field-dock-item ${active ? 'active' : ''}" data-pqt-onclick="return FT.goNav(event,'${t.route}')">
          <span class="field-dock-icon">${iconSvg(t.icon)}</span>
          <span>${t.label}</span>
        </a>`;
      }).join('')}
      <button type="button" class="field-dock-item" data-pqt-onclick="FT.toggleSidebar()">
        <span class="field-dock-icon">${iconSvg('projects')}</span>
        <span>Menu</span>
      </button>
    </nav>
  `;
}

// ===== Login =====
function renderLogin() {
  const brand = getOrganization(getCurrentOrgId()) || {};
  const brandName = brand.name || 'ProQTrack';
  const brandLogo = brand.logo || '';
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">${brandLogo ? `<img src="${esc(brandLogo)}" alt="Logo ${esc(brandName)}">` : 'PQ'}</div>
        <h1>${esc(brandName)}</h1>
        <div class="subtitle">Field Team Real-time Monitoring System</div>
        <form data-pqt-onsubmit="FT.handleLogin(event)" data-pqt-onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.requestSubmit();}">
          <div class="form-group">
            <label class="label">Email</label>
            <input class="input" type="email" id="loginEmail" placeholder="email@proqtrack.id" autocomplete="username" required autofocus>
          </div>
          <div class="form-group">
            <label class="label">Password</label>
            <div class="password-field">
              <input class="input" type="password" id="loginPassword" placeholder="••••••••" autocomplete="current-password" required>
              <button class="password-toggle" type="button" data-pqt-onclick="FT.toggleLoginPassword(this)" aria-label="Tampilkan password" aria-pressed="false">
                <span class="password-eye" aria-hidden="true">${iconSvg('eye')}</span>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center; margin-top:8px;">
            Masuk ke Dashboard
          </button>
        </form>
        <div style="text-align:center; margin-top:24px; font-size:12px; color:var(--gray-400);">
          Hubungi admin untuk akun akses. Jangan bagikan password di perangkat bersama.
        </div>
      </div>
    </div>
  `;
}

window.FT.toggleLoginPassword = function(button) {
  const input = document.getElementById('loginPassword');
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button?.setAttribute('aria-label', visible ? 'Tampilkan password' : 'Sembunyikan password');
  button?.setAttribute('aria-pressed', visible ? 'false' : 'true');
  input.focus();
};

window.FT.handleLogin = function(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  let acc = null;
  try {
    acc = authenticate(email, password, getDeviceIdentity());
  } catch (error) {
    showToast(error.message || 'Login ditolak oleh kunci perangkat.', 'error');
    return;
  }
  if (!acc) {
    showToast('Email atau password salah', 'error');
    return;
  }
  if (acc.role === 'superadmin') {
    markSuperadminHost(getDeviceIdentity());
    try { registerTestDevice(getDeviceIdentity(), acc); } catch { /* ignore */ }
  }
  state.loggedIn = true;
  state.account = acc;
  state.user = { name: acc.name, role: displayRole(acc), email: acc.email };
  state.route = acc.mustChangePassword ? '#/settings' : defaultRouteFor(acc);
  location.hash = state.route;
  render();
  if (acc.mustChangePassword) {
    showToast('Wajib ganti password sebelum memakai aplikasi.', 'error');
  }
  issueUploadSession(acc, { email, password }).catch(error => {
    console.warn('upload_session_failed', error);
  });
};

window.FT.resetDB = function() {
  if (state.loggedIn && getActor()?.role !== 'superadmin') {
    showToast('Reset data hanya untuk superadmin.', 'error');
    return null;
  }
  return resetDatabase();
};

window.FT.logout = function() {
  closeModal();
  clearApiToken();
  state.loggedIn = false;
  state.account = null;
  state.route = '#/login';
  if (state.livePolling) { clearInterval(state.livePolling); state.livePolling = null; }
  if (state.homeRefreshTimer) { clearInterval(state.homeRefreshTimer); state.homeRefreshTimer = null; }
  if (state.trackingRefreshTimer) { clearInterval(state.trackingRefreshTimer); state.trackingRefreshTimer = null; }
  if (state.visitsRefreshTimer) { clearInterval(state.visitsRefreshTimer); state.visitsRefreshTimer = null; }
  state.homeRefreshedAt = null;
  state.trackingRefreshedAt = null;
  state.visitsRefreshedAt = null;
  render();
};

// ===== Dashboard =====
function dashLink(href, label) {
  return `<a class="btn btn-secondary btn-sm" href="${href}">${label}</a>`;
}

function renderManagerDashboard() {
  const stats = getDashboardStats();
  const org = getOrganization();
  const today = todayISO();
  const todayVisits = getVisits()
    .filter(v => visitDay(v) === today)
    .sort((a,b) => String(b.checkInTime || '').localeCompare(String(a.checkInTime || '')));
  const employees = getEmployees();
  const activeEmployees = employees.filter(e => e.status === 'active');
  const pendingLeaves = getLeaves().filter(l => l.status === 'pending').length;
  const project = isManager() && state.account?.projectId
    ? (getDB().projects || []).find(row => String(row.id) === String(state.account.projectId))
    : null;
  const scopeTitle = project?.name || org?.name || 'Organisasi';
  const scopeMeta = project
    ? `${project.code || project.id} · ${activeEmployees.length} tenaga aktif`
    : `Workspace ${org?.code || '-'} · ${activeEmployees.length} tenaga aktif`;
  const shortcutCaption = project ? 'Data project aktif' : 'Data organisasi aktif';
  return `
    <div class="card home-hero">
      <div class="filter-row home-hero-row">
        <div>
          <div class="card-title">${esc(scopeTitle)}</div>
          <div class="card-subtitle">${esc(scopeMeta)}</div>
        </div>
        <div class="spacer"></div>
        ${isSuperadmin() ? dashLink('#/organizations','Ganti organisasi') : ''}
        ${dashLink('#/tracking','Last Location')}
        ${dashLink('#/outlet-approvals','Persetujuan toko')}
        ${dashLink('#/reports','Laporan')}
      </div>
    </div>
    <div class="grid-4">
      ${[
        ['Karyawan aktif', activeEmployees.length, '#/employees'],
        ['Kunjungan hari ini', stats.todayVisits, '#/visits'],
        ['Stok menipis', stats.lowStocks, '#/stocks'],
        ['Cuti pending', pendingLeaves, '#/leaves'],
      ].map(([l,v,h]) => `<a class="stat-card" href="${h}" style="text-decoration:none;color:inherit"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></a>`).join('')}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Aktivitas hari ini</div>
        <div class="card-subtitle">${esc(today)} · terbaru lebih dulu</div>
        ${todayVisits.length ? `<div class="visits-table-wrapper"><table class="table"><thead><tr><th>Waktu</th><th>Sales</th><th>Outlet</th><th>Status</th></tr></thead><tbody>${todayVisits.slice(0,8).map(v => {
          const emp = employees.find(e => e.id === v.employeeId);
          const out = getOutlets().find(o => o.id === v.outletId);
          return `<tr><td>${esc(v.checkInTime || '-')}</td><td>${esc(emp?.name || '-')}</td><td>${esc(out?.name || '-')}</td><td>${statusBadge(v.status)}</td></tr>`;
        }).join('')}</tbody></table></div><div class="home-card-footer">${dashLink('#/visits','Lihat semua kunjungan')}</div>` : '<div class="empty-state"><h3>Belum ada kunjungan hari ini</h3><p>Pantau tim di Last Location atau lihat jadwal kunjungan.</p></div>'}
      </div>
      <div class="card">
        <div class="card-title">Pintasan workspace</div>
        <div class="card-subtitle">Akses cepat ke data operasional utama</div>
        <div class="org-hub">
          ${[['#/clients','Klien'],['#/projects','Project'],['#/employees','Karyawan'],['#/outlets','Toko'],['#/products','Produk'],['#/competitors','Kompetitor']].map(([h,l]) => `<a class="org-tile" href="${h}"><strong>${l}</strong><span>${shortcutCaption}</span></a>`).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderSupervisorDashboard() {
  const mine = myEmployeeId();
  const team = getEmployees().filter(e => e.supervisorId === mine || e.id === mine);
  const teamIds = new Set(team.map(e => e.id));
  const visits = getVisits()
    .filter(v => teamIds.has(v.employeeId) && visitDay(v) === todayISO())
    .sort((a,b) => String(b.checkInTime || '').localeCompare(String(a.checkInTime || '')));
  const pending = getLeaves().filter(l => teamIds.has(l.employeeId) && l.status === 'pending');
  const pendingStores = getOutletProposals().filter(p => p.status === 'pending');
  const active = visits.filter(v => ['checked-in','in_progress'].includes(String(v.status || '')));
  const employeeMap = new Map(team.map(row => [String(row.id),row]));
  const leaveTypes = new Map((getLeaveTypes() || []).map(row => [String(row.code || row.id || row.value || ''),row.label || row.name || row.code]));
  const org = getOrganization();
  const leavePeriod = row => {
    const from = row.startDate || row.fromDate || row.dateFrom || row.date || '';
    const to = row.endDate || row.toDate || row.dateTo || '';
    if (!from) return '';
    return to && to !== from ? `${formatDateShort(from)} – ${formatDateShort(to)}` : formatDateShort(from);
  };
  return `
    <div class="card home-hero home-hero-compact">
      <div class="filter-row home-hero-row">
        <div>
          <div class="card-title">${esc(org?.name || 'Tim lapangan')}</div>
          <div class="card-subtitle">${team.length} anggota dalam cakupan Anda · ${active.length} sedang di lapangan</div>
        </div>
        <div class="spacer"></div>
        ${dashLink('#/tracking','Last Location')}
        ${dashLink('#/visits','Kunjungan tim')}
      </div>
    </div>
    <div class="grid-4">
      ${[['Anggota tim', team.length, '#/my-team'],['Kunjungan tim', visits.length, '#/visits'],['Sedang di lapangan', active.length, '#/tracking'],['Ijin menunggu', pending.length, '#/leaves']].map(([l,v,h]) => `<a class="stat-card" href="${h}" style="text-decoration:none;color:inherit"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></a>`).join('')}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Tim hari ini</div>
        <div class="card-subtitle">Aktivitas dan penjualan bulan berjalan</div>
        ${team.slice(0,8).map(e => `<div class="home-team-row"><div><strong>${esc(e.name)}</strong><div class="am-muted">${esc(e.area)} · ${visitsTodayCount(e.id)} visits · ${formatCurrency(monthSalesAmount(e.id))}</div></div><a class="btn btn-secondary btn-sm" href="#/tracking" data-pqt-onclick="return FT.openTrackingEmployee(event,'${e.id}')">Track</a></div>`).join('') || '<p class="am-muted">Belum ada anggota tim.</p>'}
        ${team.length > 8 ? `<div class="home-card-footer">${dashLink('#/my-team',`Lihat semua ${team.length} anggota`)}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">Perlu tindakan</div>
        <div class="card-subtitle">Pengajuan yang masih menunggu keputusan</div>
        ${pending.slice(0,5).map(l => {
          const employee = employeeMap.get(String(l.employeeId));
          const type = leaveTypes.get(String(l.type || '')) || l.type || 'Cuti';
          const period = leavePeriod(l);
          return `<div class="home-action-row"><strong>${esc(type)} · ${esc(employee?.name || 'Karyawan')}</strong><div class="am-muted">${period ? esc(period) + ' · ' : ''}${esc(l.reason || 'Tanpa catatan')}</div></div>`;
        }).join('')}
        ${pendingStores.slice(0,5).map(p => `<div class="home-action-row"><strong>Toko baru: ${esc(p.name)}</strong><div class="am-muted">${esc(p.submittedByName || '')} · ${esc(p.area || p.city || '')}</div></div>`).join('')}
        ${pending.length + pendingStores.length > 10 ? `<div class="am-muted" style="margin-top:8px">+${pending.length + pendingStores.length - 10} pengajuan lainnya</div>` : ''}
        ${!pending.length && !pendingStores.length ? '<p class="am-muted">Tidak ada pengajuan pending.</p>' : ''}
        <div class="am-actions" style="margin-top:12px">${dashLink('#/outlet-approvals','Persetujuan toko')} ${dashLink('#/leaves','Cuti')} ${dashLink('#/myday','Hari saya')}</div>
      </div>
    </div>
  `;
}

function renderDashboard() {
  return isSupervisor() ? renderSupervisorDashboard() : renderManagerDashboard();
}

function lastKnownLocation(empId) {
  const visits = getVisits()
    .filter(v => v.employeeId === empId && v.checkInTime)
    .sort((a, b) => `${visitDay(b)} ${b.checkInTime || ''}`.localeCompare(`${visitDay(a)} ${a.checkInTime || ''}`));
  const outlets = new Map(getOutlets().map(row => [String(row.id),row]));
  for (const visit of visits) {
    const outlet = outlets.get(String(visit.outletId || '')) || null;
    const evidence = visitLocationEvidence(visit,outlet);
    if (!evidence) continue;
    return {
      visit,
      outlet,
      evidence,
      lat:evidence.lat,
      lng:evidence.lng,
      freshness:locationFreshness(evidence,visit,Date.now(),todayISO()),
    };
  }
  return null;
}

function trackingLocationStatus(loc) {
  if (!loc) return {
    key:'none',
    label:'Belum ada lokasi',
    source:'Belum ada lokasi',
    dot:'var(--gray-300)',
  };
  const freshness = loc.freshness || locationFreshness(loc.evidence,loc.visit,Date.now(),todayISO());
  const dot = freshness.key === 'fresh'
    ? 'var(--green-500)'
    : freshness.key === 'recent' || freshness.key === 'today'
      ? 'var(--brand)'
      : freshness.key === 'reference'
        ? 'var(--gray-400)'
        : 'var(--amber-500)';
  return {
    key:freshness.key,
    label:freshness.label,
    source:locationSourceLabel(loc.evidence),
    dot,
  };
}

function trackingEmployees() {
  const q = String(state._trackQuery || '').toLowerCase();
  const area = state._trackArea || '';
  const field = state._trackField || '';
  return getEmployees().filter(e => e.status === 'active').filter(e => {
    const loc = lastKnownLocation(e.id);
    const today = loc && visitDay(loc.visit) === todayISO();
    if (q && !`${e.name} ${e.area} ${e.role} ${e.phone}`.toLowerCase().includes(q)) return false;
    if (area && e.area !== area) return false;
    if (field === 'today' && !today) return false;
    if (field === 'hasloc' && !loc) return false;
    if (field === 'noloc' && loc) return false;
    return true;
  });
}

function renderTracking() {
  const employees = trackingEmployees();
  const areas = [...new Set(getEmployees().map(e => e.area).filter(Boolean))];
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" placeholder="Cari nama, area, telepon" value="${esc(state._trackQuery || '')}" data-pqt-oninput="FT.filterTracking(this.value)">
        <select class="select" style="width:auto" data-pqt-onchange="FT.filterTrackingArea(this.value)">
          <option value="">Semua area</option>
          ${areas.map(a => `<option value="${esc(a)}" ${state._trackArea===a?'selected':''}>${esc(a)}</option>`).join('')}
        </select>
        <select class="select" style="width:auto" data-pqt-onchange="FT.filterTrackingField(this.value)">
          <option value="">Semua status</option>
          <option value="today" ${state._trackField==='today'?'selected':''}>Check-in hari ini</option>
          <option value="hasloc" ${state._trackField==='hasloc'?'selected':''}>Punya lokasi tercatat</option>
          <option value="noloc" ${state._trackField==='noloc'?'selected':''}>Belum ada lokasi</option>
        </select>
        <button class="btn btn-secondary" type="button" data-pqt-onclick="FT.fitTracking()">Tampilkan semua</button>
        <div class="spacer"></div>
      </div>
      <div class="tracking-evidence-note">Lokasi GPS perangkat dan referensi outlet dibedakan. Referensi outlet bukan posisi aktual karyawan.</div>
    </div>
    <div class="map-container" style="position:relative;">
      <div id="trackingMap"></div>
      <div class="map-sidebar-panel">
        <h3>Tim (${employees.length})</h3>
        <div id="mapEmpList">
          ${employees.map(e => {
            const loc = lastKnownLocation(e.id);
            const status = trackingLocationStatus(loc);
            const maps = loc ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` : '';
            const lastLabel = loc
              ? `${esc(loc.outlet?.name || 'Lokasi kerja')} · ${esc(status.source)} · ${esc(status.label)}`
              : 'Belum ada lokasi tercatat';
            const timeLabel = loc
              ? `${formatDateShort(visitDay(loc.visit))} ${esc(loc.visit.checkInTime || '')}${loc.visit.checkOutTime ? ' · check-out ' + esc(loc.visit.checkOutTime) : ' · belum check-out'}`
              : '';
            return `
              <div class="map-emp-item" data-emp="${e.id}">
                <div class="emp-status-dot" style="background:${status.dot};"></div>
                <div class="emp-info" data-pqt-onclick="FT.focusEmployee('${e.id}')" style="cursor:pointer;flex:1">
                  <div class="emp-name">${esc(e.name)}</div>
                  <div class="emp-area">${esc(e.area)} · ${lastLabel}</div>
                  ${timeLabel ? `<div class="tracking-meta">${timeLabel}</div>` : ''}
                </div>
                <div class="tracking-actions">
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.focusEmployee('${e.id}')" ${loc ? '' : 'disabled'}>Fokus</button>
                  ${maps ? `<a class="btn btn-secondary btn-sm" href="${maps}" target="_blank" rel="noreferrer">${loc.evidence.actual ? 'Navigasi' : 'Rute outlet'}</a>` : ''}
                  ${e.phone ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${String(e.phone).replace(/\D/g,'')}" target="_blank" rel="noreferrer">WA</a>` : ''}
                </div>
              </div>
            `;
          }).join('') || '<p class="am-muted">Tidak ada tim sesuai filter.</p>'}
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
  const employees = trackingEmployees();

  if (_map) { _map.remove(); _map = null; _markers = {}; }
  _map = L.map('trackingMap', { zoomControl: true }).setView([-6.2, 106.85], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 19
  }).addTo(_map);

  if (state.livePolling) { clearInterval(state.livePolling); state.livePolling = null; }

  const avatarColors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  employees.forEach(e => {
    const loc = lastKnownLocation(e.id);
    if (!loc) return;
    const cIdx = e.name.charCodeAt(0) % avatarColors.length;
    const color = avatarColors[cIdx];
    const status = trackingLocationStatus(loc);
    const actual = loc.evidence.actual;
    const fresh = status.key === 'fresh';
    const icon = L.divIcon({
      className: 'ft-marker',
      html: `<div style="width:36px;height:36px;border-radius:50%;background:${actual ? color : '#94a3b8'};border:4px ${actual ? 'solid' : 'dashed'} ${fresh ? '#10b981' : actual ? 'white' : '#e2e8f0'};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;">${getInitials(e.name)}</div>`,
      iconSize: [36,36], iconAnchor: [18,18]
    });
    const m = L.marker([loc.lat, loc.lng], { icon }).addTo(_map);
    const accuracy = loc.evidence.accuracyM != null ? ` · akurasi ±${Math.round(loc.evidence.accuracyM)} m` : '';
    const referenceWarning = actual ? '' : '<div style="margin-top:6px;color:#92400e;font-weight:600;">Referensi outlet — bukan posisi aktual perangkat.</div>';
    m.bindPopup(`
      <div style="font-size:13px; min-width:190px;">
        <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${esc(e.name)}</div>
        <div style="color:#666;">${esc(e.role)} · ${esc(e.area)}</div>
        <div style="margin-top:6px;font-weight:600;">${esc(locationSourceLabel(loc.evidence))}${esc(accuracy)}</div>
        <div>${esc(status.label)}</div>
        <div style="margin-top:6px;">${esc(loc.outlet?.name || 'Lokasi kerja')}</div>
        <div>${esc(formatDateShort(visitDay(loc.visit)))} ${esc(loc.visit.checkInTime || '')}${loc.visit.checkOutTime ? ' · check-out ' + esc(loc.visit.checkOutTime) : ' · belum check-out'}</div>
        ${referenceWarning}
        ${e.phone ? `<div style="margin-top:6px;">Tel. ${esc(e.phone)}</div>` : ''}
      </div>
    `);
    _markers[e.id] = m;
  });
  if (state._trackFocus && _markers[state._trackFocus]) {
    const target = state._trackFocus;
    state._trackFocus = '';
    requestAnimationFrame(() => window.FT.focusEmployee?.(target));
  }
}

window.FT.openTrackingEmployee = function(event, empId) {
  event?.preventDefault?.();
  state._trackFocus = String(empId || '');
  if (state.route === '#/tracking') render();
  else location.hash = '#/tracking';
  return false;
};

window.FT.filterTracking = function(value) { state._trackQuery = value; render(); };
window.FT.filterTrackingArea = function(value) { state._trackArea = value; render(); };
window.FT.filterTrackingField = function(value) { state._trackField = value; render(); };
window.FT.fitTracking = function() {
  if (!_map) return;
  const marks = Object.values(_markers);
  if (!marks.length) return;
  const group = L.featureGroup(marks);
  _map.fitBounds(group.getBounds().pad(0.2));
};
window.FT.focusEmployee = function(empId) {
  const loc = lastKnownLocation(empId);
  if (!loc || !_map || !_markers[empId]) return;
  _map.setView([loc.lat, loc.lng], 15, { animate: true });
  _markers[empId].openPopup();
  document.querySelectorAll('.map-emp-item').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.map-emp-item[data-emp="${empId}"]`)?.classList.add('selected');
};

// ===== Visits Page =====
function renderVisits() {
  const visits = getVisits().sort((a,b) => b.date.localeCompare(a.date) || (b.checkInTime||'').localeCompare(a.checkInTime||''));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));

  setTimeout(() => window.FT?.initVisitFilters?.(), 0);
  return `
    <div class="card">
      <div class="filter-row">
        <label class="sr-only" for="visitSearch">Cari kunjungan</label><input class="input search-input" id="visitSearch" placeholder="🔍 Cari kunjungan..." data-pqt-oninput="FT.filterVisits()">
        <select class="select" id="visitStatusFilter" style="width:180px;" data-pqt-onchange="FT.filterVisits()">
          <option value="">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="checked-in">Sedang Berlangsung</option>
          <option value="planned">Direncanakan</option>
        </select>
        <select class="select" id="visitEmpFilter" style="width:200px;" data-pqt-onchange="FT.filterVisits()">
          <option value="">Semua Karyawan</option>
          ${getEmployees().map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}
        </select>
        <select class="select" id="visitProjectFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits()">
          <option value="">Semua Project</option>
        </select>
        <select class="select" id="visitOutletFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits()">
          <option value="">Semua Outlet</option>
        </select>
        <input class="input" id="visitDateFrom" type="date" aria-label="Tanggal mulai" style="width:160px;" data-pqt-onchange="FT.filterVisits()">
        <input class="input" id="visitDateTo" type="date" aria-label="Tanggal akhir" style="width:160px;" data-pqt-onchange="FT.filterVisits()">
        <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetVisitFilters()">Reset</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openVisitModal()">+ Tambah Kunjungan</button>
      </div>
      <div id="visitFilterSummary" class="am-muted" style="margin:0 0 10px;" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper visit-responsive-table">
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
                <tr data-visit-id="${esc(v.id)}" data-status="${esc(v.status || '')}" data-emp="${esc(v.employeeId || '')}" data-project="${esc(v.projectId || '')}" data-outlet="${esc(v.outletId || '')}" data-date="${esc(visitDay(v))}">
                  <td>${formatDateShort(visitDay(v))}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div class="avatar" style="width:28px;height:28px;font-size:11px;background:${['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'][emp.name.charCodeAt(0)%6]};">${getInitials(emp.name)}</div>
                      <span style="font-weight:600;">${esc(emp.name)}</span>
                    </div>
                  </td>
                  <td>${outletIcon(out.type)} ${esc(out.name)}</td>
                  <td>${v.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${v.checkOutTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${formatDuration(v.checkInTime, v.checkOutTime)}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td style="color:#fbbf24;">${stars}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewVisit('${v.id}')">Detail</button>
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

window.FT.initVisitFilters = function() {
  const projectSelect = document.getElementById('visitProjectFilter');
  const outletSelect = document.getElementById('visitOutletFilter');
  if (projectSelect && projectSelect.options.length === 1) {
    const visits = getVisits();
    const projects = getDB().projects || [];
    [...new Set(visits.map(v => String(v.projectId || '')).filter(Boolean))].forEach(id => {
      const project = projects.find(p => String(p.id) === id);
      const option = document.createElement('option');
      option.value = id;
      option.textContent = project?.name || project?.code || id;
      projectSelect.append(option);
    });
  }
  if (outletSelect && outletSelect.options.length === 1) {
    getOutlets().forEach(outlet => {
      const option = document.createElement('option');
      option.value = String(outlet.id);
      option.textContent = `${outlet.name}${outlet.status !== 'active' ? ' · Nonaktif' : ''}`;
      outletSelect.append(option);
    });
  }
  FT.filterVisits(1);
};

window.FT.filterVisits = function(page = 1) {
  const search = (document.getElementById('visitSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('visitStatusFilter')?.value || '';
  const empF = document.getElementById('visitEmpFilter')?.value || '';
  const projectF = document.getElementById('visitProjectFilter')?.value || '';
  const outletF = document.getElementById('visitOutletFilter')?.value || '';
  const dateFrom = document.getElementById('visitDateFrom')?.value || '';
  const dateTo = document.getElementById('visitDateTo')?.value || '';
  const rows = [...document.querySelectorAll('#visitsTable tbody tr[data-visit-id]')];
  const filters = { search, status, employeeId:empF, projectId:projectF, outletId:outletF, dateFrom, dateTo };
  const matched = rows.filter(row => visitMatchesFilters({
    status:row.dataset.status,
    employeeId:row.dataset.emp,
    projectId:row.dataset.project,
    outletId:row.dataset.outlet,
    date:row.dataset.date,
  }, filters, row.textContent));
  const pageState = paginateVisits(matched, page, VISITS_PAGE_SIZE);
  const { currentPage, pageCount } = pageState;
  const visible = new Set(pageState.items);
  rows.forEach(row => { row.style.display = visible.has(row) ? '' : 'none'; });
  const summary = document.getElementById('visitFilterSummary');
  if (summary) {
    summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} kunjungan` : 'Tidak ada kunjungan yang cocok dengan filter.';
  }
  let pager = document.getElementById('visitPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'visitPager';
    pager.className = 'visit-pager';
    document.querySelector('.visit-responsive-table')?.after(pager);
  }
  pager.replaceChildren();
  if (pageState.total > VISITS_PAGE_SIZE) {
    const prev = document.createElement('button');
    prev.className = 'btn btn-secondary btn-sm'; prev.type = 'button'; prev.textContent = '‹ Sebelumnya'; prev.disabled = currentPage <= 1;
    prev.addEventListener('click', () => FT.filterVisits(currentPage - 1));
    const label = document.createElement('span');
    label.className = 'visit-page-indicator'; label.textContent = `Halaman ${currentPage} / ${pageCount}`;
    const next = document.createElement('button');
    next.className = 'btn btn-secondary btn-sm'; next.type = 'button'; next.textContent = 'Berikutnya ›'; next.disabled = currentPage >= pageCount;
    next.addEventListener('click', () => FT.filterVisits(currentPage + 1));
    pager.append(prev, label, next);
  }
};

window.FT.resetVisitFilters = function() {
  ['visitSearch','visitStatusFilter','visitEmpFilter','visitProjectFilter','visitOutletFilter','visitDateFrom','visitDateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  FT.filterVisits(1);
};

window.FT.openVisitModal = function() {
  const employees = getEmployees().filter(employee => employee.status === 'active');
  const outlets = getOutlets().filter(outlet => outlet.status === 'active');
  if (!employees.length || !outlets.length) {
    showToast('Karyawan aktif dan outlet aktif diperlukan untuk menjadwalkan kunjungan.', 'error');
    return;
  }
  openModal('Tambah Kunjungan', `
    <form data-pqt-onsubmit="FT.createVisit(event)">
      <div class="form-group">
        <label class="label">Karyawan</label>
        <select class="select" name="employeeId" required>
          ${employees.map(e => `<option value="${e.id}">${esc(e.name)} — ${esc(e.area)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Outlet</label>
        <select class="select" name="outletId" required>
          ${outlets.map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Tanggal</label>
        <input class="input" type="date" name="date" value="${todayISO()}" required>
      </div>
      <div class="form-group">
        <label class="label">Catatan</label>
        <textarea class="textarea" name="notes" placeholder="Catatan kunjungan..."></textarea>
      </div>
      <div class="tracking-evidence-note">Kunjungan baru selalu dibuat sebagai Direncanakan. Check-in dan check-out dilakukan oleh karyawan yang ditugaskan dengan bukti GPS perangkat.</div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Jadwal</button>
      </div>
    </form>
  `);
};

let visitCreateInFlight = false;

window.FT.createVisit = function(e) {
  e.preventDefault();
  if (visitCreateInFlight) return;
  const form = e.currentTarget || e.target;
  const submit = form?.querySelector('button[type="submit"]');
  visitCreateInFlight = true;
  if (submit) submit.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    data.status = 'planned';
    createVisit(data);
    closeModal();
    showToast('Kunjungan berhasil dijadwalkan', 'success');
    render();
  } catch (error) {
    showToast(error.message || 'Akses ditolak', 'error');
  } finally {
    visitCreateInFlight = false;
    if (submit?.isConnected) submit.disabled = false;
  }
};

window.FT.viewVisit = function(id) {
  const v = getVisits().find(x => x.id === id);
  if (!v) {
    showToast('Kunjungan tidak ditemukan atau di luar cakupan tim.', 'error');
    return;
  }
  const emp = getEmployees().find(e => e.id === v.employeeId);
  const mine = myEmployeeId();
  const canAct = !!mine && String(v.employeeId) === String(mine);
  openModal('Detail Kunjungan', `
    <div class="detail-grid" style="margin-bottom:8px">
      <div class="detail-label">Sales</div><div class="detail-value">${esc(emp?.name || '-')}</div>
      <div class="detail-label">Area</div><div class="detail-value">${esc(emp?.area || '-')}</div>
    </div>
    ${renderVisitDetailHtml(id)}
    ${canAct && !['completed','cancelled','rejected'].includes(String(v.status || '')) ? `
      <div style="margin-top:8px; display:flex; gap:8px;">
        ${v.status === 'planned' ? `<button class="btn btn-primary btn-sm" data-pqt-onclick="FT.checkInVisit('${v.id}')">Check In</button>` : ''}
        ${v.status === 'checked-in' ? `<button class="btn btn-primary btn-sm" data-pqt-onclick="FT.checkOutVisit('${v.id}')">Check Out</button>` : ''}
      </div>
    ` : ''}
    ${['completed','cancelled','rejected'].includes(String(v.status || '')) ? `
      <div class="tracking-evidence-note" style="margin-top:12px">Data kunjungan final tidak diedit langsung. Koreksi menggunakan approval Supervisor lalu Manager.</div>
      <div style="margin-top:8px"><button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.openVisitCorrection('${v.id}')">Ajukan Koreksi</button></div>
    ` : ''}
  `);
};
window.FT.openVisitCorrection = function(id) {
  const visit = getVisits().find(v => v.id === id);
  if (!visit || !['completed','cancelled','rejected'].includes(String(visit.status || ''))) {
    showToast('Koreksi hanya dapat diajukan untuk kunjungan final.', 'error');
    return;
  }
  openModal('Ajukan Koreksi Kunjungan', `
    <form data-pqt-onsubmit="FT.submitVisitCorrection(event,'${visit.id}')">
      <div class="tracking-evidence-note">Pengajuan tidak mengubah data final secara langsung. Supervisor dan Manager harus menyetujui exception.</div>
      <div class="form-group" style="margin-top:12px">
        <label class="label">Alasan koreksi</label>
        <textarea class="textarea" name="reason" maxlength="1000" required placeholder="Jelaskan data yang perlu dikoreksi dan alasannya."></textarea>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Usulan Check In</label><input class="input" type="time" name="requestedCheckInTime" value="${esc(visit.checkInTime || '')}"></div>
        <div class="form-group"><label class="label">Usulan Check Out</label><input class="input" type="time" name="requestedCheckOutTime" value="${esc(visit.checkOutTime || '')}"></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Kirim Pengajuan</button>
      </div>
    </form>
  `);
};

let visitCorrectionInFlight = false;
window.FT.submitVisitCorrection = async function(event, id) {
  event.preventDefault();
  if (visitCorrectionInFlight) return;
  const visit = getVisits().find(v => v.id === id);
  if (!visit) return showToast('Kunjungan tidak ditemukan.', 'error');
  const form = event.currentTarget || event.target;
  const submit = form?.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  const reason = String(data.reason || '').trim();
  if (reason.length < 10) return showToast('Alasan koreksi minimal 10 karakter.', 'error');
  const workflows = window.ProQTrackM6?.workflows;
  if (!workflows?.create) return showToast('Workflow approval belum tersedia pada sesi ini.', 'error');
  visitCorrectionInFlight = true;
  if (submit) submit.disabled = true;
  try {
    await workflows.create({
      workflowType:'visit_exception', subjectType:'visit', subjectId:visit.id, projectId:visit.projectId || null,
      payload:{ reason, requestedCheckInTime:String(data.requestedCheckInTime || ''), requestedCheckOutTime:String(data.requestedCheckOutTime || ''), currentStatus:visit.status, currentDate:visitDay(visit), currentCheckInTime:visit.checkInTime || null, currentCheckOutTime:visit.checkOutTime || null },
    });
    closeModal();
    showToast('Pengajuan koreksi dikirim untuk approval Supervisor dan Manager.', 'success');
  } catch (error) {
    showToast(visitCorrectionErrorMessage(error?.code || error?.message), 'error');
  } finally {
    visitCorrectionInFlight = false;
    if (submit?.isConnected) submit.disabled = false;
  }
};


window.FT.toggleCollapse = function() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  try { localStorage.setItem('proqtrack_sidebar_collapsed', state.sidebarCollapsed ? '1' : '0'); } catch { /* ignore */ }
  const sb = document.querySelector('.sidebar');
  const layout = document.querySelector('.app-layout');
  if (sb) {
    sb.classList.toggle('collapsed', state.sidebarCollapsed);
    const btn = sb.querySelector('.sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
      btn.title = state.sidebarCollapsed ? 'Perlebar menu' : 'Ciutkan menu';
      const path = btn.querySelector('path');
      if (path) path.setAttribute('d', state.sidebarCollapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6');
    }
  }
  layout?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
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

const visitCheckInInFlight = new Set();
const visitCheckOutInFlight = new Set();

async function checkInVisitWithEvidence(id) {
  const key = String(id || '');
  if (!key || visitCheckInInFlight.has(key)) return null;
  const visit = getVisits().find(row => String(row.id) === key);
  if (!visit) throw new Error('Kunjungan tidak ditemukan atau di luar cakupan Anda.');

  const actor = getActor();
  const ownsVisit = !!actor?.employeeId && String(actor.employeeId) === String(visit.employeeId);
  if (!ownsVisit) throw new Error('Check-in hanya dapat dilakukan oleh karyawan yang ditugaskan.');
  if (String(visit.status || '') !== 'planned') throw new Error('Kunjungan ini tidak lagi berstatus Direncanakan.');

  const outlet = getOutlets().find(row => String(row.id) === String(visit.outletId));
  if (!outlet) throw new Error('Outlet kunjungan tidak ditemukan.');

  visitCheckInInFlight.add(key);
  try {
    showToast('Mengambil lokasi GPS...');
    const gps = await captureDevicePosition();
    const geofence = assertVisitGeofence(outlet, gps, 50);
    const patch = {
      status:'checked-in',
      checkInTime:currentTenantTimeHHMM(),
      startedAt:gps.capturedAt,
      locationSource:'device_gps',
      checkInLat:gps.lat,
      checkInLng:gps.lng,
      checkInAccuracyM:gps.accuracyM,
      checkInCapturedAt:gps.capturedAt,
      geofenceDistanceM:geofence.distanceM,
      geofenceRadiusM:geofence.radiusM,
      geofenceStatus:geofence.status,
    };
    return updateVisit(key, patch);
  } finally {
    visitCheckInInFlight.delete(key);
  }
}

async function checkOutVisitWithEvidence(id) {
  const key = String(id || '');
  if (!key || visitCheckOutInFlight.has(key)) return null;
  const visit = getVisits().find(row => String(row.id) === key);
  if (!visit) throw new Error('Kunjungan tidak ditemukan atau di luar cakupan Anda.');

  const actor = getActor();
  const ownsVisit = !!actor?.employeeId && String(actor.employeeId) === String(visit.employeeId);
  if (!ownsVisit) throw new Error('Check-out hanya dapat dilakukan oleh karyawan yang ditugaskan.');
  if (!['checked-in','in_progress'].includes(String(visit.status || ''))) {
    throw new Error('Check-out hanya dapat dilakukan setelah check-in.');
  }

  visitCheckOutInFlight.add(key);
  try {
    showToast('Mengambil lokasi GPS check-out...');
    const gps = await captureDevicePosition();
    const outlet = getOutlets().find(row => String(row.id) === String(visit.outletId));
    let geofence = null;
    try { geofence = outlet ? visitGeofenceEvidence(outlet, gps, 50) : null; } catch { geofence = null; }
    const patch = {
      status:'completed',
      checkOutTime:currentTenantTimeHHMM(),
      completedAt:gps.capturedAt,
      checkOutLat:gps.lat,
      checkOutLng:gps.lng,
      checkOutAccuracyM:gps.accuracyM,
      checkOutCapturedAt:gps.capturedAt,
      checkOutLocationSource:'device_gps',
      ...(geofence ? {
        checkOutGeofenceDistanceM:geofence.distanceM,
        checkOutGeofenceRadiusM:geofence.radiusM,
        checkOutGeofenceStatus:geofence.status,
      } : {}),
    };
    return updateVisit(key, patch);
  } finally {
    visitCheckOutInFlight.delete(key);
  }
}

window.FT.checkInVisit = async function(id) {
  try {
    const visit = await checkInVisitWithEvidence(id);
    if (!visit) return;
    closeModal();
    showToast('Check-in berhasil dengan GPS dan geofence valid', 'success');
    render();
  } catch (error) {
    showToast(error.message || 'Check-in gagal', 'error');
  }
};

window.FT.checkOutVisit = async function(id) {
  try {
    const visit = await checkOutVisitWithEvidence(id);
    if (!visit) return;
    closeModal();
    showToast('Check-out berhasil dengan bukti GPS', 'success');
    render();
  } catch (error) {
    showToast(error.message || 'Check-out gagal', 'error');
  }
};

window.FT.deleteVisit = function(id) {
  if (!confirm('Hapus kunjungan ini?')) return;
  try {
    deleteVisit(id);
    closeModal(); showToast('Kunjungan dihapus', 'success'); render();
  } catch (error) { showToast(error.message || 'Akses ditolak', 'error'); }
};

// ===== Employees Page =====
let employeePage = 1;
function employeeSyncLabel() {
  const state = employeeSyncState(cloudDataStatus());
  const suffix = state.tone === 'local' ? '' : ` pm-sync-${state.tone}`;
  return `<span class="pm-sync${suffix}">${esc(state.label)}</span>`;
}
function employeeActiveAssignments(employeeId) {
  return activeAssignmentsForEmployee(getDB().projectAssignments || [], employeeId);
}
function employeeProjectIds(employeeId) {
  return activeProjectIdsForEmployee(getDB().projectAssignments || [], employeeId);
}

function renderEmployees() {
  const employees = getEmployees();
  const db = getDB();
  const projectMap = Object.fromEntries((db.projects || []).map(project => [project.id, project]));
  const projectOptions = [...new Map(
    employees.flatMap(employee => employeeProjectIds(employee.id))
      .map(projectId => [projectId, projectMap[projectId]])
      .filter(([,project]) => project)
  ).values()];
  const rendered = `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="empSearch" placeholder="🔍 Cari nama, email, area..." aria-label="Cari karyawan" data-pqt-oninput="FT.filterEmployees(1)">
        <select class="select" id="empRoleFilter" style="width:180px;" aria-label="Filter role" data-pqt-onchange="FT.filterEmployees(1)">
          <option value="">Semua Role</option>
          <option value="Field Sales">Field Sales</option>
          <option value="Supervisor">Supervisor</option>
        </select>
        <select class="select" id="empStatusFilter" style="width:160px;" aria-label="Filter status" data-pqt-onchange="FT.filterEmployees(1)">
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
          <option value="terminated">Berakhir</option>
        </select>
        <select class="select" id="empProjectFilter" style="width:220px;" aria-label="Filter project" data-pqt-onchange="FT.filterEmployees(1)">
          <option value="">Semua Project</option>
          ${projectOptions.map(project => `<option value="${esc(project.id)}">${esc(project.code || project.id)} — ${esc(project.name)}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <span id="employeeSyncState">${employeeSyncLabel()}</span>
        ${isProjectAdmin() ? `<button class="btn btn-secondary" data-pqt-onclick="BulkEmployees.open()">Bulk Upload</button>` : ``}
        <button class="btn btn-primary" data-pqt-onclick="FT.openEmployeeModal()">+ Tambah Karyawan</button>
      </div>
      <div id="employeeResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper">
        <table class="table employee-table" id="empTable">
          <thead><tr><th>Nama</th><th>Role</th><th>Project</th><th>Area</th><th>Telepon</th><th>Sales / Target</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            ${employees.map(e => {
              const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
              const cIdx = e.name.charCodeAt(0) % colors.length;
              const projectIds = employeeProjectIds(e.id);
              const projects = projectIds.map(id => projectMap[id]).filter(Boolean);
              const search = employeeSearchDocument(e, projects);
              return `<tr data-search="${esc(search)}" data-role="${esc(e.role || '')}" data-status="${esc(e.status || '')}" data-projects="${esc(projectIds.join('|'))}">
                <td data-label="Nama"><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:${colors[cIdx]};${e.photo ? `background-image:url('${e.photo}');background-size:cover;background-position:center;font-size:0;` : ''}">${getInitials(e.name)}</div><div><div style="font-weight:600;color:var(--gray-800);">${esc(e.name)}</div><div class="pm-subtext">${esc(e.email)}</div></div></div></td>
                <td data-label="Role">${roleBadge(e.role)}</td>
                <td data-label="Project">${projects.map(p => `<span class="pm-project-chip">${esc(p.code || p.id)}</span>`).join('') || '—'}</td>
                <td data-label="Area">${esc(e.area || '—')}</td>
                <td data-label="Telepon">${esc(e.phone || '—')}</td>
                <td data-label="Sales / Target"><span style="font-weight:600;">${formatCurrency(monthSalesAmount(e.id))}</span> / ${formatCurrency(salesTargetOf(e))}</td>
                <td data-label="Kunjungan">${e.totalVisits}</td>
                <td data-label="Status">${statusBadge(e.status)}</td>
                <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/employee/${e.id}'">Detail</button>${e.status === 'active' ? `<button class="btn btn-danger btn-sm" data-pqt-onclick="FT.deleteEmployee('${e.id}')">Nonaktifkan</button>` : ''}</div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div id="employeeEmpty" class="pm-empty" hidden>Tidak ada karyawan yang sesuai dengan filter.</div>
      <div id="employeePager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.employeePage(-1)">Sebelumnya</button><span id="employeePageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.employeePage(1)">Berikutnya</button></div>
    </div>
  `;
  queueMicrotask(() => window.FT?.filterEmployees?.(employeePage));
  return rendered;
}

window.FT.employeePage = function(delta) {
  employeePage = Math.max(1, employeePage + Number(delta || 0));
  window.FT.filterEmployees(employeePage);
};

window.FT.filterEmployees = function(page = employeePage) {
  const filters = {
    search:String(document.getElementById('empSearch')?.value || ''),
    role:String(document.getElementById('empRoleFilter')?.value || ''),
    status:String(document.getElementById('empStatusFilter')?.value || ''),
    projectId:String(document.getElementById('empProjectFilter')?.value || ''),
  };
  const rows = [...document.querySelectorAll('#empTable tbody tr')];
  const matched = rows.filter(row => employeeMatchesFilters({
    search:row.dataset.search || '',
    role:row.dataset.role || '',
    status:row.dataset.status || '',
    projectIds:String(row.dataset.projects || '').split('|').filter(Boolean),
  }, filters));
  const pageState = paginateEmployees(matched, page, EMPLOYEE_PAGE_SIZE);
  employeePage = pageState.currentPage;
  const visible = new Set(pageState.items);
  rows.forEach(row => { row.style.display = visible.has(row) ? '' : 'none'; });
  const summary = document.getElementById('employeeResultSummary');
  if (summary) summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} karyawan` : 'Tidak ada karyawan yang sesuai dengan filter.';
  const empty = document.getElementById('employeeEmpty');
  if (empty) empty.hidden = pageState.total !== 0;
  const pager = document.getElementById('employeePager');
  if (pager) pager.hidden = pageState.total <= EMPLOYEE_PAGE_SIZE;
  const label = document.getElementById('employeePageLabel');
  if (label) label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
  const sync = document.getElementById('employeeSyncState');
  if (sync) sync.innerHTML = employeeSyncLabel();
};
function employeePhotoField(current = '') {
  const src = current || '';
  return `
    <div class="form-group emp-photo-field">
      <label class="label">Foto karyawan</label>
      <div class="employee-photo-editor">
        <img class="employee-photo-preview" alt="Preview" src="${src || ''}" onerror="this.style.opacity=.3">
        <div>
          <input class="input" type="file" name="photoFile" accept="image/jpeg,image/png,image/webp" data-pqt-onchange="FT.previewEmployeePhoto(this)">
          <input type="hidden" name="photo" value="${esc(src)}">
          <div class="employee-photo-help">Gunakan satu foto profil yang jelas.</div>
        </div>
      </div>
    </div>`;
}

window.FT.previewEmployeePhoto = function(input) {
  const file = input.files?.[0];
  const preview = input.closest('.emp-photo-field')?.querySelector('.employee-photo-preview');
  if (file && preview) preview.src = URL.createObjectURL(file);
};

async function photoFromEmployeeForm(form, fallback = '') {
  const file = form.querySelector('input[name="photoFile"]')?.files?.[0];
  if (file) return compressImage(file, { maxPx: 320, quality: 0.82 });
  return form.querySelector('input[name="photo"]')?.value || fallback;
}

window.FT.openEmployeeModal = function() {
  const actor = getActor();
  let projects = (getDB().projects || []).filter(p => !['completed','cancelled','closed','archived'].includes(p.status));
  if (actor?.role === 'manager') {
    const managerProjects = new Set(
      (Array.isArray(actor.projectIds) && actor.projectIds.length ? actor.projectIds : (actor.projectId ? [actor.projectId] : []))
        .map(String)
    );
    projects = projects.filter(p => managerProjects.has(String(p.id)));
  }
  openModal('Tambah Karyawan', `
    <form data-pqt-onsubmit="FT.createEmployee(event)">
      ${employeePhotoField(defaultPortrait({ name: 'Karyawan Baru' }))}
      <div class="form-row">
        <div class="form-group"><label class="label">Kode Karyawan</label><input class="input" name="employeeCode" required placeholder="EMP-001"></div>
        <div class="form-group"><label class="label">Nama Lengkap</label><input class="input" name="name" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Email Login</label><input class="input" type="email" name="email" required></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" placeholder="08xx-xxxx-xxxx" required></div>
      </div>
      <div class="form-group">
        <label class="label">Project</label>
        <select class="select" name="projectId" required>
          <option value="">Pilih project</option>
          ${projects.map(p => `<option value="${esc(p.id)}">${esc(p.code || p.id)} — ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="label">Supervisor email <span class="am-muted">(wajib untuk Field Sales)</span></label><input class="input" type="email" name="supervisorEmail" placeholder="supervisor@proqtrack.id"></div>
      <div class="form-group">
        <label class="label">Password Login Awal</label>
        <input class="input" type="password" name="password" minlength="16" autocomplete="new-password"
          pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{16,}">
        <div class="am-muted">Diwajibkan hanya jika email belum memiliki akun. Minimal 16 karakter, huruf besar, huruf kecil, angka, dan simbol.</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Role</label>
          <select class="select" name="role"><option>Field Sales</option><option>Supervisor</option></select>
        </div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" placeholder="Jakarta Pusat" required></div>
      </div>
      <div class="form-group"><label class="label">Monthly product sales target (Rp)</label><input class="input" type="number" name="salesTargetAmount" value="0" min="0"></div>
      <div class="form-group"><label class="label">Attendance point</label>
        <select class="select" name="attendancePointId">
          <option value="">— None —</option>
          ${getAttendancePoints().map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.type)})</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createEmployee = async function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.salesTargetAmount = parseInt(data.salesTargetAmount, 10) || 0;
  data.attendancePointId = data.attendancePointId || null;
  data.joinDate = new Date().toISOString().slice(0, 10);
  if (data.role === 'Field Sales' && !String(data.supervisorEmail || '').trim()) {
    showToast('Supervisor wajib dipilih untuk Field Sales.', 'error');
    return;
  }
  try {
    data.photo = await photoFromEmployeeForm(form, '');
    delete data.photoFile;
    await window.BulkEmployees.createSingleEmployee(data);
    closeModal(); showToast('Karyawan, penugasan, dan akun login berhasil dibuat', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

window.FT.deleteEmployee = async function(id) {
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const current = getEmployees().find(row => row.id === id);
  if (!current) return;
  if (!confirm('Nonaktifkan karyawan ini? Akses login aktif akan dicabut.')) return;
  try {
    await window.BulkEmployees.updateSingleEmployee({
      employeeCode: current.employeeCode || current.code || id,
      name: current.name,
      email: current.email,
      phone: current.phone,
      role: current.role,
      area: current.area,
      position: current.position || current.role,
      projectId: '',
      status: 'inactive',
      salesTargetAmount: current.salesTargetAmount || 0,
      attendancePointId: current.attendancePointId || '',
      photo: current.photo || '',
      joinDate: current.joinDate || '',
    });
    showToast('Karyawan dinonaktifkan dan sesi login dicabut', 'success');
    render();
  } catch (error) {
    showToast(error.message || error, 'error');
  }
};

// ===== Employee Detail =====
function renderEmployeeDetail(id) {
  const emp = getEmployees().find(e => e.id === id);
  if (!emp) return `<div class="empty-state"><h3>Karyawan tidak ditemukan</h3></div>`;
  const visits = getVisits().filter(v => v.employeeId === id).sort((a,b) => b.date.localeCompare(a.date));
  const attendance = getAttendance().filter(a => a.employeeId === id);
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const db = getDB();
  const projectMap = Object.fromEntries((db.projects || []).map(project => [project.id, project]));
  const employeeMap = Object.fromEntries((db.employees || []).map(employee => [employee.id, employee]));
  const assignments = (db.projectAssignments || []).filter(assignment => assignment.employeeId === id).sort((a,b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const activeAssignments = assignments.filter(assignment => assignment.status === 'active');
  const account = (getAccounts() || []).find(row => row.employeeId === id || (emp.authUserId && row.id === emp.authUserId));
  const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const cIdx = emp.name.charCodeAt(0) % colors.length;

  return `
    <div style="display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:24px;">
      <div class="card" style="flex:0 0 320px;">
        <div style="text-align:center; padding:12px 0 20px;">
          <div class="avatar avatar-lg" style="background:${colors[cIdx]}; margin:0 auto 12px;${emp.photo ? `background-image:url('${emp.photo}');background-size:cover;background-position:center;font-size:0;` : ''}">${getInitials(emp.name)}</div>
          <div style="font-size:20px; font-weight:800; color:var(--gray-900);">${esc(emp.name)}</div>
          <div style="margin-top:4px;">${roleBadge(emp.role)}</div>
          <div style="margin-top:8px;">${statusBadge(emp.status)}</div>
        </div>
        <div class="detail-grid">
          <div class="detail-label">ID</div><div class="detail-value">${esc(emp.id)}</div>
          <div class="detail-label">Email</div><div class="detail-value">${esc(emp.email)}</div>
          <div class="detail-label">Telepon</div><div class="detail-value">${esc(emp.phone || '—')}</div>
          <div class="detail-label">Area</div><div class="detail-value">${esc(emp.area)}</div>
          <div class="detail-label">Bergabung</div><div class="detail-value">${formatDate(emp.joinDate)}</div>
          <div class="detail-label">Lokasi</div><div class="detail-value">${Number.isFinite(Number(emp.lat)) ? `${Number(emp.lat).toFixed(4)}, ${Number(emp.lng).toFixed(4)}` : '—'}</div>
          <div class="detail-label">Login</div><div class="detail-value">${account ? `${esc(account.email || emp.email || '')} · ${esc(account.status || 'active')}` : 'Tidak terhubung'}</div>
          <div class="detail-label">Project Aktif</div><div class="detail-value">${activeAssignments.map(a => esc(projectMap[a.projectId]?.code || a.projectId)).join(', ') || '—'}</div>
          <div class="detail-label">Kapasitas</div><div class="detail-value">${activeAssignments.reduce((sum,a) => sum + Number(a.allocationPercent || 100),0)}%</div>
        </div>
        <div style="display:flex; gap:8px; margin-top:20px;">
          <button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/employees'">← Kembali</button>
          <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.editEmployee('${emp.id}')">Edit</button>
        </div>
      </div>
      <div style="flex:1; min-width:300px;">
        <div class="grid-3" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-label">Visits today</div><div class="stat-value">${emp.todayVisits}</div></div>
          <div class="stat-card"><div class="stat-label">Total Kunjungan</div><div class="stat-value">${emp.totalVisits}</div></div>
          <div class="stat-card"><div class="stat-label">Kehadiran</div><div class="stat-value">${attendance.length}</div><div style="font-size:12px; color:var(--gray-400); margin-top:4px;">catatan</div></div>
        </div>
        <div class="card" style="margin-bottom:20px;">
          <div class="card-title">Project & Assignment</div>
          <div class="card-subtitle">${assignments.length} riwayat assignment</div>
          ${assignments.length ? `<div class="visits-table-wrapper"><table class="table"><thead><tr><th>Project</th><th>Role</th><th>Supervisor</th><th>Periode</th><th>Kapasitas</th><th>Status</th></tr></thead><tbody>${assignments.map(a => {
            const project = projectMap[a.projectId] || {};
            const supervisor = employeeMap[a.supervisorId] || {};
            return `<tr><td>${esc(project.code || a.projectId)} — ${esc(project.name || '')}</td><td>${esc(a.roleOnProject || '-')}</td><td>${esc(supervisor.name || (a.roleOnProject === 'supervisor' ? '—' : '-'))}</td><td>${formatDate(a.startDate)} – ${formatDate(a.endDate)}</td><td>${Number(a.allocationPercent || 100)}%</td><td>${statusBadge(a.status === 'removed' ? 'ended' : a.status)}</td></tr>`;
          }).join('')}</tbody></table></div>` : '<div class="empty-state"><h3>Belum ada assignment</h3></div>'}
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
                  <td>${o ? outletIcon(o.type)+' '+esc(o.name) : '-'}</td>
                  <td>${esc(v.checkInTime || '-')}</td>
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
    <form data-pqt-onsubmit="FT.updateEmployee(event, '${id}')">
      ${employeePhotoField(emp.photo || defaultPortrait(emp))}
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(emp.name)}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Email login</label><input class="input" type="email" name="email" value="${esc(emp.email)}" readonly><div class="am-muted">Ubah email login dari Manajemen Akun.</div></div>
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" value="${esc(emp.phone || '')}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Role</label><input class="input" name="role" value="${esc(emp.role)}" readonly><div class="am-muted">Ubah role dari Manajemen Akun.</div></div>
        <div class="form-group"><label class="label">Area</label><input class="input" name="area" value="${esc(emp.area || '')}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Monthly sales target (Rp)</label><input class="input" type="number" name="salesTargetAmount" min="0" value="${emp.salesTargetAmount || 0}"></div>
        <div class="form-group"><label class="label">Status</label><input class="input" value="${esc(emp.status === 'active' ? 'Aktif' : emp.status === 'terminated' ? 'Berakhir' : 'Nonaktif')}" readonly><div class="am-muted">Status tidak diubah dari form Edit. Gunakan aksi Nonaktifkan atau flow staffing khusus.</div></div>
      </div>
      <div class="form-group"><label class="label">Attendance point</label>
        <select class="select" name="attendancePointId">
          <option value="">— None —</option>
          ${getAttendancePoints().map(p => `<option value="${p.id}" ${emp.attendancePointId === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.type)})</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateEmployee = async function(e, id) {
  e.preventDefault();
  const form = e.target;
  const current = getEmployees().find(x => x.id === id);
  const data = Object.fromEntries(new FormData(form));
  data.salesTargetAmount = parseInt(data.salesTargetAmount, 10) || 0;
  data.attendancePointId = data.attendancePointId || null;
  delete data.password;
  delete data.lat;
  delete data.lng;
  try {
    data.photo = await photoFromEmployeeForm(form, current?.photo || '');
    delete data.photoFile;
    data.employeeCode = current?.employeeCode || current?.code || id;
    data.projectId = '';
    data.joinDate = current?.joinDate || '';
    await window.BulkEmployees.updateSingleEmployee(data);
    closeModal(); showToast('Data operasional karyawan berhasil diperbarui', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

// ===== Outlets Page =====
function renderOutlets() {
  const outlets = getOutlets();
  return `
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="outletSearch" placeholder="🔍 Cari outlet..." data-pqt-oninput="FT.filterOutlets()">
        <select class="select" id="outletTypeFilter" style="width:180px;" data-pqt-onchange="FT.filterOutlets()">
          <option value="">Semua Tipe</option>
          <option>Toko Kelontong</option><option>Minimarket</option><option>Restoran</option>
          <option>Warung Kopi</option><option>Apotek</option><option>Toko Bangunan</option>
          <option>Toko Elektronik</option><option>Bakery</option><option>Toko Fashion</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.open('outlets')">Bulk Upload</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openOutletModal()">+ Tambah Outlet</button>
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
                <td><div style="font-weight:600; color:var(--gray-800);">${outletIcon(o.type)} ${esc(o.name)}</div><div style="font-size:12px; color:var(--gray-400);">${esc(o.address)}</div></td>
                <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${o.type}</span></td>
                <td>${esc(displayValue(o.area))}</td>
                <td>${esc(displayValue(o.owner))}</td>
                <td>${esc(displayValue(o.phone))}</td>
                <td>${esc(displayValue(o.visitFrequency))}</td>
                <td>${statusBadge(o.status)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/outlet/${o.id}'">Detail</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteOutlet('${o.id}')">Hapus</button>
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

function storeOptionList(rows) {
  return (rows || []).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

window.FT.syncManagerOutletCatalog = function(projectId) {
  const cat = projectId ? getProjectStoreSettings(projectId) : defaultStoreCatalog();
  const fill = (name, values) => {
    const sel = document.querySelector(`form[onsubmit*="createOutlet"] select[name="${name}"]`);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = storeOptionList(values);
    if (cur && values.includes(cur)) sel.value = cur;
  };
  fill('channel', cat.segments);
  fill('ownership', cat.ownerships);
  fill('type', cat.types);
  const notesWrap = document.getElementById('outletNotesWrap');
  if (notesWrap) notesWrap.outerHTML = `<div id="outletNotesWrap">${outletNotesField(cat)}</div>`;
};

window.FT.openOutletModal = function() {
  const cat = defaultStoreCatalog();
  openModal('New Outlet', `
    <form data-pqt-onsubmit="FT.createOutlet(event)">
      <div class="form-group"><label class="label">Nama toko</label><input class="input" name="name" required></div>
      ${entityScopeFields().replace('<select class="select" name="projectId" required>', '<select class="select" name="projectId" required data-pqt-onchange="FT.syncManagerOutletCatalog(this.value)">')}
      <div class="form-group">
        <label class="label">Lokasi di peta</label>
        <div class="filter-row" style="margin-bottom:8px">
          <input class="input search-input" id="outletMapSearch" placeholder="Cari alamat / nama jalan / tempat...">
          <button type="button" class="btn btn-secondary" data-pqt-onclick="FS.searchOutletMap()">Cari</button>
        </div>
        <div id="outletPickMap" style="height:240px;border-radius:14px;border:1px solid var(--gray-200);overflow:hidden"></div>
        <div class="am-muted" id="outletMapHint" style="margin-top:6px">Klik peta untuk menandai titik toko. Alamat terisi otomatis.</div>
        <input type="hidden" name="lat" id="outletLat" required>
        <input type="hidden" name="lng" id="outletLng" required>
        <input type="hidden" name="mapLabel" id="outletMapLabel">
      </div>
      <div class="form-group"><label class="label">Alamat (otomatis dari peta, bisa diedit)</label><textarea class="textarea" name="address" id="outletAddress" required></textarea></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Segment</label>
          <select class="select" name="channel">${storeOptionList(cat.segments)}</select>
        </div>
        <div class="form-group"><label class="label">Akun (ownership store)</label>
          <select class="select" name="ownership">${storeOptionList(cat.ownerships)}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Type (tipe store)</label>
          <select class="select" name="type">${storeOptionList(cat.types)}</select>
        </div>
        <div class="form-group"><label class="label">Area / Kota</label><input class="input" name="area" id="outletArea" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Telepon</label><input class="input" name="phone"></div>
        <div class="form-group"><label class="label">Pemilik / PIC toko</label><input class="input" name="owner"></div>
      </div>
      <div id="outletNotesWrap">${outletNotesField(cat)}</div>
      <div class="form-row">
        <div class="form-group"><label class="label">Frekuensi kunjungan</label>
          <select class="select" name="visitFrequency"><option>Mingguan</option><option>Bulanan</option></select>
        </div>
        <div class="form-group"><label class="label">Status</label>
          <select class="select" name="status"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select>
        </div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
  setTimeout(() => window.FS?.initOutletMap?.(), 80);
};

window.FT.createOutlet = function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd);
  if (!data.lat || !data.lng) { showToast('Tandai titik toko di peta atau cari lokasi dulu.', 'error'); return; }
  data.lat = parseFloat(data.lat); data.lng = parseFloat(data.lng);
  try {
    createOutlet(data);
    closeModal(); showToast('Outlet berhasil ditambahkan ke project', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

window.FT.deleteOutlet = function(id) {
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
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
          <div style="font-size:18px; font-weight:800; color:var(--gray-900);">${esc(o.name)}</div>
          <div style="margin-top:4px;">${statusBadge(o.status)}</div>
        </div>
        <div class="detail-grid">
          <div class="detail-label">ID</div><div class="detail-value">${o.id}</div>
          <div class="detail-label">Tipe</div><div class="detail-value">${o.type}</div>
          <div class="detail-label">Alamat</div><div class="detail-value full">${esc(o.address)}</div>
          <div class="detail-label">Pemilik</div><div class="detail-value">${o.owner}</div>
          <div class="detail-label">Telepon</div><div class="detail-value">${o.phone}</div>
          <div class="detail-label">Area</div><div class="detail-value">${o.area}</div>
          <div class="detail-label">Lokasi</div><div class="detail-value">${o.lat.toFixed(4)}, ${o.lng.toFixed(4)}</div>
          <div class="detail-label">Frekuensi</div><div class="detail-value">${o.visitFrequency}</div>
        </div>
        <div style="display:flex; gap:8px; margin-top:20px;">
          <button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/outlets'">← Kembali</button>
          <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.editOutlet('${o.id}')">Edit</button>
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
    <form data-pqt-onsubmit="FT.updateOutlet(event, '${id}')">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(o.name)}" required></div>
      ${entityScopeFields(o)}
      <div class="form-group"><label class="label">Alamat</label><input class="input" name="address" value="${esc(o.address)}" required></div>
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
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
  try {
    updateOutlet(id, data);
    closeModal(); showToast('Data outlet dan relasi project diperbarui', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

function greetingNow() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function longDateId(d = new Date()) {
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function minutesAgoLabel(time) {
  if (!time) return '';
  const [hh, mm] = String(time).split(':').map(Number);
  if (!Number.isFinite(hh)) return '';
  const then = new Date();
  then.setHours(hh, mm || 0, 0, 0);
  const diff = Math.round((Date.now() - then.getTime()) / 60000);
  if (diff < 1) return 'baru saja';
  if (diff < 60) return `${diff} menit lalu`;
  return `${Math.floor(diff / 60)} jam lalu`;
}

function mapsDir(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Sales';
}

// ===== Employee: My Day Dashboard =====
function renderMyDay() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  if (!emp) return `<div class="empty-state"><h3>Data karyawan tidak ditemukan</h3></div>`;
  const visits = getVisitsOnDate(todayISO(), empId);
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
  const cIdx = emp.name.charCodeAt(0) % colors.length;
  const completed = visits.filter(v => v.status === 'completed');
  const activeV = visits.filter(v => v.status === 'checked-in');
  const planned = visits.filter(v => v.status === 'planned');
  const sold = monthSalesAmount(empId);
  const target = salesTargetOf(emp);
  const doneCount = completed.length;
  const pct = target > 0 ? Math.min(100, Math.round((sold / target) * 100)) : 0;
  const att = getAttendance().find(a => a.employeeId === empId && a.date === todayISO());
  const active = activeV[0];
  const activeOut = active ? outletMap[active.outletId] : null;
  const attMaps = att && (att.lat || att.lng) ? mapsDir(att.lat, att.lng) : (activeOut ? mapsDir(activeOut.lat, activeOut.lng) : '');
  const alerts = getLeaves().filter(l => l.employeeId === empId && l.status === 'pending').length;
  const tile = (label, iconName, onclick) => `<button type="button" class="mq-tile" data-pqt-onclick="${onclick}">
    <span class="mq-tile-ico">${iconSvg(iconName)}</span><span>${label}</span></button>`;

  return `
    <div class="mq-home">
      <header class="mq-head">
        <button type="button" class="mq-icon-btn" data-pqt-onclick="FT.toggleSidebar()" aria-label="Menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
        <div class="mq-hello">
          <h1>${greetingNow()}, ${esc(firstName(emp.name))}! 👋</h1>
          <p>${esc(longDateId())}</p>
        </div>
        <button type="button" class="mq-icon-btn" data-pqt-onclick="location.hash='#/myleaves'" aria-label="Notifikasi">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3s3-2 3-9"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
          ${alerts ? `<span class="mq-badge">${alerts}</span>` : ''}
        </button>
        <button type="button" class="mq-avatar" style="background:${colors[cIdx]}" data-pqt-onclick="location.hash='#/settings'">${getInitials(emp.name)}</button>
      </header>

      <section class="mq-card mq-progress">
        <div class="mq-card-kicker">${iconSvg('chart')} Sales target this month</div>
        <div class="mq-progress-row">
          <div>
            <div class="mq-big" style="font-size:22px">${formatCurrency(sold)}<small>${target ? ' / ' + formatCurrency(target) : ''}</small></div>
            <div class="mq-muted">${doneCount} visits today (not targeted)</div>
          </div>
          <div class="mq-pills">
            <div><b class="ok">${completed.length}</b><span>Selesai</span></div>
            <div><b class="warn">${activeV.length}</b><span>Berlangsung</span></div>
            <div><b>${planned.length}</b><span>Berikutnya</span></div>
          </div>
        </div>
        <div class="mq-bar"><i style="width:${pct}%"></i></div>
        <div class="mq-bar-label">${pct}%</div>
      </section>

      <section class="mq-card mq-att">
        ${att ? `
          <div class="mq-att-status">
            <span class="mq-dot"></span>
            <div><small>Status Absensi</small><strong>${esc(att.status === 'late' || att.status === 'terlambat' ? 'Terlambat' : 'Hadir')}</strong></div>
          </div>
          <div class="mq-att-meta">Check-in <b>${esc(att.checkInTime || '—')}</b><br>${esc(att.checkInLocation || att.locationName || '—')}</div>
          ${attMaps ? `<a class="mq-ghost" href="${attMaps}" target="_blank" rel="noreferrer">${iconSvg('pin')} Lihat Lokasi</a>` : ''}
        ` : `<div class="mq-att-form">${attendanceCheckinCard()}</div>`}
      </section>

      ${active && activeOut ? `
      <section class="mq-card mq-active">
        <div class="mq-card-kicker">Sedang Dikunjungi</div>
        <div class="mq-store">
          <div class="mq-store-ico">${outletIcon(activeOut.type)}</div>
          <div>
            <h2>${esc(activeOut.name)}</h2>
            <p>${esc(activeOut.address || '')}</p>
            <div class="mq-meta-line">${iconSvg('attendance')} Check-in ${esc(active.checkInTime || '—')} · ${esc(minutesAgoLabel(active.checkInTime))}</div>
          </div>
          <span class="mq-live">checked-in</span>
        </div>
        <div class="mq-tiles">
          ${tile('Stok', 'stocks', `FT.openVisitStockInput('${active.id}','${active.outletId}')`)}
          ${tile('Harga', 'price', `FT.openVisitPriceInput('${active.id}','${active.outletId}')`)}
          ${tile('Intel', 'intel', `FT.openVisitIntelInput('${active.id}','${active.outletId}')`)}
          ${tile('Foto', 'camera', `FT.openVisitPhotoInput('${active.id}','${active.outletId}')`)}
          ${mapsDir(activeOut.lat, activeOut.lng)
            ? `<a class="mq-tile" href="${mapsDir(activeOut.lat, activeOut.lng)}" target="_blank" rel="noreferrer"><span class="mq-tile-ico">${iconSvg('tracking')}</span><span>Rute</span></a>`
            : `<span class="mq-tile"><span class="mq-tile-ico">${iconSvg('tracking')}</span><span>Rute</span></span>`}
        </div>
        <button type="button" class="mq-checkout" data-pqt-onclick="FT.mobileCheckOut('${active.id}')">CHECK OUT →</button>
      </section>` : ''}

      <section class="mq-card mq-next">
        <div class="mq-next-head">
          <h3>Berikutnya</h3>
          <a href="#/myvisits">Lihat Semua ›</a>
        </div>
        ${planned.length ? planned.map(v => {
          const o = outletMap[v.outletId];
          if (!o) return '';
          const km = (emp.lat && o.lat) ? calculateDistance(emp.lat, emp.lng, o.lat, o.lng) : null;
          const dir = mapsDir(o.lat, o.lng);
          return `<div class="mq-next-row">
            <div class="mq-store-ico sm">${outletIcon(o.type)}</div>
            <div>
              <strong>${esc(o.name)}</strong>
              <p>${esc(o.address || '')}</p>
              <div class="mq-meta-line">${v.checkInTime ? esc(v.checkInTime) : 'Terjadwal'} ${km != null ? ` · ${km} km` : ''}</div>
            </div>
            ${dir ? `<a class="mq-route" href="${dir}" target="_blank" rel="noreferrer">${iconSvg('tracking')} Rute</a>` : `<button type="button" class="mq-route" data-pqt-onclick="FT.mobileCheckIn('${v.id}')">Check in</button>`}
          </div>`;
        }).join('') : `<div class="empty-state" style="padding:20px"><h3>Tidak ada jadwal berikutnya</h3></div>`}
      </section>
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
            <tr><th>Tanggal</th><th>Outlet</th><th>Check In</th><th>Check Out</th><th>Durasi</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${visits.length === 0 ? `<tr><td colspan="7"><div class="empty-state">${appIcon('visits')}<h3>Belum ada riwayat kunjungan</h3></div></td></tr>` :
            visits.map(v => {
              const o = outletMap[v.outletId];
              return `
                <tr>
                  <td>${formatDateShort(visitDay(v))}</td>
                  <td>${o ? outletIcon(o.type)+' '+o.name : '-'}</td>
                  <td>${v.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${v.checkOutTime || '<span style="color:var(--gray-300);">—</span>'}</td>
                  <td>${formatDuration(v.checkInTime, v.checkOutTime)}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td><button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FS.openVisitDetail('${v.id}')">Detail</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== Products Page (Manager full CRUD) =====
function productFormFields(p = null) {
  return `
    <div class="form-group"><label class="label">Nama Produk</label><input class="input" name="name" value="${p?.name || ''}" required></div>
    ${entityScopeFields(p || {})}
    <div class="form-row">
      <div class="form-group"><label class="label">Brand / Merek</label><input class="input" name="brand" value="${p?.brand || ''}" placeholder="Nestlé, Unilever..." required></div>
      <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" value="${p?.sku || ''}" placeholder="NST-XXX-001" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" value="${p?.category || ''}" placeholder="Minuman, Snack..." required list="catList"></div>
      <div class="form-group"><label class="label">Satuan</label><input class="input" name="unit" value="${p?.unit || ''}" placeholder="pcs, dus, sak" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Harga Jual (Rp)</label><input class="input" type="number" name="price" value="${p?.price ?? ''}" required min="0"></div>
      <div class="form-group"><label class="label">Cost / HPP (opsional)</label><input class="input" type="number" name="cost" value="${p?.cost ?? ''}" min="0" placeholder="Opsional"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Margin % (opsional)</label><input class="input" type="number" name="margin" value="${p?.margin ?? ''}" min="0" max="100" step="0.1" placeholder="Opsional"></div>
      <div class="form-group"><label class="label">Status</label>
        <select class="select" name="status">
          <option value="active" ${!p || p.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${p?.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>
    </div>
  `;
}

function renderProductSales({ mine } = {}) {
  const empId = myEmployeeId();
  const sales = getProductSales().filter(s => !mine || s.employeeId === empId);
  const products = getProducts().filter(p => p.status === 'active');
  const outlets = getOutlets();
  const employees = getEmployees();
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const prodMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outMap = Object.fromEntries(outlets.map(o => [o.id, o]));
  const month = todayISO().slice(0, 7);
  const monthRows = sales.filter(s => String(s.date || '').startsWith(month));
  const monthTotal = monthRows.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const myTarget = mine ? salesTargetOf(employees.find(e => e.id === empId) || {}) : 0;
  const pct = myTarget > 0 ? Math.min(100, Math.round((monthTotal / myTarget) * 100)) : 0;
  return `
    ${mine ? `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Monthly target</div>
      <div class="stat-value">${formatCurrency(monthTotal)}${myTarget ? ` <small>/ ${formatCurrency(myTarget)}</small>` : ''}</div>
      <div class="mq-bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    </div>` : `<div class="grid-3" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">Sales this month</div><div class="stat-value">${formatCurrency(monthTotal)}</div></div>
      <div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">${monthRows.length}</div></div>
      <div class="stat-card"><div class="stat-label">Team target</div><div class="stat-value">${formatCurrency(employees.reduce((s, e) => s + salesTargetOf(e), 0))}</div></div>
    </div>`}
    <div class="card">
      <div class="card-title">${mine ? 'Record a sale' : 'New sale'}</div>
      <form data-pqt-onsubmit="FT.submitProductSale(event)">
        ${!mine ? `<div class="form-group"><label class="label">Employee</label>
          <select class="select" name="employeeId" required>${employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>` : `<input type="hidden" name="employeeId" value="${esc(empId || '')}">`}
        <div class="form-row">
          <div class="form-group"><label class="label">Product</label>
            <select class="select" name="productId" required data-pqt-onchange="FT.fillSalePrice(this)">
              <option value="">Select product</option>
              ${products.map(p => `<option value="${p.id}" data-price="${p.price || 0}">${esc(p.name)} (${esc(p.sku || '-')})</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="label">Outlet</label>
            <select class="select" name="outletId">
              <option value="">Optional</option>
              ${outlets.map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="label">Qty</label><input class="input" type="number" name="qty" min="1" value="1" required></div>
          <div class="form-group"><label class="label">Unit price</label><input class="input" type="number" name="unitPrice" id="saleUnitPrice" min="0" required></div>
          <div class="form-group"><label class="label">Date</label><input class="input" type="date" name="date" value="${todayISO()}" required></div>
        </div>
        <div class="form-group"><label class="label">Notes</label><input class="input" name="notes"></div>
        <button class="btn btn-primary" type="submit">Save sale</button>
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-title">Sales log</div>
      <div class="visits-table-wrapper"><table class="table">
        <thead><tr><th>Date</th>${mine ? '' : '<th>Employee</th>'}<th>Product</th><th>Outlet</th><th>Qty</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          ${sales.length ? sales.slice().sort((a,b)=>String(b.date).localeCompare(a.date)).map(s => `
            <tr>
              <td>${formatDateShort(s.date)}</td>
              ${mine ? '' : `<td>${esc(empMap[s.employeeId]?.name || s.employeeId)}</td>`}
              <td>${esc(prodMap[s.productId]?.name || s.productId)}</td>
              <td>${esc(s.outletId ? formatOutletLabel(outMap[s.outletId]) : '—')}</td>
              <td>${s.qty}</td>
              <td>${formatCurrency(s.amount)}</td>
              <td><button class="btn btn-danger btn-sm" data-pqt-onclick="FT.removeProductSale('${s.id}')">Delete</button></td>
            </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><h3>No sales yet</h3></div></td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}

window.FT.fillSalePrice = function(sel) {
  const price = sel.selectedOptions[0]?.dataset?.price;
  const input = document.getElementById('saleUnitPrice');
  if (input && price != null) input.value = price;
};

window.FT.submitProductSale = function(e) {
  e.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(e.target));
    createProductSale(data);
    showToast('Sale saved', 'success');
    render();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.FT.removeProductSale = function(id) {
  if (!confirm('Delete this sale?')) return;
  try {
    deleteProductSale(id);
    showToast('Sale deleted', 'success');
    render();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

function renderProducts() {
  const products = getProducts();
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const activeCount = products.filter(p => p.status === 'active').length;

  return `
    <div class="grid-3" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">▦</div>
        <div class="stat-label">Total Produk</div>
        <div class="stat-value">${products.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">✓</div>
        <div class="stat-label">Aktif</div>
        <div class="stat-value">${activeCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--purple-50);color:var(--purple);">◇</div>
        <div class="stat-label">Brand</div>
        <div class="stat-value">${brands.length}</div>
      </div>
    </div>
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="productSearch" placeholder="Cari nama, SKU, brand..." data-pqt-oninput="FT.filterProducts()">
        <select class="select" id="productCatFilter" style="width:140px;" data-pqt-onchange="FT.filterProducts()">
          <option value="">Semua Kategori</option>
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select class="select" id="productBrandFilter" style="width:140px;" data-pqt-onchange="FT.filterProducts()">
          <option value="">Semua Brand</option>
          ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
        </select>
        <select class="select" id="productStatusFilter" style="width:120px;" data-pqt-onchange="FT.filterProducts()">
          <option value="">Semua Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.open('products')">Bulk Upload</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openProductModal()">+ Tambah Produk</button>
      </div>
      <datalist id="catList">${cats.map(c => `<option value="${c}">`).join('')}</datalist>
      <div class="visits-table-wrapper">
        <table class="table" id="productTable">
          <thead>
            <tr>
              <th>SKU</th><th>Produk</th><th>Brand</th><th>Kategori</th>
              <th>Unit</th><th>Harga</th><th>Margin</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${products.length === 0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📦</div><h3>Belum ada produk</h3></div></td></tr>` :
            products.map(p => `
              <tr data-cat="${p.category||''}" data-brand="${p.brand||''}" data-status="${p.status||''}">
                <td><span style="font-family:ui-monospace,monospace; font-size:11px; color:var(--gray-500);">${p.sku}</span></td>
                <td><span style="font-weight:600; color:var(--gray-800);">${p.name}</span>
                  ${p.cost != null ? `<br><span style="font-size:11px;color:var(--gray-400);">HPP ${formatCurrency(p.cost)}</span>` : ''}
                </td>
                <td><span style="font-size:12px; font-weight:600; color:var(--brand-dark);">${p.brand || '—'}</span></td>
                <td><span style="font-size:11px; background:var(--gray-100); padding:3px 8px; border-radius:99px;">${p.category}</span></td>
                <td>${esc(p.unit)}</td>
                <td style="font-weight:700;">${formatCurrency(p.price)}</td>
                <td style="font-size:12px;color:var(--gray-500);">${p.margin != null ? p.margin + '%' : '—'}</td>
                <td>${statusBadge(p.status)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editProduct('${p.id}')">Edit</button>
                  <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteProductConfirm('${p.id}')">Hapus</button>
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
  const search = (document.getElementById('productSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('productCatFilter')?.value || '';
  const brand = document.getElementById('productBrandFilter')?.value || '';
  const status = document.getElementById('productStatusFilter')?.value || '';
  document.querySelectorAll('#productTable tbody tr').forEach(row => {
    if (!row.dataset.status && row.querySelector('.empty-state')) return;
    let show = true;
    if (search && !row.textContent.toLowerCase().includes(search)) show = false;
    if (cat && row.dataset.cat !== cat) show = false;
    if (brand && row.dataset.brand !== brand) show = false;
    if (status && row.dataset.status !== status) show = false;
    row.style.display = show ? '' : 'none';
  });
};

window.FT.openProductModal = function() {
  openModal('Tambah Produk', `
    <form data-pqt-onsubmit="FT.createProduct(event)">
      ${productFormFields()}
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.createProduct = function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const data = Object.fromEntries(new FormData(e.target));
  try {
    createProduct(data);
    closeModal(); showToast('Produk berhasil ditambahkan ke project', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

window.FT.editProduct = function(id) {
  if (!isProjectAdmin()) return;
  const p = getProducts().find(x => x.id === id);
  if (!p) return;
  openModal('Edit Produk', `
    <form data-pqt-onsubmit="FT.updateProduct(event,'${id}')">
      ${productFormFields(p)}
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateProduct = function(e, id) {
  e.preventDefault();
  if (!isProjectAdmin()) return;
  const data = Object.fromEntries(new FormData(e.target));
  try {
    updateProduct(id, data);
    closeModal(); showToast('Produk dan relasi project diperbarui', 'success'); render();
  } catch (error) { showToast(error.message, 'error'); }
};

window.FT.deleteProductConfirm = function(id) {
  if (!isProjectAdmin()) return;
  if (!confirm('Hapus produk ini?')) return;
  deleteProduct(id);
  showToast('Produk dihapus', 'success'); render();
};

// ===== Stocks Page (Manager) =====
function renderStocks() {
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const stocks = getStocks().filter(s => productMap[s.productId] && outletMap[s.outletId]);
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
        <input class="input search-input" id="stockSearch" placeholder="🔍 Cari stok..." data-pqt-oninput="FT.filterStocks()">
        <select class="select" id="stockOutletFilter" style="width:200px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Outlet</option>
          ${getOutlets().map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
        </select>
        <select class="select" id="stockStatusFilter" style="width:160px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Status</option>
          <option value="low">Stok Menipis</option>
          <option value="ok">Stok Aman</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openStockModal()">+ Tambah Stok</button>
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
                  <td>${outletIcon(o.type)} ${esc(o.name)}</td>
                  <td><span style="font-weight:600;">${p.name}</span><br><span style="font-size:11px; color:var(--gray-400);">${p.sku}</span></td>
                  <td style="font-weight:700; color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editStock('${s.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteStock('${s.id}')">Hapus</button>
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
    <form data-pqt-onsubmit="FT.createStock(event)">
      <div class="form-group"><label class="label">Outlet</label><select class="select" name="outletId" required>${getOutlets().map(o=>`<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Produk</label><select class="select" name="productId" required>${getProducts().filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Quantity</label><input class="input" type="number" name="quantity" required></div>
        <div class="form-group"><label class="label">Min. Stok</label><input class="input" type="number" name="minStock" value="5" required></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
    <form data-pqt-onsubmit="FT.updateStock(event,'${id}')">
      <div class="form-group"><label class="label">Outlet / Produk</label><div style="padding:10px 12px; background:var(--gray-50); border-radius:10px; font-size:14px;">${oMap[s.outletId]?.name||'-'} → ${pMap[s.productId]?.name||'-'}</div></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Quantity</label><input class="input" type="number" name="quantity" value="${s.quantity}" required></div>
        <div class="form-group"><label class="label">Min. Stok</label><input class="input" type="number" name="minStock" value="${s.minStock}" required></div>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
        <input class="input search-input" id="attSearch" placeholder="🔍 Cari karyawan..." data-pqt-oninput="FT.filterAttendance()">
        <select class="select" id="attStatusFilter" style="width:160px;" data-pqt-onchange="FT.filterAttendance()">
          <option value="">Semua Status</option>
          <option>hadir</option><option>terlambat</option><option>tidak hadir</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-secondary" type="button" data-pqt-onclick="FT.openAttendancePointModal()">+ Meeting point / kantor</button>
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
                  <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatar" style="width:28px;height:28px;font-size:11px;background:${['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'][emp.name.charCodeAt(0)%6]};">${getInitials(emp.name)}</div><span style="font-weight:600;">${esc(emp.name)}</span></div></td>
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

window.FT.openAttendancePointModal = function() {
  openModal('Titik absensi', `
    <form data-pqt-onsubmit="FS.addAttendancePoint(event)">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" required placeholder="Kantor pusat / Meeting point Senayan"></div>
      <div class="form-group"><label class="label">Jenis</label>
        <select class="select" name="type"><option value="office">Kantor</option><option value="meeting">Meeting point</option><option value="store">Toko</option></select>
      </div>
      <div class="form-group"><label class="label">Alamat</label><input class="input" name="address"></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button class="btn btn-primary">Simpan</button></div>
    </form>`);
};

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
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const leaves = getLeaves().filter(l => empMap[l.employeeId]).sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));
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
        <input class="input search-input" id="leaveSearch" placeholder="🔍 Cari pengajuan..." data-pqt-oninput="FT.filterLeaves()">
        <select class="select" id="leaveStatusFilter" style="width:160px;" data-pqt-onchange="FT.filterLeaves()">
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
                  <td><span style="font-weight:600;">${esc(emp.name)}</span></td>
                  <td><span style="font-size:12px; background:var(--gray-100); padding:4px 10px; border-radius:99px;">${l.type}</span></td>
                  <td>${formatDateShort(l.startDate)}</td>
                  <td>${formatDateShort(l.endDate)}</td>
                  <td style="text-align:center; font-weight:600;">${l.days}</td>
                  <td style="max-width:200px; font-size:13px; color:var(--gray-500);">${l.reason}</td>
                  <td>${statusBadge(l.status)}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${l.status === 'pending' ? '-' : (accMap[l.approverId] || '-')}</td>
                  <td>
                    ${l.status === 'pending' ? `
                      <button class="btn btn-primary btn-sm" style="background:var(--green-600);border-color:var(--green-600);" data-pqt-onclick="FT.approveLeave('${l.id}')">✓ Setujui</button>
                      <button class="btn btn-danger btn-sm" style="margin-left:4px;margin-top:4px;" data-pqt-onclick="FT.rejectLeave('${l.id}')">✕ Tolak</button>
                    ` : `<button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewLeave('${l.id}')">Detail</button>`}
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
      <button class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Tutup</button>
    </div>
  `);
};

// ===== My Attendance (Employee) =====
function renderMyAttendance() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  const records = getAttendance().filter(a => a.employeeId === empId).sort((a,b) => b.date.localeCompare(a.date));
  const summary = {
    hadir: records.filter(r => normalizeAttendanceStatus(r.status) === 'hadir').length,
    terlambat: records.filter(r => normalizeAttendanceStatus(r.status) === 'terlambat').length,
    tidakHadir: records.filter(r => normalizeAttendanceStatus(r.status) === 'tidak hadir').length,
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
        <button class="btn btn-primary" data-pqt-onclick="FT.openMyLeaveModal()">+ Ajukan Ijin/Cuti</button>
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
    <form data-pqt-onsubmit="FT.createMyLeave(event)">
      <div class="form-group">
        <label class="label">Tipe</label>
        <select class="select" name="type" required>
          ${leaveTypes.map(t => `<option>${t.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Tanggal Mulai</label><input class="input" type="date" name="startDate" id="leaveStart" required data-pqt-onchange="FT.calcLeaveDays()"></div>
        <div class="form-group"><label class="label">Tanggal Selesai</label><input class="input" type="date" name="endDate" id="leaveEnd" required data-pqt-onchange="FT.calcLeaveDays()"></div>
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
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
  const teamView = isSupervisor();
  const visitedIds = visitedOutletIdsForView();
  const outlets = getOutlets().filter(o => visitedIds.includes(o.id));
  const allStocks = getStocks().filter(s => visitedIds.includes(s.outletId));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(outlets.map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const lowStocks = allStocks.filter(s => s.quantity <= s.minStock);

  const activeVisits = getVisits().filter(v => v.status === 'checked-in' && (!teamView || true) && (teamView || v.employeeId === empId));

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
              <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.openVisitStockInput('${v.id}', '${v.outletId}')">Update Stok</button>
              <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openVisitPriceInput('${v.id}', '${v.outletId}')">Catat Harga</button>
              <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openVisitIntelInput('${v.id}', '${v.outletId}')">Intel</button>
              <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openVisitPhotoInput('${v.id}', '${v.outletId}')">Foto</button>
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
            <div style="font-size:13px; color:var(--red-500);">${teamView ? 'Di toko yang dikunjungi tim' : 'Di outlet yang pernah Anda kunjungi'}</div>
          </div>
        </div>
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">${teamView ? 'Stok toko tim' : 'Stok Outlet yang Dikunjungi'}</div>
      <div class="card-subtitle">${outlets.length} outlet · ${allStocks.length} record stok${teamView ? ' · mengikuti kunjungan tim' : ''}</div>
      ${allStocks.length === 0 ? `<div class="empty-state"><div class="empty-icon">📊</div><h3>Belum ada data stok</h3><p>Update stok saat check-in di outlet</p></div>` : `
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Outlet</th><th>Produk</th>${teamView ? '<th>Sales terakhir</th>' : ''}<th>Qty</th><th>Min</th><th>Status</th><th>Update</th>${teamView ? '' : '<th></th>'}</tr></thead>
          <tbody>
            ${allStocks.map(s => {
              const p = productMap[s.productId];
              const o = outletMap[s.outletId];
              if (!p || !o) return '';
              const isLow = s.quantity <= s.minStock;
              const lastVisit = getVisits().filter(v => v.outletId === s.outletId && v.checkInTime)
                .sort((a, b) => `${visitDay(b)} ${b.checkInTime}`.localeCompare(`${visitDay(a)} ${a.checkInTime}`))[0];
              const salesName = lastVisit ? (empMap[lastVisit.employeeId]?.name || lastVisit.employeeId) : '—';
              return `
                <tr>
                  <td>${outletIcon(o.type)} ${esc(o.name)}</td>
                  <td><span style="font-weight:600;">${p.name}</span><br><span style="font-size:11px;color:var(--gray-400);">${p.sku}</span></td>
                  ${teamView ? `<td>${esc(salesName)}</td>` : ''}
                  <td style="font-weight:700;color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px;color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  ${teamView ? '' : `<td><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editStock('${s.id}')">Edit</button></td>`}
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
  const teamView = isSupervisor();
  const teamIds = new Set(getEmployees().map(e => e.id));
  const visitedIds = visitedOutletIdsForView();
  const observations = getPriceObservations().filter(p => teamView
    ? visitedIds.includes(p.outletId) || teamIds.has(p.recordedBy)
    : (p.recordedBy === empId || visitedIds.includes(p.outletId)));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));

  const activeVisits = getVisits().filter(v => v.status === 'checked-in' && (teamView || v.employeeId === empId));

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
              <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.openVisitPriceInput('${v.id}', '${v.outletId}')">+ Catat Harga/Diskon</button>
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
        <button class="btn btn-primary" data-pqt-onclick="FT.openPriceObsModal()">+ Catat Observasi</button>
      </div>
      <div class="card-subtitle" style="margin-top:8px;">${teamView ? 'Data dari kunjungan tim Anda' : 'Data dari outlet yang pernah Anda kunjungi'}</div>
      ${observations.length === 0 ? `<div class="empty-state"><div class="empty-icon">💰</div><h3>Belum ada data harga</h3><p>Catat harga saat kunjungan ke outlet</p></div>` : `
      <div class="visits-table-wrapper" style="margin-top:12px;">
        <table class="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              ${teamView ? '<th>Sales</th>' : ''}
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
              const o = outletMap[obs.outletId] || getOutlets().find(x => x.id === obs.outletId);
              if (!obs.productId && !obs.observedPrice) return '';
              const official = p?.price || 0;
              const diff = obs.observedPrice - official;
              const diffStr = diff === 0 ? '-' : (diff > 0 ? `+${formatCurrency(diff)}` : formatCurrency(diff));
              const diffColor = diff > 0 ? 'var(--red-500)' : diff < 0 ? 'var(--green-600)' : 'var(--gray-400)';
              const discStr = obs.discountPercent > 0
                ? `${obs.discountPercent}%${obs.discountAmount ? ' (Rp '+obs.discountAmount.toLocaleString('id-ID')+')' : ''}`
                : (obs.discountAmount > 0 ? 'Rp '+obs.discountAmount.toLocaleString('id-ID') : '-');
              return `
                <tr>
                  <td style="font-size:13px;">${formatDateShort(obs.recordedAt)}</td>
                  ${teamView ? `<td>${esc(empMap[obs.recordedBy]?.name || obs.recordedBy || '—')}</td>` : ''}
                  <td>${o ? outletIcon(o.type)+' '+esc(o.name) : esc(obs.outletId || '—')}</td>
                  <td><span style="font-weight:600;">${esc(p?.name || obs.productId || '—')}</span><br><span style="font-size:11px;color:var(--gray-400);">${esc(p?.sku || '')}</span></td>
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
    <form data-pqt-onsubmit="FT.saveVisitStock(event, '${visitId}', '${outletId}')">
      ${productPickerRows('stock', outletId)}
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
  const empId = myEmployeeId();
  const rows = [...e.target.querySelectorAll('.fs-product-row')];
  try {
    rows.forEach(row => {
      const productId = row.querySelector('[name="productId"]')?.value;
      const quantity = parseInt(row.querySelector('[name="quantity"]')?.value, 10);
      const minStock = parseInt(row.querySelector('[name="minStock"]')?.value, 10);
      if (!productId) return;
      const existing = getStocksByOutlet(outletId).find(s => s.productId === productId);
      if (existing) updateStock(existing.id, { quantity, minStock, updatedBy: empId });
      else createStock({ outletId, productId, quantity, minStock, updatedBy: empId });
    });
    closeModal();
    showToast(`${rows.length} produk stok disimpan`, 'success');
    render();
  } catch (error) { showToast(error.message || error, 'error'); }
};

// ===== Price/Discount input during visit =====
window.FT.openVisitPriceInput = function(visitId, outletId) {
  const outlet = getOutlets().find(o => o.id === outletId);
  const products = getProducts().filter(p => p.status === 'active');

  openModal('Catat Harga & Diskon — ' + (outlet?.name || outletId), `
    <div style="margin-bottom:16px; padding:12px; background:#fffbeb; border-radius:10px; font-size:13px; color:var(--amber-700);">
      💰 Catat harga jual dan diskon yang teramati di outlet ini
    </div>
    <form data-pqt-onsubmit="FT.saveVisitPrice(event, '${visitId}', '${outletId}')">
      ${productPickerRows('price', outletId)}
      <div class="form-group">
        <label class="label">Catatan</label>
        <textarea class="textarea" name="notes" placeholder="Promo, kompetitor, perubahan harga, dll..."></textarea>
      </div>
      <div class="modal-footer" style="padding:0; margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Observasi</button>
      </div>
    </form>
  `);
};

window.FT.saveVisitPrice = function(e, visitId, outletId) {
  e.preventDefault();
  const empId = myEmployeeId();
  const rows = [...e.target.querySelectorAll('.fs-product-row')];
  try {
    rows.forEach(row => {
      const productId = row.querySelector('[name="productId"]')?.value;
      if (!productId) return;
      createPriceObservation({
        projectId: getVisits().find(v => v.id === visitId)?.projectId || null,
        visitId, outletId, productId,
        observedPrice: parseInt(row.querySelector('[name="observedPrice"]')?.value, 10),
        discountPercent: parseFloat(row.querySelector('[name="discountPercent"]')?.value) || 0,
        discountAmount: parseInt(row.querySelector('[name="discountAmount"]')?.value, 10) || 0,
        notes: e.target.querySelector('[name="notes"]')?.value || '',
        recordedBy: empId,
      });
    });
    closeModal();
    showToast(`${rows.length} observasi harga disimpan`, 'success');
    render();
  } catch (error) { showToast(error.message || error, 'error'); }
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
    <form data-pqt-onsubmit="FT.saveStandalonePrice(event)">
      <div class="form-group">
        <label class="label">Outlet (yang pernah dikunjungi)</label>
        <select class="select" name="outletId" required>
          <option value="">— Pilih outlet —</option>
          ${outlets.map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
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
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
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
  try {
    createPriceObservation({
      projectId: fd.get('projectId') || recentVisit?.projectId || null,
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
  } catch (error) { showToast(error.message || error, 'error'); }
};


// ===== COMPETITORS (Manager) =====
function renderCompetitors() {
  const competitors = getCompetitors();
  const cpd = getCompetitorProducts();
  const byComp = {};
  cpd.forEach(p => { if (!byComp[p.competitorId]) byComp[p.competitorId] = []; byComp[p.competitorId].push(p); });

  return `
    <div class="grid-2" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--purple-50);color:var(--purple);">◇</div>
        <div class="stat-label">Merek Kompetitor</div>
        <div class="stat-value">${competitors.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber);">▦</div>
        <div class="stat-label">Produk Kompetitor</div>
        <div class="stat-value">${cpd.length}</div>
      </div>
    </div>

    <div class="card">
      <div class="filter-row">
        <div class="card-title" style="margin:0;">Master Kompetitor</div>
        <div class="spacer"></div>
        ${isOrgAdmin() ? `
        <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.open('competitors')">Bulk Merek</button>
        <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.open('competitorProducts')">Bulk Produk</button>
        <button class="btn btn-secondary" data-pqt-onclick="FT.openCompetitorProductModal()">+ Produk Kompetitor</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openCompetitorModal()">+ Merek Kompetitor</button>
        ` : ''}
      </div>
      <div class="card-subtitle">Kelola merek pesaing & katalog produknya</div>

      ${competitors.length === 0 ? `<div class="empty-state"><div class="empty-icon">◇</div><h3>Belum ada kompetitor</h3></div>` : `
      <div style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
        ${competitors.map(c => {
          const prods = byComp[c.id] || [];
          return `
            <div style="border:1px solid var(--gray-200); border-radius:var(--radius); padding:14px; background:var(--gray-50);">
              <div style="display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="width:14px;height:14px;border-radius:4px;background:${safeColor(c.color)};margin-top:4px;flex-shrink:0;"></div>
                <div style="flex:1;min-width:140px;">
                  <div style="font-weight:700;font-size:15px;color:var(--gray-900);">${esc(c.name)} ${statusBadge(c.status)}</div>
                  <div style="font-size:12px;color:var(--gray-400);margin-top:2px;">${esc(c.category || '—')} · ${prods.length} produk</div>
                  ${c.notes ? `<div style="font-size:12px;color:var(--gray-500);margin-top:6px;">${esc(c.notes)}</div>` : ''}
                </div>
                <div style="display:${isOrgAdmin() ? 'flex' : 'none'};gap:6px;flex-wrap:wrap;">
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openCompetitorProductModal(${jsArg(c.id)})">+ Produk</button>
                  <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editCompetitor(${jsArg(c.id)})">Edit</button>
                  <button class="btn btn-danger btn-sm" data-pqt-onclick="FT.deleteCompetitorConfirm(${jsArg(c.id)})">Arsipkan</button>
                </div>
              </div>
              ${prods.length ? `
                <div class="visits-table-wrapper" style="margin-top:12px;">
                  <table class="table" style="min-width:400px;background:white;border-radius:8px;">
                    <thead><tr><th>SKU</th><th>Nama</th><th>Harga Tipikal</th><th>Unit</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      ${prods.map(p => `
                        <tr>
                          <td style="font-family:monospace;font-size:11px;color:var(--gray-500);">${esc(p.sku||'—')}</td>
                          <td style="font-weight:600;">${esc(p.name)}</td>
                          <td>${formatCurrency(p.typicalPrice)}</td>
                          <td>${esc(p.unit)}</td>
                          <td>${statusBadge(p.status)}</td>
                          <td style="display:${isOrgAdmin() ? 'table-cell' : 'none'};">
                            <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editCompetitorProduct(${jsArg(p.id)})">Edit</button>
                            <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteCompetitorProductConfirm(${jsArg(p.id)})">Arsipkan</button>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `<div style="margin-top:10px;font-size:12px;color:var(--gray-400);">Belum ada produk kompetitor</div>`}
            </div>
          `;
        }).join('')}
      </div>
      `}
    </div>
  `;
}

window.FT.openCompetitorModal = function() {
  if (!isProjectAdmin()) return;
  openModal('Tambah Merek Kompetitor', `
    <form data-pqt-onsubmit="FT.saveCompetitor(event)">
      <div class="form-group"><label class="label">Nama Merek</label><input class="input" name="name" required placeholder="Danone, P&G..."></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" placeholder="Susu, Kebersihan..."></div>
        <div class="form-group"><label class="label">Warna</label><input class="input" type="color" name="color" value="#64748b" style="height:44px;padding:4px;"></div>
      </div>
      <div class="form-group"><label class="label">Catatan</label><textarea class="textarea" name="notes" placeholder="Posisi pasar, brand strength..."></textarea></div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.saveCompetitor = function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) return;
  const data = Object.fromEntries(new FormData(e.target));
  createCompetitor(data);
  closeModal(); showToast('Kompetitor ditambahkan', 'success'); render();
};

window.FT.editCompetitor = function(id) {
  if (!isProjectAdmin()) return;
  const c = getCompetitors().find(x => x.id === id);
  if (!c) return;
  openModal('Edit Kompetitor', `
    <form data-pqt-onsubmit="FT.updateCompetitorForm(event,${jsArg(id)})">
      <div class="form-group"><label class="label">Nama Merek</label><input class="input" name="name" value="${esc(c.name)}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" value="${esc(c.category||'')}"></div>
        <div class="form-group"><label class="label">Warna</label><input class="input" type="color" name="color" value="${safeColor(c.color)}" style="height:44px;padding:4px;"></div>
      </div>
      <div class="form-group"><label class="label">Status</label>
        <select class="select" name="status">
          <option value="active" ${c.status==='active'?'selected':''}>Active</option>
          <option value="inactive" ${c.status==='inactive'?'selected':''}>Inactive</option>
        </select>
      </div>
      <div class="form-group"><label class="label">Catatan</label><textarea class="textarea" name="notes">${esc(c.notes||'')}</textarea></div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateCompetitorForm = function(e, id) {
  e.preventDefault();
  if (!isProjectAdmin()) return;
  updateCompetitor(id, Object.fromEntries(new FormData(e.target)));
  closeModal(); showToast('Kompetitor diperbarui', 'success'); render();
};

window.FT.deleteCompetitorConfirm = function(id) {
  if (!isOrgAdmin()) return;
  if (!confirm('Arsipkan kompetitor? Produk dan histori tetap tersimpan.')) return;
  deleteCompetitor(id);
  showToast('Kompetitor diarsipkan', 'success'); render();
};

window.FT.openCompetitorProductModal = function(competitorId) {
  if (!isProjectAdmin()) return;
  const competitors = getCompetitors().filter(c => c.status === 'active');
  openModal('Tambah Produk Kompetitor', `
    <form data-pqt-onsubmit="FT.saveCompetitorProduct(event)">
      <div class="form-group"><label class="label">Merek Kompetitor</label>
        <select class="select" name="competitorId" required>
          <option value="">— Pilih —</option>
          ${competitors.map(c => `<option value="${esc(c.id)}" ${c.id===competitorId?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="label">Nama Produk</label><input class="input" name="name" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" placeholder="CPD-001"></div>
        <div class="form-group"><label class="label">Unit</label><input class="input" name="unit" value="pcs" required></div>
      </div>
      <div class="form-group"><label class="label">Harga Tipikal (Rp)</label><input class="input" type="number" name="typicalPrice" required min="0"></div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.saveCompetitorProduct = function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) return;
  const data = Object.fromEntries(new FormData(e.target));
  createCompetitorProduct(data);
  closeModal(); showToast('Produk kompetitor ditambahkan', 'success'); render();
};

window.FT.editCompetitorProduct = function(id) {
  if (!isProjectAdmin()) return;
  const p = getCompetitorProducts().find(x => x.id === id);
  if (!p) return;
  const competitors = getCompetitors();
  openModal('Edit Produk Kompetitor', `
    <form data-pqt-onsubmit="FT.updateCompetitorProductForm(event,${jsArg(id)})">
      <div class="form-group"><label class="label">Merek</label>
        <select class="select" name="competitorId" required>
          ${competitors.map(c => `<option value="${esc(c.id)}" ${c.id===p.competitorId?'selected':''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(p.name)}" required></div>
      <div class="form-row">
        <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" value="${esc(p.sku||'')}"></div>
        <div class="form-group"><label class="label">Unit</label><input class="input" name="unit" value="${esc(p.unit)}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Harga Tipikal</label><input class="input" type="number" name="typicalPrice" value="${p.typicalPrice}" required></div>
        <div class="form-group"><label class="label">Status</label>
          <select class="select" name="status">
            <option value="active" ${p.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${p.status==='inactive'?'selected':''}>Inactive</option>
          </select>
        </div>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan</button>
      </div>
    </form>
  `);
};

window.FT.updateCompetitorProductForm = function(e, id) {
  e.preventDefault();
  if (!isProjectAdmin()) return;
  updateCompetitorProduct(id, Object.fromEntries(new FormData(e.target)));
  closeModal(); showToast('Produk kompetitor diperbarui', 'success'); render();
};

window.FT.deleteCompetitorProductConfirm = function(id) {
  if (!isOrgAdmin()) return;
  if (!confirm('Arsipkan produk kompetitor ini? Histori tetap tersimpan.')) return;
  deleteCompetitorProduct(id);
  showToast('Diarsipkan', 'success'); render();
};

// ===== Competitor Analysis (Manager) =====
function renderCompetitorAnalysis() {
  const summary = getCompetitorAnalysisSummary();
  const intel = [...getCompetitorIntel()].sort((a, b) => (b.recordedAt||'').localeCompare(a.recordedAt||''));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const cpdMap = Object.fromEntries(getCompetitorProducts().map(p => [p.id, p]));
  const compMap = Object.fromEntries(getCompetitors().map(c => [c.id, c]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));

  const totalIntel = intel.length;
  const avgShare = totalIntel ? Math.round(intel.reduce((s, i) => s + (i.shelfShare || 0), 0) / totalIntel) : 0;
  const promoCount = intel.filter(i => i.hasPromo).length;
  const weLosePrice = intel.filter(i => i.ourPrice > i.competitorPrice).length;

  return `
    <div class="grid-4" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--blue-50);color:var(--blue-600);">◇</div>
        <div class="stat-label">Total Intel</div>
        <div class="stat-value">${totalIntel}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">▥</div>
        <div class="stat-label">Avg Shelf Share Kita</div>
        <div class="stat-value">${avgShare}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber);">▣</div>
        <div class="stat-label">Intel Ada Promo</div>
        <div class="stat-value">${promoCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--red-50);color:var(--red);">↓</div>
        <div class="stat-label">Kita Lebih Mahal</div>
        <div class="stat-value">${weLosePrice}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Ringkasan per Merek</div>
      <div class="card-subtitle">Avg price gap = harga kita − harga kompetitor (positif = kita lebih mahal)</div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Merek</th><th>Kategori</th><th>Intel</th>
              <th>Avg Price Gap</th><th>Avg Shelf Share</th>
              <th>Promo</th><th>Lebih Murah</th><th>Lebih Mahal</th>
            </tr>
          </thead>
          <tbody>
            ${summary.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><h3>Belum ada data</h3></div></td></tr>` :
            summary.map(s => {
              const gapColor = s.avgPriceGap > 0 ? 'var(--red)' : s.avgPriceGap < 0 ? 'var(--green)' : 'var(--gray-500)';
              const gapLabel = s.intelCount
                ? (s.avgPriceGap > 0 ? `+${formatCurrency(s.avgPriceGap)}` : formatCurrency(s.avgPriceGap))
                : '—';
              return `
                <tr>
                  <td>
                    <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;">
                      <span style="width:10px;height:10px;border-radius:3px;background:${s.color||'#94a3b8'};"></span>
                      ${s.name}
                    </span>
                  </td>
                  <td style="font-size:12px;color:var(--gray-500);">${s.category||'—'}</td>
                  <td style="font-weight:700;">${s.intelCount}</td>
                  <td style="font-weight:600;color:${gapColor};">${gapLabel}</td>
                  <td>
                    ${s.intelCount ? `
                      <div style="display:flex;align-items:center;gap:8px;">
                        <div class="progress-bar" style="width:64px;"><div class="progress-fill" style="width:${Math.min(100,s.avgShelfShare)}%;"></div></div>
                        <span style="font-weight:600;">${s.avgShelfShare}%</span>
                      </div>
                    ` : '—'}
                  </td>
                  <td>${s.promoCount}</td>
                  <td style="color:var(--red);font-weight:600;" title="Berapa kali harga kompetitor lebih murah">${s.cheaperCount}</td>
                  <td style="color:var(--green);font-weight:600;">${s.moreExpensiveCount}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Riwayat Intel Lapangan</div>
      <div class="card-subtitle">Semua observasi dari field sales & supervisor</div>
      ${intel.length === 0 ? `<div class="empty-state"><div class="empty-icon">◇</div><h3>Belum ada intel</h3></div>` : `
      <div class="visits-table-wrapper">
        <table class="table" style="min-width:720px;">
          <thead>
            <tr>
              <th>Tanggal</th><th>Sales</th><th>Outlet</th>
              <th>Produk Kita</th><th>Kompetitor</th>
              <th>Harga Kita</th><th>Harga Kompetitor</th>
              <th>Gap</th><th>Shelf %</th><th>Vis</th><th>Promo</th><th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${intel.map(i => {
              const our = productMap[i.productId];
              const cp = cpdMap[i.competitorProductId];
              const comp = cp ? compMap[cp.competitorId] : null;
              const o = outletMap[i.outletId];
              const emp = empMap[i.recordedBy || i.employeeId];
              const gap = (i.ourPrice || 0) - (i.competitorPrice || 0);
              const gapColor = gap > 0 ? 'var(--red)' : gap < 0 ? 'var(--green)' : 'var(--gray-400)';
              return `
                <tr>
                  <td style="font-size:12px;">${formatDateShort(i.recordedAt)}</td>
                  <td style="font-size:12px;">${esc(emp?.name?.split(' ')[0] || '—')}</td>
                  <td>${o ? outletIcon(o.type)+' '+o.name : i.outletId}</td>
                  <td><span style="font-weight:600;">${our?.name || '—'}</span><br><span style="font-size:11px;color:var(--gray-400);">${our?.brand||''}</span></td>
                  <td>
                    <span style="font-weight:600;">${cp?.name || '—'}</span>
                    <br><span style="font-size:11px;color:${comp?.color||'var(--gray-400)'};">${comp?.name||''}</span>
                  </td>
                  <td style="font-weight:600;">${formatCurrency(i.ourPrice)}</td>
                  <td style="font-weight:600;">${formatCurrency(i.competitorPrice)}</td>
                  <td style="font-weight:700;color:${gapColor};">${gap===0?'—':(gap>0?'+':'')+formatCurrency(gap).replace('Rp ','Rp ')}</td>
                  <td style="font-weight:600;">${i.shelfShare != null && i.shelfShare !== '' ? `${i.shelfShare}%` : '—'}</td>
                  <td>${visibilityBadge(i.visibility)}</td>
                  <td>${promoBadgeHTML(i)}</td>
                  <td style="font-size:11px;color:var(--gray-500);max-width:140px;">${i.promoNotes || i.notes || '—'}</td>
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

function promoBadgeHTML(intel) {
  if (!intel.hasPromo) return '—';
  const label = getPromoTypeLabel(intel.promoType, intel.promoType === 'custom' ? intel.promoNotes : '')
    || intel.promoNotes
    || 'Promo';
  const pt = getPromoTypes().find(p => p.code === intel.promoType);
  const strategic = pt?.strategic;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${strategic ? '#fef3c7' : '#fff7ed'};color:${strategic ? '#b45309' : 'var(--amber)'};max-width:140px;line-height:1.3;" title="${(intel.promoNotes || '').replace(/"/g, '&quot;')}">${label}${strategic ? ' ★' : ''}</span>`;
}

// ===== Employee: Intel Kompetitor =====
function renderMyIntel() {
  const empId = myEmployeeId();
  const teamView = isSupervisor();
  const teamIds = new Set(getEmployees().map(e => e.id));
  const visitedIds = visitedOutletIdsForView();
  const intel = getCompetitorIntel().filter(i => teamView
    ? visitedIds.includes(i.outletId) || teamIds.has(i.recordedBy) || teamIds.has(i.employeeId)
    : (i.recordedBy === empId || visitedIds.includes(i.outletId)));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const cpdMap = Object.fromEntries(getCompetitorProducts().map(p => [p.id, p]));
  const compMap = Object.fromEntries(getCompetitors().map(c => [c.id, c]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const activeVisits = getVisits().filter(v => v.status === 'checked-in' && (teamView || v.employeeId === empId));

  return `
    ${activeVisits.length > 0 ? `
      <div class="card" style="margin-bottom:16px; border-color:#c4b5fd; background:var(--purple-light);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--purple);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;">◇</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--purple);">Catat Intel Saat Ini</div>
            <div style="font-size:12px;color:var(--gray-500);">Anda checked-in — bandingkan produk kita vs kompetitor</div>
          </div>
        </div>
        ${activeVisits.map(v => {
          const o = outletMap[v.outletId] || getOutlets().find(x => x.id === v.outletId);
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:white;border-radius:10px;margin-bottom:8px;">
              <div style="font-size:22px;">${o ? outletIcon(o.type) : '🏪'}</div>
              <div style="flex:1;">
                <div style="font-weight:600;">${o?.name || v.outletId}</div>
                <div style="font-size:12px;color:var(--gray-400);">Check in: ${v.checkInTime}</div>
              </div>
              <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.openVisitIntelInput('${v.id}','${v.outletId}')">+ Catat Intel</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="grid-3" style="margin-bottom:14px;">
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--purple-50);color:var(--purple);">◇</div>
        <div class="stat-label">Total Intel</div>
        <div class="stat-value">${intel.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--amber-50);color:var(--amber);">▣</div>
        <div class="stat-label">Ada Promo</div>
        <div class="stat-value">${intel.filter(i => i.hasPromo).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:var(--green-50);color:var(--green-600);">⬡</div>
        <div class="stat-label">Outlet</div>
        <div class="stat-value">${new Set(intel.map(i => i.outletId)).size}</div>
      </div>
    </div>

    <div class="card">
      <div class="filter-row">
        <div class="card-title" style="margin:0;">${teamView ? 'Intel tim' : 'Riwayat Intel Saya'}</div>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openStandaloneIntelModal()">+ Catat Intel</button>
      </div>
      <div class="card-subtitle">${teamView ? 'Mengikuti aktivitas kunjungan tim' : 'Hanya outlet yang pernah Anda kunjungi'}</div>
      ${intel.length === 0 ? `<div class="empty-state"><div class="empty-icon">◇</div><h3>Belum ada intel</h3><p>Catat saat check-in di outlet</p></div>` : `
      <div class="visits-table-wrapper" style="margin-top:12px;">
        <table class="table" style="min-width:640px;">
          <thead>
            <tr>
              <th>Tanggal</th>${teamView ? '<th>Sales</th>' : ''}<th>Outlet</th><th>Produk Kita</th><th>vs Kompetitor</th>
              <th>Harga</th><th>Shelf</th><th>Vis</th><th>Promo</th><th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${intel.sort((a,b)=>(b.recordedAt||'').localeCompare(a.recordedAt||'')).map(i => {
              const our = productMap[i.productId];
              const cp = cpdMap[i.competitorProductId];
              const comp = cp ? compMap[cp.competitorId] : null;
              const o = outletMap[i.outletId];
              const gap = (i.ourPrice||0) - (i.competitorPrice||0);
              return `
                <tr>
                  <td style="font-size:12px;">${formatDateShort(i.recordedAt)}</td>
                  ${teamView ? `<td>${esc(empMap[i.recordedBy]?.name || empMap[i.employeeId]?.name || '—')}</td>` : ''}
                  <td>${o ? outletIcon(o.type)+' '+o.name : '—'}</td>
                  <td style="font-weight:600;">${our?.name||'—'}</td>
                  <td>
                    <span style="font-weight:600;">${cp?.name||'—'}</span>
                    <br><span style="font-size:11px;color:${comp?.color||'#94a3b8'};">${comp?.name||''}</span>
                  </td>
                  <td style="font-size:12px;">
                    <div>Kita: <b>${formatCurrency(i.ourPrice)}</b></div>
                    <div>Komp: <b>${formatCurrency(i.competitorPrice)}</b></div>
                    <div style="color:${gap>0?'var(--red)':gap<0?'var(--green)':'var(--gray-400)'};font-weight:600;">
                      Gap ${gap===0?'0':(gap>0?'+':'')+formatCurrency(gap)}
                    </div>
                  </td>
                  <td style="font-weight:700;">${i.shelfShare}%</td>
                  <td>${visibilityBadge(i.visibility)}</td>
                  <td>${promoBadgeHTML(i)}</td>
                  <td style="font-size:11px;color:var(--gray-500);max-width:120px;">${i.promoNotes||i.notes||'—'}</td>
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

function intelFormHTML(visitId, outletId, opts = {}) {
  const products = opts.products || getProducts().filter(p => p.status === 'active');
  const competitors = getCompetitors().filter(c => c.status === 'active');
  const cpd = getCompetitorProducts().filter(p => p.status === 'active');
  const outlets = opts.outlets;
  const promoTypes = getPromoTypes();

  return `
    <form data-pqt-onsubmit="FT.saveCompetitorIntel(event, ${visitId ? `'${visitId}'` : 'null'}, ${outletId ? `'${outletId}'` : 'null'})">
      ${!outletId && outlets ? `
        <div class="form-group">
          <label class="label">Outlet (pernah dikunjungi)</label>
          <select class="select" name="outletId" required>
            <option value="">— Pilih outlet —</option>
            ${outlets.map(o => `<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}
          </select>
        </div>
      ` : `<input type="hidden" name="outletId" value="${outletId||''}">`}
      <div class="form-group">
        <label class="label">Produk Kita</label>
        <select class="select" name="productId" id="intelOurProduct" required data-pqt-onchange="FT.prefillOurPrice()">
          <option value="">— Pilih produk —</option>
          ${products.map(p => `<option value="${p.id}" data-price="${p.price}">${p.brand ? p.brand+' · ' : ''}${p.name} (${formatCurrency(p.price)})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Produk Kompetitor</label>
        <select class="select" name="competitorProductId" id="intelCompProduct" required data-pqt-onchange="FT.prefillCompPrice()">
          <option value="">— Pilih —</option>
          ${cpd.map(p => {
            const c = competitors.find(x => x.id === p.competitorId);
            return `<option value="${p.id}" data-price="${p.typicalPrice}">${c?.name||'?'} · ${p.name} (tipikal ${formatCurrency(p.typicalPrice)})</option>`;
          }).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Harga Kita (Rp)</label>
          <input class="input" type="number" name="ourPrice" id="intelOurPrice" required min="0">
        </div>
        <div class="form-group">
          <label class="label">Harga Kompetitor (Rp)</label>
          <input class="input" type="number" name="competitorPrice" id="intelCompPrice" required min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Shelf Share Kita (%)</label>
          <input class="input" type="number" name="shelfShare" min="0" max="100" value="50" required>
        </div>
        <div class="form-group">
          <label class="label">Visibility</label>
          <select class="select" name="visibility">
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="label" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="hasPromo" value="true" id="intelHasPromo" data-pqt-onchange="FT.toggleIntelPromoFields(this.checked)">
          Ada promo kompetitor / di rak
        </label>
      </div>
      <div id="intelPromoFields" style="display:none;">
        <div class="form-group">
          <label class="label">Jenis Promo <span style="color:var(--red);">*</span></label>
          <select class="select" name="promoType" id="intelPromoType" data-pqt-onchange="FT.toggleIntelPromoCustom(this.value)">
            <option value="">— Pilih jenis promo —</option>
            ${promoTypes.map(t => `
              <option value="${t.code}">${t.label}${t.strategic ? ' ★ strategis' : ''}</option>
            `).join('')}
          </select>
          <div style="font-size:11px;color:var(--gray-400);margin-top:4px;">★ = promo strategis (trade, display, bundle, event, loyalty)</div>
        </div>
        <div class="form-group" id="intelPromoCustomWrap" style="display:none;">
          <label class="label">Jenis custom <span style="color:var(--red);">*</span></label>
          <input class="input" type="text" name="promoTypeCustom" id="intelPromoTypeCustom" placeholder="Sebutkan jenis promo yang tidak terdaftar">
        </div>
        <div class="form-group">
          <label class="label">Detail Promo</label>
          <textarea class="textarea" name="promoNotes" placeholder="Contoh: diskon 15%, beli 2 gratis 1, free display 1 gondola..."></textarea>
        </div>
      </div>
      <div class="form-group">
        <label class="label">Catatan Lapangan</label>
        <textarea class="textarea" name="notes" placeholder="Posisi rak, reaksi owner, dsb..."></textarea>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Simpan Intel</button>
        <button type="submit" class="btn btn-secondary" data-more="1">Simpan & produk lain</button>
      </div>
    </form>
  `;
}

window.FT.prefillOurPrice = function() {
  const sel = document.getElementById('intelOurProduct');
  const opt = sel?.options[sel.selectedIndex];
  if (opt?.dataset.price) document.getElementById('intelOurPrice').value = opt.dataset.price;
};

window.FT.prefillCompPrice = function() {
  const sel = document.getElementById('intelCompProduct');
  const opt = sel?.options[sel.selectedIndex];
  if (opt?.dataset.price) document.getElementById('intelCompPrice').value = opt.dataset.price;
};

window.FT.toggleIntelPromoFields = function(checked) {
  const box = document.getElementById('intelPromoFields');
  if (box) box.style.display = checked ? 'block' : 'none';
  if (!checked) {
    const typeSel = document.getElementById('intelPromoType');
    if (typeSel) typeSel.value = '';
    window.FT.toggleIntelPromoCustom('');
  }
};

window.FT.toggleIntelPromoCustom = function(code) {
  const wrap = document.getElementById('intelPromoCustomWrap');
  if (wrap) wrap.style.display = code === 'custom' ? 'block' : 'none';
};

window.FT.openVisitIntelInput = function(visitId, outletId) {
  const outlet = getOutlets().find(o => o.id === outletId);
  const stockProductIds = new Set(getStocksByOutlet(outletId).map(s => s.productId));
  let products = getProducts().filter(p => p.status === 'active' && (stockProductIds.size === 0 || stockProductIds.has(p.id)));
  if (!products.length) products = getProducts().filter(p => p.status === 'active');
  openModal('Intel Kompetitor — ' + (outlet?.name || outletId), `
    <div style="margin-bottom:14px;padding:12px;background:var(--purple-light);border-radius:10px;font-size:13px;color:var(--purple);">
      Bandingkan harga, shelf share, dan visibility produk kita vs kompetitor di outlet ini
    </div>
    ${intelFormHTML(visitId, outletId, { products })}
  `);
};

window.FT.openStandaloneIntelModal = function() {
  const empId = myEmployeeId();
  const visitedIds = getVisitedOutletIds(empId);
  const outlets = getOutlets().filter(o => visitedIds.includes(o.id));
  if (!outlets.length) {
    showToast('Belum ada outlet yang dikunjungi', 'error');
    return;
  }
  const products = getProductsForVisitedOutlets(empId);
  openModal('Catat Intel Kompetitor', intelFormHTML(null, null, { outlets, products: products.length ? products : getProducts().filter(p => p.status==='active') }));
};

window.FT.saveCompetitorIntel = function(e, visitId, outletId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const empId = myEmployeeId();
  if (!empId && !isProjectAdmin()) {
    showToast('Akses ditolak', 'error');
    return;
  }
  let outId = outletId || fd.get('outletId');
  if (!isProjectAdmin()) {
    const visited = getVisitedOutletIds(empId);
    if (!visited.includes(outId)) {
      showToast('Outlet tidak diizinkan (belum dikunjungi)', 'error');
      return;
    }
  }
  // Link visit if standalone
  let vId = visitId;
  let recent = null;
  if (empId && outId) {
    recent = getVisits().filter(v => v.employeeId === empId && v.outletId === outId)
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
    if (!vId) vId = recent?.id || null;
  }
  const hasPromo = fd.get('hasPromo') === 'true' || fd.get('hasPromo') === 'on';
  let promoType = fd.get('promoType') || '';
  let promoNotes = fd.get('promoNotes') || '';
  if (hasPromo) {
    if (!promoType) {
      showToast('Pilih jenis promo', 'error');
      return;
    }
    if (promoType === 'custom') {
      const custom = (fd.get('promoTypeCustom') || '').trim();
      if (!custom) {
        showToast('Isi jenis promo custom', 'error');
        return;
      }
      // Simpan label custom di promoNotes jika detail kosong, atau gabungkan
      if (!promoNotes) promoNotes = custom;
      else promoNotes = `[${custom}] ${promoNotes}`;
    }
  } else {
    promoType = '';
  }
  try {
  createCompetitorIntel({
    projectId: fd.get('projectId') || recent?.projectId || null,
    visitId: vId,
    outletId: outId,
    productId: fd.get('productId'),
    competitorProductId: fd.get('competitorProductId'),
    ourPrice: parseInt(fd.get('ourPrice'), 10),
    competitorPrice: parseInt(fd.get('competitorPrice'), 10),
    shelfShare: parseInt(fd.get('shelfShare'), 10),
    visibility: fd.get('visibility') || 'medium',
    hasPromo,
    promoType: hasPromo ? promoType : '',
    promoNotes,
    notes: fd.get('notes') || '',
    recordedBy: empId || state.account?.id || 'manager',
  });
  closeModal();
  showToast('Intel kompetitor tersimpan', 'success');
  if (e.submitter?.dataset?.more && visitId && outletId) {
    FT.openVisitIntelInput(visitId, outletId);
    return;
  }
  render();
  } catch (error) { showToast(error.message || error, 'error'); }
};

// ===== Field Photos =====
function renderFieldPhotosGallery({ managerView }) {
  const empId = myEmployeeId();
  let photos = managerView
    ? [...getFieldPhotos()]
    : [...getFieldPhotosByEmployee(empId)];
  photos.sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
  photos = applyPhotoFilters(photos);
  const filterType = state._photoFilters?.type || state._photoFilterType || '';

  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const empMap = Object.fromEntries(getEmployees().map(e => [e.id, e]));
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const compMap = Object.fromEntries(getCompetitors().map(c => [c.id, c]));
  const activeVisits = !managerView && empId
    ? getVisits().filter(v => v.employeeId === empId && v.status === 'checked-in')
    : [];

  const byType = FIELD_PHOTO_TYPES.map(t => ({
    ...t,
    count: (managerView ? getFieldPhotos() : getFieldPhotosByEmployee(empId)).filter(p => (p.photoType || p.type) === t.code).length,
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
        <div class="stat-value">${managerView ? getFieldPhotos().length : getFieldPhotosByEmployee(empId).length}</div>
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
          ${photos.map(p => {
            const o = outletMap[p.outletId];
            const emp = empMap[p.recordedBy || p.employeeId];
            const prod = p.productId ? productMap[p.productId] : null;
            const comp = p.competitorId ? compMap[p.competitorId] : null;
            const imageSrc = safePhotoUrl(p.dataUrl || p.photoUrl);
            const thumb = imageSrc
              ? `<img src="${imageSrc}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:10px 10px 0 0;display:block;">`
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
      `}
    </div>
  `;
}

window.FT.setPhotoFilter = function(type) {
  state._photoFilterType = type || '';
  render();
};

window.FT.openVisitPhotoInput = function(visitId, outletId) {
  const outlet = getOutlets().find(o => o.id === outletId);
  const empId = myEmployeeId();
  if (!empId && !isProjectAdmin()) {
    showToast('Akses ditolak', 'error');
    return;
  }
  if (empId && !isProjectAdmin()) {
    const visited = getVisitedOutletIds(empId);
    if (!visited.includes(outletId)) {
      showToast('Outlet belum pernah dikunjungi', 'error');
      return;
    }
  }
  const products = getProducts().filter(p => p.status === 'active');
  const competitors = getCompetitors().filter(c => c.status === 'active');
  openModal('Foto Lapangan — ' + (outlet?.name || outletId), `
    <div style="margin-bottom:12px;padding:12px;background:var(--blue-50);border-radius:10px;font-size:13px;color:var(--blue-600);">
      Ambil dari kamera atau pilih galeri. Gambar dikompres otomatis (~800px JPEG).
    </div>
    <form id="fieldPhotoForm" data-pqt-onsubmit="FT.saveFieldPhoto(event, '${visitId}', '${outletId}')">
      <div class="form-group">
        <label class="label">Jenis Foto</label>
        <select class="select" name="type" id="photoType" required data-pqt-onchange="FT.onPhotoTypeChange(this.value)">
          ${FIELD_PHOTO_TYPES.map(t => `<option value="${t.code}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label">Foto (kamera / galeri)</label>
        <input class="input" type="file" name="photoFile" id="photoFileInput" accept="image/*" capture="environment" required
          data-pqt-onchange="FT.onPhotoFileSelected(event)">
        <div id="photoPreview" style="margin-top:10px;display:none;">
          <img id="photoPreviewImg" alt="Preview" style="max-width:100%;max-height:200px;border-radius:10px;border:1px solid var(--gray-200);">
          <div id="photoPreviewMeta" style="font-size:11px;color:var(--gray-400);margin-top:4px;"></div>
        </div>
        <input type="hidden" name="dataUrl" id="photoDataUrl">
      </div>
      <div class="form-group">
        <label class="label">Caption</label>
        <input class="input" type="text" name="caption" placeholder="Keterangan singkat...">
      </div>
      <div class="form-group" id="photoProductWrap" style="display:none;">
        <label class="label">Produk (opsional)</label>
        <select class="select" name="productId">
          <option value="">— Tidak dilink —</option>
          ${products.map(p => `<option value="${p.id}">${p.brand ? p.brand + ' · ' : ''}${p.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="photoCompetitorWrap" style="display:none;">
        <label class="label">Kompetitor (opsional)</label>
        <select class="select" name="competitorId">
          <option value="">— Tidak dilink —</option>
          ${competitors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:8px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary" id="photoSaveBtn">Simpan Foto</button>
      </div>
    </form>
  `);
  window.FT.onPhotoTypeChange('location');
};

window.FT.onPhotoTypeChange = function(type) {
  const prod = document.getElementById('photoProductWrap');
  const comp = document.getElementById('photoCompetitorWrap');
  if (prod) prod.style.display = (type === 'product' || type === 'shelf') ? 'block' : 'none';
  if (comp) comp.style.display = type === 'competitor' ? 'block' : 'none';
};

window.FT.onPhotoFileSelected = async function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const btn = document.getElementById('photoSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Kompres...'; }
  try {
    const dataUrl = await compressImage(file, { maxPx: 800, quality: 0.7 });
    const hidden = document.getElementById('photoDataUrl');
    if (hidden) hidden.value = dataUrl;
    const wrap = document.getElementById('photoPreview');
    const img = document.getElementById('photoPreviewImg');
    const meta = document.getElementById('photoPreviewMeta');
    if (img) img.src = dataUrl;
    if (wrap) wrap.style.display = 'block';
    if (meta) {
      const kb = Math.round((dataUrl.length * 0.75) / 1024);
      meta.textContent = `Terkirim JPEG ~${kb} KB (dikompres)`;
    }
  } catch (err) {
    showToast(err.message || 'Gagal kompres gambar', 'error');
    e.target.value = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan Foto'; }
  }
};

window.FT.saveFieldPhoto = async function(e, visitId, outletId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const empId = myEmployeeId();
  if (!empId && !isProjectAdmin()) {
    showToast('Akses ditolak', 'error');
    return;
  }
  if (empId && !isProjectAdmin()) {
    const visited = getVisitedOutletIds(empId);
    if (!visited.includes(outletId)) {
      showToast('Outlet tidak diizinkan', 'error');
      return;
    }
  }
  const file = e.target.querySelector('[name="photoFile"]')?.files?.[0];
  let dataUrl = fd.get('dataUrl') || document.getElementById('photoDataUrl')?.value || null;
  let photoUrl = '';
  let r2Key = '';
  if (file) {
    try {
      const uploaded = await uploadAsset(file, {
        category: 'field-photo',
        projectId: fd.get('projectId') || 'general',
        name: file.name,
      });
      photoUrl = uploaded.url;
      r2Key = uploaded.key;
    } catch (error) {
      showToast('Unggah tertunda. Foto tetap aman di perangkat.', 'error');
    }
  }
  if (!dataUrl && !photoUrl) {
    showToast('Pilih atau ambil foto dulu', 'error');
    return;
  }
  const type = fd.get('type') || 'location';
  createFieldPhoto({
    projectId: fd.get('projectId') || null,
    visitId: visitId || null,
    outletId,
    type,
    caption: fd.get('caption') || '',
    productId: fd.get('productId') || null,
    competitorId: type === 'competitor' ? (fd.get('competitorId') || null) : (fd.get('competitorId') || null),
    dataUrl,
    photoUrl: photoUrl || dataUrl,
    r2Key,
    recordedBy: empId || state.account?.id || 'manager',
    recordedAt: new Date().toISOString(),
  });
  closeModal();
  showToast(r2Key ? 'Foto berhasil disimpan' : 'Foto tersimpan dan akan diunggah saat koneksi tersedia', 'success');
  render();
};

window.FT.deleteFieldPhotoConfirm = function(id) {
  const photos = getFieldPhotos();
  const p = photos.find(x => x.id === id);
  if (!p) return;
  const empId = myEmployeeId();
  if (!isProjectAdmin() && p.recordedBy !== empId) {
    showToast('Hanya bisa hapus foto sendiri', 'error');
    return;
  }
  if (!confirm('Hapus foto ini?')) return;
  deleteFieldPhoto(id);
  showToast('Foto dihapus', 'success');
  render();
};

// ===== Mobile Simulation (legacy, not linked in nav) =====
function renderMobileSim() {
  const employees = getEmployees().filter(e => e.role === 'Field Sales');
  const myId = myEmployeeId();
  if (!isProjectAdmin() && myId) {
    state.selectedMobileEmp = myId;
  }
  const current = employees.find(e => e.id === state.selectedMobileEmp) || employees[0];
  if (current) state.selectedMobileEmp = current.id;
  const visits = getVisits().filter(v => v.employeeId === (current?.id) && v.date === todayISO());
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const att = getAttendance().find(a => a.employeeId === current?.id && a.date === todayISO());

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
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" data-pqt-onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
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
                <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.mobileCheckIn('${v.id}')">Check In</button>
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
                <button class="btn btn-primary btn-sm" data-pqt-onclick="FT.mobileCheckOut('${v.id}')">Check Out</button>
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
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" data-pqt-onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
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
          ${employees.map(e => `<button class="btn ${e.id===current?.id?'btn-primary':'btn-secondary'} btn-sm" style="white-space:nowrap;" data-pqt-onclick="FT.selectMobileEmp('${e.id}')">${e.name.split(' ')[0]}</button>`).join('')}
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
        <button class="btn btn-danger" style="width:100%; justify-content:center;" data-pqt-onclick="FT.logout()">Keluar</button>
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
            <button class="mobile-nav-item ${state.mobileTab === t.id ? 'active' : ''}" data-pqt-onclick="FT.setMobileTab('${t.id}')">
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

window.FT.mobileCheckIn = async function(visitId) {
  try {
    const visit = await checkInVisitWithEvidence(visitId);
    if (!visit) return;
    showToast('Check-in berhasil dengan GPS dan geofence valid', 'success');
    render();
  } catch (error) {
    showToast(error.message || 'Check-in gagal', 'error');
  }
};

window.FT.mobileCheckOut = async function(visitId) {
  try {
    const visit = await checkOutVisitWithEvidence(visitId);
    if (!visit) return;
    showToast('Check-out berhasil dengan bukti GPS', 'success');
    render();
  } catch (error) {
    showToast(error.message || 'Check-out gagal', 'error');
  }
};

// ===== Modal Helper =====
function openModal(title, content) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" data-pqt-onclick="if(event.target===this)FT.closeModal()">
      <div class="modal animate-up">
        <div class="modal-handle" aria-hidden="true"></div>
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" data-pqt-onclick="FT.closeModal()" aria-label="Tutup">✕</button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    </div>
  `;
  bindAssetFields(root);
}
function closeModal() { const root = document.getElementById('modalRoot'); if (root) root.innerHTML = ''; }
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (isHomeRoute()) refreshHomeData().catch(() => {});
    if (isTrackingRoute()) refreshTrackingData().catch(() => {});
    if (isVisitsRoute()) refreshVisitsData().catch(() => {});
  });
  window.addEventListener('focus', () => {
    if (isHomeRoute()) refreshHomeData().catch(() => {});
    if (isTrackingRoute()) refreshTrackingData().catch(() => {});
    if (isVisitsRoute()) refreshVisitsData().catch(() => {});
  });
  render();
}

init();
