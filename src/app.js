// ProQTrack — Main Application Module
// Simple hash-based router + global state + page renderers

import {
  getDashboardStats, getEmployees, getOutlets, getVisits, getAttendance, getVisitsByEmployee, correctAttendance,
  resetDB, authenticate, createVisit, updateVisit, createEmployee, updateEmployee,
  createOutlet, updateOutlet, deleteEmployee, deleteOutlet, outletReferenceSummary, deleteVisit, getDB, getAccounts,
  getProducts, createProduct, updateProduct, deleteProduct, productReferenceSummary,
  getLeaves, getLeavesByEmployee, getLeaveTypes, createLeave, updateLeave, withdrawLeave, deleteLeave,
  getStocks, getStocksByOutlet, getInventoryCycles, createInventoryCycle,
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
  canEmployeeAddStore, hasManualOutletApprovalProjects, formatOutletLabel, getProjectStoreSettings, defaultStoreCatalog,
  getProductSales, getProductSalesAudit, createProductSale, voidProductSale, monthSalesAmount,
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
import { issueUploadSession, clearApiToken, getApiToken, bindAssetFields, uploadAsset, deleteUploadedAsset, assetField } from './lib/uploads.js';
import { refreshOperationalData, cloudDataStatus, waitForOperationalSync, restoreOperationalBaseline, ensureEvidenceMetadataHydrated } from './lib/cloud-data.js';
import { defaultPortrait } from './lib/avatars.js';
import { applyOrganizationBranding } from './lib/organization-branding.js';
import {
  captureDevicePosition, currentTenantTimeHHMM, locationFreshness,
  locationSourceLabel, visitLocationEvidence, assertVisitGeofence, visitGeofenceEvidence,
} from './lib/location-evidence.js';
import { getDeviceIdentity, markSuperadminHost } from './lib/device.js';
import { ensureLeaflet } from './lib/leaflet-loader.js';
import { VISITS_PAGE_SIZE, visitMatchesFilters, paginateVisits, visitCorrectionErrorMessage } from './lib/visit-ui.js';
import { EMPLOYEE_PAGE_SIZE, employeeSyncState, activeProjectIdsForEmployee, employeeMatchesFilters, paginateEmployees, employeeOperationalCounts, employeeProjectOptions, employeeListModel, employeeFilterSnapshot, employeeDeactivationImpact } from './lib/team-employee-ui.js';
import { OUTLET_PAGE_SIZE, outletOperationalModel, outletFilterOptions, outletMatchesFilters, outletFilterSnapshot, paginateOutlets, outletStatusSummary, outletSyncPresentation, normalizeOutletCatalog, outletFormModel, outletLifecycleAction } from './lib/outlet-ui.js';
import { PRODUCT_PAGE_SIZE, productOperationalModel, productFilterOptions, productMatchesFilters, productFilterSnapshot, paginateProducts, productSyncPresentation, productFormModel, normalizeProductFormPayload, productStatusSummary, productLifecycleAction } from './lib/product-ui.js';
import { stockSalesFriendlyErrorMessage, inventoryCycleOnDate as findInventoryCycleOnDate, commonProjectIds, stockSummary, stockFilterSnapshot, stockMatchesFilters, salesSummary, salesFilterSnapshot, salesMatchesFilters, pendingManualCorrections, validateStockMovementInput } from './lib/stock-sales-ui.js';
import {
  attendanceLeaveFriendlyErrorMessage, attendanceSourceKey, attendanceSourceLabel, attendanceStatusKey,
  attendanceOperationalSummary, attendanceFilterSnapshot, attendanceMatchesFilters, attendanceTimeValue,
  leaveDisplayStatus, leavePendingAgeDays, leaveOperationalSummary, leaveFilterSnapshot, leaveMatchesFilters,
  canEditPendingLeave,
} from './lib/attendance-leave-ui.js';
import { icon as appIcon, iconSvg } from '../assets/icons.js';

const safeColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#64748b';
const jsArg = value => esc(JSON.stringify(String(value ?? '')));


let competitorPagesChunk = null;
let competitorPagesPromise = null;
let attendanceLeaveChunk = null;
let attendanceLeavePromise = null;
let fieldPhotosChunk = null;
let fieldPhotosPromise = null;

function loadCompetitorPagesChunk() {
  if (competitorPagesChunk) return Promise.resolve(competitorPagesChunk);
  if (!competitorPagesPromise) {
    competitorPagesPromise = import('./routes/competitor-pages.js')
      .then(module => {
        competitorPagesChunk = module;
        competitorPagesPromise = null;
        if (state.loggedIn && ['#/competitors','#/competitor-analysis'].includes(state.route)) scheduleRender();
        return module;
      })
      .catch(error => {
        competitorPagesPromise = null;
        console.warn('competitor_pages_chunk_failed', error?.message || error);
        throw error;
      });
  }
  return competitorPagesPromise;
}

function loadFieldPhotosChunk() {
  if (fieldPhotosChunk) return Promise.resolve(fieldPhotosChunk);
  if (!fieldPhotosPromise) {
    fieldPhotosPromise = import('./routes/field-photos-page.js')
      .then(module => {
        fieldPhotosChunk = module;
        fieldPhotosPromise = null;
        if (state.loggedIn && ['#/field-photos','#/myphotos'].includes(state.route)) scheduleRender();
        return module;
      })
      .catch(error => {
        fieldPhotosPromise = null;
        console.warn('field_photos_chunk_failed', error?.message || error);
        throw error;
      });
  }
  return fieldPhotosPromise;
}


function loadAttendanceLeaveChunk() {
  if (attendanceLeaveChunk) return Promise.resolve(attendanceLeaveChunk);
  if (!attendanceLeavePromise) {
    attendanceLeavePromise = import('./routes/attendance-leave-pages.js')
      .then(module => {
        attendanceLeaveChunk = module;
        attendanceLeavePromise = null;
        if (state.loggedIn && ['#/attendance','#/leaves'].includes(state.route)) scheduleRender();
        return module;
      })
      .catch(error => {
        attendanceLeavePromise = null;
        console.warn('attendance_leave_chunk_failed', error?.message || error);
        throw error;
      });
  }
  return attendanceLeavePromise;
}

function routeChunkLoading(label) {
  return `<div class="card"><div class="empty-state"><p>Memuat ${esc(label)}...</p></div></div>`;
}

let bulkEmployeesRuntimePromise = null;
let bulkMasterRuntimePromise = null;

function ensureBulkEmployeesRuntime() {
  if (!bulkEmployeesRuntimePromise) {
    bulkEmployeesRuntimePromise = import('./bulk-employees.js').catch(error => {
      bulkEmployeesRuntimePromise = null;
      throw error;
    });
  }
  return bulkEmployeesRuntimePromise;
}

function ensureBulkMasterRuntime() {
  if (!bulkMasterRuntimePromise) {
    bulkMasterRuntimePromise = import('./bulk-master.js').catch(error => {
      bulkMasterRuntimePromise = null;
      throw error;
    });
  }
  return bulkMasterRuntimePromise;
}

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
  sessionRestoring: Boolean(getApiToken()),
  account: null,
  user: { name: 'Manager Demo', role: 'Manager', email: 'manager@proqtrack.id' },
  route: '#/',
  sidebarOpen: false,
  sidebarCollapsed: (() => { try { return localStorage.getItem('proqtrack_sidebar_collapsed') === '1'; } catch { return false; } })(),
  selectedEmployee: null,
  selectedMobileEmp: 'EMP001',
  mobileTab: 'home',
  livePolling: null,
  routeRefreshTimer: null,
  routeRefreshRoute: '',
  lastPassiveRefreshAt: 0,
  homeRefreshInFlight: false,
  homeRefreshedAt: null,
  trackingRefreshInFlight: false,
  trackingRefreshedAt: null,
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

let renderFrame = 0;
function scheduleRender() {
  if (renderFrame) return false;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    render();
  });
  return true;
}
window.FT.scheduleRender = scheduleRender;
window.FT.openBulkEmployees = async function() {
  try {
    await ensureBulkEmployeesRuntime();
    window.BulkEmployees?.open?.();
  } catch (error) {
    console.warn('bulk_employees_runtime_failed', error?.message || error);
    showToast('Modul bulk karyawan belum dapat dimuat.', 'error');
  }
};
window.FT.openBulkMaster = async function(entity) {
  try {
    await ensureBulkMasterRuntime();
    window.BulkMaster?.open?.(entity);
  } catch (error) {
    console.warn('bulk_master_runtime_failed', error?.message || error);
    showToast('Modul bulk master belum dapat dimuat.', 'error');
  }
};

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
  window.FT.closeSidebar?.();
  if (location.hash === route) {
    scheduleRender();
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
  scheduleRender();
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
      if (isHomeRoute()) scheduleRender();
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
      if (isTrackingRoute()) scheduleRender();
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
      if (isVisitsRoute()) scheduleRender();
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

window.FT.refreshVisits = () => refreshVisitsData({ manual:true });

const PASSIVE_REFRESH_COOLDOWN_MS = 5000;

function routeRefreshConfig(route = state.route) {
  if (!state.loggedIn || !getActor()?.organizationId) return null;
  if (isHomeRoute(route) && (isProjectAdmin() || isSupervisor())) {
    return { interval:HOME_REFRESH_MS, run:refreshHomeData };
  }
  if (isTrackingRoute(route)) {
    return { interval:TRACKING_REFRESH_MS, run:refreshTrackingData };
  }
  if (isVisitsRoute(route)) {
    return { interval:VISITS_REFRESH_MS, run:refreshVisitsData };
  }
  return null;
}

function stopRouteRefresh() {
  if (state.routeRefreshTimer) clearTimeout(state.routeRefreshTimer);
  state.routeRefreshTimer = null;
  state.routeRefreshRoute = '';
}

function configureRouteRefresh(route = state.route) {
  const config = routeRefreshConfig(route);
  if (!config) {
    stopRouteRefresh();
    return;
  }
  if (state.routeRefreshTimer && state.routeRefreshRoute === route) return;
  stopRouteRefresh();
  state.routeRefreshRoute = route;
  state.routeRefreshTimer = setTimeout(async () => {
    state.routeRefreshTimer = null;
    if (document.visibilityState === 'visible' && state.route === route) {
      await refreshActiveRoute({ reason:'timer' }).catch(() => {});
    }
    if (state.loggedIn && state.route === route) configureRouteRefresh(route);
  }, config.interval);
}

async function refreshActiveRoute({ manual = false, reason = 'passive' } = {}) {
  const config = routeRefreshConfig(state.route);
  if (!config) return false;
  if (!manual && document.visibilityState !== 'visible') return false;
  const now = Date.now();
  if (!manual && now - state.lastPassiveRefreshAt < PASSIVE_REFRESH_COOLDOWN_MS) return false;
  if (!manual) state.lastPassiveRefreshAt = now;
  return config.run({ manual });
}


// ===== P1 Performance: persistent shell + cached navigation metrics =====
let navMetricsCache = null;
let navMetricsRevision = 0;

function invalidateNavigationMetrics() {
  navMetricsCache = null;
  navMetricsRevision += 1;
}

function navigationMetrics() {
  if (navMetricsCache) return navMetricsCache;
  const today = todayISO();
  const settings = getAppSettings();
  const visits = getVisits();
  const leaves = getLeaves();
  const stocks = isProjectAdmin() ? getStocks() : [];
  navMetricsCache = {
    revision: navMetricsRevision,
    fieldNow: canViewTeamOps()
      ? visits.filter(v => visitDay(v) === today && ['checked-in','in_progress'].includes(String(v.status || ''))).length
      : 0,
    pendingLeaves: canViewTeamOps() && settings.notifyLeave !== false
      ? leaves.filter(l => l.status === 'pending').length
      : 0,
    lowStocks: isProjectAdmin() && settings.notifyLowStock !== false
      ? stocks.filter(row => Number(row.quantity || 0) <= Number(row.minStock || 0)).length
      : 0,
  };
  return navMetricsCache;
}

window.addEventListener('proqtrack:db-updated', invalidateNavigationMetrics);
window.addEventListener('proqtrack:cloud-status', event => {
  if (['ready','synced','refreshed'].includes(String(event.detail?.status || ''))) invalidateNavigationMetrics();
});

function shellSignature(fieldRole, roleSkin) {
  const org = getOrganization(getCurrentOrgId()) || {};
  return [
    state.account?.id || '',
    state.account?.role || '',
    state.account?.organizationId || '',
    org.id || '',
    org.name || '',
    org.logo || '',
    fieldRole ? 'field' : 'desk',
    roleSkin,
    hasManualOutletApprovalProjects() ? 'manual-approval' : 'auto-approval',
  ].join('|');
}

function ensureAuthenticatedShell({ fieldRole, roleSkin }) {
  const app = document.getElementById('app');
  const signature = shellSignature(fieldRole, roleSkin);
  let layout = app.querySelector('.app-layout[data-persistent-shell="1"]');
  if (!layout || layout.dataset.shellSignature !== signature) {
    const metrics = navigationMetrics();
    app.innerHTML = `
      <div class="app-layout ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${roleSkin}" data-persistent-shell="1" data-shell-signature="${esc(signature)}">
        ${renderSidebar(metrics)}
        <div class="sidebar-backdrop" data-pqt-onclick="FT.closeSidebar()" style="display:none;"></div>
        <div class="main-area">
          <div class="topbar"></div>
          <div class="content" data-route-content="1"></div>
          <div data-field-dock-root="1"></div>
        </div>
      </div>
    `;
    layout = app.querySelector('.app-layout[data-persistent-shell="1"]');
  }
  layout.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  return layout;
}

function updatePersistentSidebar(route) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  nav.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    const dashboard = href === '#/' && (route === '#/' || route === '#');
    const myday = href === '#/myday' && (route === '#/myday' || route === '#');
    item.classList.toggle('active', href === route || dashboard || myday);
  });
  const metrics = navigationMetrics();
  const badgeMap = {
    '#/tracking': metrics.fieldNow,
    '#/leaves': metrics.pendingLeaves,
    '#/stocks': metrics.lowStocks,
  };
  for (const [href,value] of Object.entries(badgeMap)) {
    const item = nav.querySelector(`.nav-item[href="${href}"]`);
    if (!item) continue;
    let badge = item.querySelector('.nav-badge');
    if (value > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        item.appendChild(badge);
      }
      badge.textContent = String(value);
      badge.hidden = false;
    } else if (badge) {
      badge.hidden = true;
    }
  }
}

// ===== Main Render =====
function renderSessionRestoring() {
  return `
    <main class="session-restore-page" aria-live="polite" aria-busy="true">
      <div class="session-restore-shell">
        <aside class="session-restore-side" aria-hidden="true">
          <div class="session-restore-brand">PQ</div>
        </aside>
        <section class="session-restore-main" role="status">
          <h1>Mempersiapkan workspace</h1>
          <p>Memvalidasi sesi dan memuat data operasional terbaru.</p>
          <div class="session-restore-kpis" aria-hidden="true">
            <div class="session-restore-block"></div>
            <div class="session-restore-block"></div>
            <div class="session-restore-block"></div>
            <div class="session-restore-block"></div>
          </div>
          <div class="session-restore-panels" aria-hidden="true">
            <div class="session-restore-block"></div>
            <div class="session-restore-block"></div>
          </div>
        </section>
      </div>
    </main>
  `;
}

function render() {
  const renderStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (renderFrame) {
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }
  const app = document.getElementById('app');

  // Do not parse/migrate the local operational DB before the first restore paint.
  // Cloud restore owns hydration; this shell can paint using only sessionStorage.
  if (!state.loggedIn && state.sessionRestoring && getApiToken()) {
    stopRouteRefresh();
    disposeTrackingMap();
    app.innerHTML = renderSessionRestoring();
    return;
  }

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
    stopRouteRefresh();
    disposeTrackingMap();
    const publicRoute = getRoute();
    if (publicRoute === '#/privacy') app.innerHTML = renderPublicLegalPage('privacy');
    else if (publicRoute === '#/terms-of-reference') app.innerHTML = renderPublicLegalPage('terms');
    else app.innerHTML = renderLogin();
    return;
  }

  if (state.account?.mustChangePassword && getRoute() !== '#/settings') {
    location.hash = '#/settings';
    return;
  }

  const route = state.route;
  if (route !== '#/tracking') disposeTrackingMap();
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
      pageTitle = 'New Outlet'; pageSubtitle = 'Tambah outlet baru ke project';
      pageContent = renderOutletProposalForm();
    } else if (route === '#/mysales') {
      pageTitle = 'Product Sales'; pageSubtitle = 'Derived sales from finalized outlet stock cycles';
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
    if (!hasManualOutletApprovalProjects()) {
      location.hash = isProjectAdmin() ? '#/outlets' : '#/';
      return;
    }
    pageTitle = 'Outlet Approvals'; pageSubtitle = 'Antrian outlet untuk project yang menggunakan Manual Approval.';
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
  const layout = ensureAuthenticatedShell({ fieldRole, roleSkin });
  const topbar = layout.querySelector('.topbar');
  const contentRoot = layout.querySelector('[data-route-content="1"]');
  const dockRoot = layout.querySelector('[data-field-dock-root="1"]');

  topbar.className = `topbar ${fieldRole && route === '#/myday' ? 'topbar-hidden-mobile' : ''}`;
  topbar.innerHTML = `
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
  `;
  contentRoot.innerHTML = pageContent;
  dockRoot.innerHTML = fieldRole ? renderFieldDock(route) : '';
  updatePersistentSidebar(route);

  if (PROJECT_MANAGEMENT_ROUTES.has(route)) {
    window.PM?.renderRoute?.();
  }

  attachPageHandlers();
  bindAssetFields(contentRoot);
  if (route === '#/tracking') initMap();
  if (route === '#/field-photos' || route === '#/myphotos') {
    ensureEvidenceMetadataHydrated(getDB()).then(changed => {
      if (changed && state.loggedIn && state.route === route) scheduleRender();
    }).catch(error => {
      console.warn('evidence_metadata_route_hydrate_failed', error?.message || error);
    });
  }
  if (route === '#/new-outlet') setTimeout(() => window.FS?.initOutletMap?.(), 50);
  configureRouteRefresh(route);
  const nav = document.querySelector('.sidebar-nav');
  if (nav) nav.scrollTop = state._sidebarScroll || 0;
  const renderFinishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  window.dispatchEvent(new CustomEvent('proqtrack:render-complete', {
    detail: { route, durationMs:Math.max(0, renderFinishedAt - renderStartedAt) },
  }));
}

// ===== Sidebar =====
function renderSidebar(metrics = navigationMetrics()) {
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
      if (item.id === 'outlet-approvals' && !hasManualOutletApprovalProjects()) continue;
      const active = currentRoute === item.route
        || (item.id === 'dashboard' && (currentRoute === '#/' || currentRoute === '#'))
        || (item.id === 'myday' && (currentRoute === '#/myday' || currentRoute === '#'));
      let badge = '';
      if (item.id === 'tracking' && metrics.fieldNow > 0) {
        badge = `<span class="nav-badge" title="Sedang di lapangan">${metrics.fieldNow}</span>`;
      }
      if (item.id === 'leaves' && metrics.pendingLeaves > 0) {
        badge = `<span class="nav-badge" style="background:var(--amber-500);">${metrics.pendingLeaves}</span>`;
      }
      if (item.id === 'stocks' && metrics.lowStocks > 0) {
        badge = `<span class="nav-badge" style="background:var(--red-500);">${metrics.lowStocks}</span>`;
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
function loginBrandContext() {
  const brand = getOrganization(getCurrentOrgId()) || {};
  return {
    name: brand.name || 'ProQTrack',
    logo: brand.logo || '',
  };
}

function brandMark(name, logo, className = 'login-logo') {
  return `<div class="${className}">${logo
    ? `<img src="${esc(logo)}" alt="Logo ${esc(name)}">`
    : '<span aria-hidden="true">PQ</span>'}</div>`;
}

function renderLogin() {
  const brand = loginBrandContext();
  return `
    <main class="login-page login-page-v2">
      <div class="login-shell" aria-label="Login ${esc(brand.name)}">
        <section class="login-showcase" aria-label="ProQTrack field operations workspace">
          <div class="login-showcase-top">
            <div class="login-brand-lockup">
              ${brandMark(brand.name, brand.logo, 'login-showcase-logo')}
              <div>
                <div class="login-brand-name">${esc(brand.name)}</div>
                <div class="login-brand-product">Powered by ProQTrack</div>
              </div>
            </div>
            <span class="login-environment-badge">Field Operations Workspace</span>
          </div>

          <div class="login-showcase-copy">
            <div class="login-eyebrow">CONTROL · VISIBILITY · EXECUTION</div>
            <h2>Operasional lapangan,<br><span>dalam satu kendali.</span></h2>
            <p>Pantau aktivitas tim, kunjungan, attendance, evidence, outlet, stok, dan penjualan dari satu workspace yang konsisten.</p>

            <div class="login-capability-grid" aria-label="Kapabilitas utama">
              <div class="login-capability">
                <span class="login-capability-icon" aria-hidden="true">${iconSvg('pin')}</span>
                <strong>Live Visibility</strong>
                <small>Aktivitas dan lokasi kerja sesuai scope project.</small>
              </div>
              <div class="login-capability">
                <span class="login-capability-icon" aria-hidden="true">${iconSvg('shield')}</span>
                <strong>Role Based Access</strong>
                <small>Akses data mengikuti organisasi, project, dan peran.</small>
              </div>
              <div class="login-capability">
                <span class="login-capability-icon" aria-hidden="true">${iconSvg('chart')}</span>
                <strong>Operational Control</strong>
                <small>Data lapangan terhubung ke reporting dan governance.</small>
              </div>
            </div>
          </div>

          <div class="login-showcase-foot">
            <span class="login-status-dot" aria-hidden="true"></span>
            <span>Secure production workspace</span>
          </div>
        </section>

        <section class="login-auth-panel">
          <div class="login-card login-card-v2">
            <div class="login-mobile-brand">
              ${brandMark(brand.name, brand.logo)}
              <div class="login-mobile-brand-copy">
                <strong>${esc(brand.name)}</strong>
                <span>Field Team Monitoring</span>
              </div>
            </div>

            <div class="login-form-heading">
              <span class="login-form-kicker">Welcome back</span>
              <h1>Masuk ke workspace</h1>
              <p>Gunakan akun yang terdaftar untuk melanjutkan.</p>
            </div>

            <form class="login-form" data-pqt-onsubmit="FT.handleLogin(event)" data-pqt-onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.requestSubmit();}">
              <div class="form-group login-form-group">
                <label class="label" for="loginEmail">Email</label>
                <input class="input" type="email" id="loginEmail" placeholder="nama@perusahaan.com" autocomplete="username" inputmode="email" required autofocus>
              </div>
              <div class="form-group login-form-group">
                <label class="label" for="loginPassword">Password</label>
                <div class="password-field">
                  <input class="input" type="password" id="loginPassword" placeholder="Masukkan password" autocomplete="current-password" required>
                  <button class="password-toggle" type="button" data-pqt-onclick="FT.toggleLoginPassword(this)" aria-label="Tampilkan password" aria-pressed="false">
                    <span class="password-eye" aria-hidden="true">${iconSvg('eye')}</span>
                  </button>
                </div>
              </div>

              <button type="submit" class="btn btn-primary login-submit">
                <span>Masuk ke Dashboard</span>
                <span class="login-submit-arrow" aria-hidden="true">→</span>
              </button>
            </form>

            <div class="login-security-note">
              <span class="login-security-icon" aria-hidden="true">${iconSvg('shield')}</span>
              <span>Gunakan perangkat pribadi atau perangkat kerja yang telah disetujui organisasi.</span>
            </div>

            <div class="login-legal-links" aria-label="Dokumen kebijakan">
              <a href="#/privacy">Privacy Policy</a>
              <span aria-hidden="true">·</span>
              <a href="#/terms-of-reference">Terms of Reference</a>
            </div>
          </div>

          <div class="login-auth-footer">
            <span>© 2026 ProQTrack</span>
            <span>Operational workspace for field teams</span>
          </div>
        </section>
      </div>
    </main>
  `;
}

function legalSections(type) {
  if (type === 'terms') {
    return {
      eyebrow: 'GOVERNANCE',
      title: 'Terms of Reference',
      intro: 'Kerangka penggunaan ProQTrack untuk memastikan aktivitas operasional, akses data, dan tanggung jawab pengguna berjalan konsisten dan dapat dipertanggungjawabkan.',
      sections: [
        ['1. Tujuan penggunaan', 'ProQTrack digunakan sebagai workspace operasional untuk aktivitas field team, termasuk project assignment, kunjungan, attendance, leave, outlet, produk, stok, penjualan, survey, evidence, dan reporting sesuai konfigurasi organisasi.'],
        ['2. Pengguna dan kewenangan', 'Akses diberikan hanya kepada pengguna yang diotorisasi. Hak melihat, membuat, memperbarui, menyetujui, atau mengelola data mengikuti role, organisasi, project, dan assignment yang berlaku.'],
        ['3. Akurasi dan integritas data', 'Pengguna wajib memasukkan data yang benar dan relevan dengan aktivitas kerja. Manipulasi lokasi, evidence, transaksi, approval, atau informasi operasional lainnya tidak diperbolehkan.'],
        ['4. Perangkat dan keamanan akun', 'Akun bersifat individual. Password tidak boleh dibagikan. Organisasi dapat menerapkan device binding, session control, dan pembatasan akses untuk melindungi data dan mencegah penggunaan yang tidak sah.'],
        ['5. Lokasi dan evidence lapangan', 'Fitur tertentu dapat menggunakan koordinat, waktu, foto, atau evidence lain saat aktivitas lapangan dilakukan. Penggunaan informasi tersebut dibatasi pada kebutuhan operasional, verifikasi, audit, dan reporting sesuai kewenangan.'],
        ['6. Availability dan perubahan layanan', 'Fitur dapat diperbarui untuk keamanan, stabilitas, kepatuhan operasional, atau peningkatan layanan. Maintenance dapat dilakukan bila diperlukan dengan menjaga integritas dan keamanan data sebagai prioritas.'],
        ['7. Tanggung jawab organisasi', 'Organisasi bertanggung jawab menentukan user, role, project scope, kebijakan internal, retention yang relevan, serta memastikan penggunaan ProQTrack sesuai perjanjian dan ketentuan yang berlaku di organisasinya.'],
      ],
    };
  }
  return {
    eyebrow: 'PRIVACY',
    title: 'Privacy Policy',
    intro: 'Kebijakan ini menjelaskan jenis informasi yang dapat diproses oleh ProQTrack dan bagaimana informasi tersebut digunakan untuk mendukung operasional lapangan secara aman.',
    sections: [
      ['1. Informasi yang diproses', 'ProQTrack dapat memproses data akun dan profil kerja, organisasi dan project, aktivitas kunjungan, attendance dan leave, data outlet dan produk, transaksi operasional, lokasi, foto/evidence, device information yang diperlukan untuk keamanan, serta data audit sistem.'],
      ['2. Tujuan pemrosesan', 'Data digunakan untuk autentikasi dan kontrol akses, pelaksanaan pekerjaan lapangan, validasi aktivitas, monitoring operasional, reporting, audit, troubleshooting, keamanan, serta peningkatan stabilitas layanan.'],
      ['3. Lokasi, foto, dan evidence', 'Lokasi atau evidence diproses ketika fitur kerja yang relevan digunakan. Informasi tersebut digunakan untuk konteks operasional seperti kunjungan, attendance, verifikasi outlet, atau dokumentasi lapangan sesuai scope pengguna.'],
      ['4. Akses dan pembatasan data', 'Data dibatasi berdasarkan organisasi, project, role, dan assignment. Pengguna hanya mendapatkan akses sesuai kewenangan yang diberikan. Administrator tertentu dapat memiliki akses yang lebih luas untuk kebutuhan administrasi dan audit.'],
      ['5. Penyimpanan dan keamanan', 'ProQTrack menggunakan kontrol autentikasi, authorization, session management, tenant isolation, auditability, dan mekanisme keamanan aplikasi untuk membantu melindungi data dari akses yang tidak sah.'],
      ['6. Retensi dan penghapusan', 'Periode retensi dapat mengikuti kebutuhan operasional dan kebijakan organisasi. Data dapat diarsipkan atau dihapus berdasarkan kewenangan administrator, kebutuhan kontraktual, atau proses operasional yang berlaku.'],
      ['7. Hak dan pertanyaan pengguna', 'Permintaan terkait koreksi data profil, akses akun, atau pertanyaan privasi dapat disampaikan melalui administrator organisasi. Permintaan akan diproses sesuai kewenangan dan kebijakan yang berlaku.'],
    ],
  };
}

function renderPublicLegalPage(type) {
  const brand = loginBrandContext();
  const content = legalSections(type);
  return `
    <main class="legal-page">
      <div class="legal-shell">
        <header class="legal-topbar">
          <a class="legal-brand" href="#/login" aria-label="Kembali ke login">
            ${brandMark(brand.name, brand.logo, 'legal-brand-logo')}
            <span>
              <strong>${esc(brand.name)}</strong>
              <small>Powered by ProQTrack</small>
            </span>
          </a>
          <a class="btn btn-secondary legal-back-button" href="#/login">← Kembali ke Login</a>
        </header>

        <div class="legal-layout">
          <aside class="legal-summary">
            <span class="legal-eyebrow">${content.eyebrow}</span>
            <h1>${content.title}</h1>
            <p>${content.intro}</p>
            <div class="legal-meta">
              <span>Berlaku sejak</span>
              <strong>25 September 2026</strong>
            </div>
            <div class="legal-switch">
              <a class="${type === 'privacy' ? 'active' : ''}" href="#/privacy">Privacy Policy</a>
              <a class="${type === 'terms' ? 'active' : ''}" href="#/terms-of-reference">Terms of Reference</a>
            </div>
          </aside>

          <article class="legal-document">
            ${content.sections.map(([title, body]) => `
              <section class="legal-section">
                <h2>${title}</h2>
                <p>${body}</p>
              </section>
            `).join('')}
            <div class="legal-document-footer">
              <p>Dokumen ini merupakan bagian dari governance penggunaan ProQTrack. Kebijakan organisasi atau ketentuan kontraktual yang lebih spesifik tetap berlaku sesuai konteks masing-masing.</p>
              <a href="#/login">Kembali ke halaman login →</a>
            </div>
          </article>
        </div>
      </div>
    </main>
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
  if (renderFrame) {
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }
  state.loggedIn = false;
  state.account = null;
  state.route = '#/login';
  if (state.livePolling) { clearInterval(state.livePolling); state.livePolling = null; }
  stopRouteRefresh();
  disposeTrackingMap();
  clearTimeout(trackingFilterTimer);
  trackingFilterTimer = null;
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
  const org = getOrganization();
  const today = todayISO();
  const visits = getVisits();
  const todayVisits = visits
    .filter(v => visitDay(v) === today)
    .sort((a,b) => String(b.checkInTime || '').localeCompare(String(a.checkInTime || '')));
  const employees = getEmployees();
  const outlets = getOutlets();
  const stocks = getStocks();
  const leaves = getLeaves();
  const employeeById = new Map(employees.map(row => [String(row.id), row]));
  const outletById = new Map(outlets.map(row => [String(row.id), row]));
  const activeEmployees = employees.filter(e => e.status === 'active');
  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const lowStocks = stocks.filter(s => Number(s.quantity || 0) <= Number(s.minStock || 0)).length;
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
        ['Kunjungan hari ini', todayVisits.length, '#/visits'],
        ['Stok menipis', lowStocks, '#/stocks'],
        ['Cuti pending', pendingLeaves, '#/leaves'],
      ].map(([l,v,h]) => `<a class="stat-card" href="${h}" style="text-decoration:none;color:inherit"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></a>`).join('')}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Aktivitas hari ini</div>
        <div class="card-subtitle">${esc(today)} · terbaru lebih dulu</div>
        ${todayVisits.length ? `<div class="visits-table-wrapper"><table class="table"><thead><tr><th>Waktu</th><th>Sales</th><th>Outlet</th><th>Status</th></tr></thead><tbody>${todayVisits.slice(0,8).map(v => {
          const emp = employeeById.get(String(v.employeeId));
          const out = outletById.get(String(v.outletId));
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
  const visitsTodayByEmployee = new Map();
  for (const visit of visits) {
    const key = String(visit.employeeId || '');
    visitsTodayByEmployee.set(key, (visitsTodayByEmployee.get(key) || 0) + 1);
  }
  const monthSalesByEmployee = new Map();
  const monthKey = todayISO().slice(0,7);
  for (const sale of getProductSales()) {
    const date = String(sale.saleDate || sale.date || sale.createdAt || '');
    if (!date.startsWith(monthKey)) continue;
    const key = String(sale.employeeId || sale.soldBy || '');
    if (!teamIds.has(key)) continue;
    const amount = Number(sale.amount ?? sale.total ?? sale.totalAmount ?? 0) || 0;
    monthSalesByEmployee.set(key, (monthSalesByEmployee.get(key) || 0) + amount);
  }
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
        ${team.slice(0,8).map(e => `<div class="home-team-row"><div><strong>${esc(e.name)}</strong><div class="am-muted">${esc(e.area)} · ${visitsTodayByEmployee.get(String(e.id)) || 0} visits · ${formatCurrency(monthSalesByEmployee.get(String(e.id)) || 0)}</div></div><a class="btn btn-secondary btn-sm" href="#/tracking" data-pqt-onclick="return FT.openTrackingEmployee(event,'${e.id}')">Track</a></div>`).join('') || '<p class="am-muted">Belum ada anggota tim.</p>'}
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
        <div class="am-actions" style="margin-top:12px">${hasManualOutletApprovalProjects() ? dashLink('#/outlet-approvals','Persetujuan toko') : ''} ${dashLink('#/leaves','Cuti')} ${dashLink('#/myday','Hari saya')}</div>
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
let trackingFilterTimer = null;

function disposeTrackingMap() {
  if (_map) {
    _map.remove();
    _map = null;
  }
  _markers = {};
}
window.FT.disposeTrackingMap = disposeTrackingMap;

async function initMap() {
  const mapElement = document.getElementById('trackingMap');
  if (!mapElement) return;
  let Leaflet;
  try {
    Leaflet = await ensureLeaflet();
  } catch (error) {
    const target = document.getElementById('trackingMap');
    if (target) target.innerHTML = '<div class="empty-state"><p>Peta tidak dapat dimuat. Data lokasi tetap tersedia di daftar tim.</p></div>';
    console.warn('tracking_map_load_failed', error?.message || error);
    return;
  }
  if (state.route !== '#/tracking' || !document.getElementById('trackingMap')) return;
  const employees = trackingEmployees();

  disposeTrackingMap();
  _map = Leaflet.map('trackingMap', { zoomControl: true }).setView([-6.2, 106.85], 12);
  Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
    const icon = Leaflet.divIcon({
      className: 'ft-marker',
      html: `<div style="width:36px;height:36px;border-radius:50%;background:${actual ? color : '#94a3b8'};border:4px ${actual ? 'solid' : 'dashed'} ${fresh ? '#10b981' : actual ? 'white' : '#e2e8f0'};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;">${getInitials(e.name)}</div>`,
      iconSize: [36,36], iconAnchor: [18,18]
    });
    const m = Leaflet.marker([loc.lat, loc.lng], { icon }).addTo(_map);
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
  if (state.route === '#/tracking') scheduleRender();
  else location.hash = '#/tracking';
  return false;
};

window.FT.filterTracking = function(value) {
  state._trackQuery = value;
  clearTimeout(trackingFilterTimer);
  trackingFilterTimer = setTimeout(() => {
    trackingFilterTimer = null;
    scheduleRender();
  }, 120);
};
window.FT.filterTrackingArea = function(value) { state._trackArea = value; scheduleRender(); };
window.FT.filterTrackingField = function(value) { state._trackField = value; scheduleRender(); };
window.FT.fitTracking = function() {
  const Leaflet = window.L;
  if (!_map || !Leaflet) return;
  const marks = Object.values(_markers);
  if (!marks.length) return;
  const group = Leaflet.featureGroup(marks);
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
let visitPage = 1;
let visitRowsCache = [];

function visitRowEntry(visit, emp, outlet) {
  if (!emp || !outlet) return null;
  const stars = visit.rating > 0 ? `${'★'.repeat(visit.rating)}${'☆'.repeat(5-visit.rating)}` : '-';
  const date = visitDay(visit);
  const search = [
    date, visit.status, emp.name, emp.email, outlet.name, outlet.outletNumber, outlet.code,
    visit.projectId, visit.notes,
  ].filter(Boolean).join(' ').toLowerCase();
  return {
    visit,
    search,
    html:`
      <tr data-visit-id="${esc(visit.id)}">
        <td>${formatDateShort(date)}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="avatar" style="width:28px;height:28px;font-size:11px;background:${['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'][emp.name.charCodeAt(0)%6]};">${getInitials(emp.name)}</div>
            <span style="font-weight:600;">${esc(emp.name)}</span>
          </div>
        </td>
        <td>${outletIcon(outlet.type)} ${esc(outlet.name)}</td>
        <td>${visit.checkInTime || '<span style="color:var(--gray-300);">—</span>'}</td>
        <td>${visit.checkOutTime || '<span style="color:var(--gray-300);">—</span>'}</td>
        <td>${formatDuration(visit.checkInTime, visit.checkOutTime)}</td>
        <td>${statusBadge(visit.status)}</td>
        <td style="color:#fbbf24;">${stars}</td>
        <td><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewVisit('${visit.id}')">Detail</button></td>
      </tr>`,
  };
}

function renderVisits() {
  const visits = getVisits().sort((a,b) => String(visitDay(b)).localeCompare(String(visitDay(a))) || (b.checkInTime||'').localeCompare(a.checkInTime||''));
  const employees = getEmployees();
  const outlets = getOutlets();
  const empMap = new Map(employees.map(e => [String(e.id), e]));
  const outletMap = new Map(outlets.map(o => [String(o.id), o]));
  visitRowsCache = visits
    .map(v => visitRowEntry(v, empMap.get(String(v.employeeId)), outletMap.get(String(v.outletId))))
    .filter(Boolean);
  const initialPage = paginateVisits(visitRowsCache, visitPage, VISITS_PAGE_SIZE);
  visitPage = initialPage.currentPage;

  setTimeout(() => window.FT?.initVisitFilters?.(), 0);
  return `
    <div class="card">
      <div class="filter-row">
        <label class="sr-only" for="visitSearch">Cari kunjungan</label><input class="input search-input" id="visitSearch" placeholder="🔍 Cari kunjungan..." data-pqt-oninput="FT.filterVisits(1)">
        <select class="select" id="visitStatusFilter" style="width:180px;" data-pqt-onchange="FT.filterVisits(1)">
          <option value="">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="checked-in">Sedang Berlangsung</option>
          <option value="planned">Direncanakan</option>
        </select>
        <select class="select" id="visitEmpFilter" style="width:200px;" data-pqt-onchange="FT.filterVisits(1)">
          <option value="">Semua Karyawan</option>
          ${employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}
        </select>
        <select class="select" id="visitProjectFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits(1)"><option value="">Semua Project</option></select>
        <select class="select" id="visitOutletFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits(1)"><option value="">Semua Outlet</option></select>
        <input class="input" id="visitDateFrom" type="date" aria-label="Tanggal mulai" style="width:160px;" data-pqt-onchange="FT.filterVisits(1)">
        <input class="input" id="visitDateTo" type="date" aria-label="Tanggal akhir" style="width:160px;" data-pqt-onchange="FT.filterVisits(1)">
        <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetVisitFilters()">Reset</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openVisitModal()">+ Tambah Kunjungan</button>
      </div>
      <div id="visitFilterSummary" class="am-muted" style="margin:0 0 10px;" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper visit-responsive-table">
        <table class="table" id="visitsTable">
          <thead><tr><th>Tanggal</th><th>Karyawan</th><th>Outlet</th><th>Check In</th><th>Check Out</th><th>Durasi</th><th>Status</th><th>Rating</th><th></th></tr></thead>
          <tbody>${initialPage.items.length ? initialPage.items.map(row => row.html).join('') : '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada data kunjungan</h3><p>Klik "Tambah Kunjungan" untuk membuat data baru</p></div></td></tr>'}</tbody>
        </table>
      </div>
      <div id="visitPager" class="visit-pager"></div>
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

window.FT.filterVisits = function(page = visitPage) {
  const search = (document.getElementById('visitSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('visitStatusFilter')?.value || '';
  const empF = document.getElementById('visitEmpFilter')?.value || '';
  const projectF = document.getElementById('visitProjectFilter')?.value || '';
  const outletF = document.getElementById('visitOutletFilter')?.value || '';
  const dateFrom = document.getElementById('visitDateFrom')?.value || '';
  const dateTo = document.getElementById('visitDateTo')?.value || '';
  const filters = { search, status, employeeId:empF, projectId:projectF, outletId:outletF, dateFrom, dateTo };
  const matched = visitRowsCache.filter(row => visitMatchesFilters(row.visit, filters, row.search));
  const pageState = paginateVisits(matched, page, VISITS_PAGE_SIZE);
  visitPage = pageState.currentPage;
  const tbody = document.querySelector('#visitsTable tbody');
  if (tbody) tbody.innerHTML = pageState.items.length
    ? pageState.items.map(row => row.html).join('')
    : '<tr><td colspan="9"><div class="empty-state"><h3>Tidak ada kunjungan sesuai filter</h3><p>Ubah atau reset filter kunjungan.</p></div></td></tr>';
  const summary = document.getElementById('visitFilterSummary');
  if (summary) summary.textContent = pageState.total
    ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} kunjungan`
    : 'Tidak ada kunjungan yang cocok dengan filter.';
  const pager = document.getElementById('visitPager');
  if (pager) {
    pager.replaceChildren();
    if (pageState.total > VISITS_PAGE_SIZE) {
      const prev = document.createElement('button');
      prev.className = 'btn btn-secondary btn-sm'; prev.type = 'button'; prev.textContent = '‹ Sebelumnya'; prev.disabled = pageState.currentPage <= 1;
      prev.addEventListener('click', () => FT.filterVisits(pageState.currentPage - 1));
      const label = document.createElement('span');
      label.className = 'visit-page-indicator'; label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
      const next = document.createElement('button');
      next.className = 'btn btn-secondary btn-sm'; next.type = 'button'; next.textContent = 'Berikutnya ›'; next.disabled = pageState.currentPage >= pageState.pageCount;
      next.addEventListener('click', () => FT.filterVisits(pageState.currentPage + 1));
      pager.append(prev, label, next);
    }
  }
};

window.FT.resetVisitFilters = function() {
  ['visitSearch','visitStatusFilter','visitEmpFilter','visitProjectFilter','visitOutletFilter','visitDateFrom','visitDateTo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  visitPage = 1;
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
      <div class="ops-inline-note">Pastikan periode tidak bertabrakan dengan pengajuan pending/approved lain.</div>
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
  state.sidebarOpen = open;
  if (bd) {
    if (open) { bd.classList.add('show'); bd.style.display = 'block'; }
    else { bd.classList.remove('show'); setTimeout(() => { if (!sb.classList.contains('open')) bd.style.display = 'none'; }, 250); }
  }
};
window.FT.closeSidebar = function() {
  state.sidebarOpen = false;
  const sb = document.querySelector('.sidebar');
  const bd = document.querySelector('.sidebar-backdrop');
  if (sb) sb.classList.remove('open');
  if (bd) { bd.classList.remove('show'); setTimeout(() => { bd.style.display = 'none'; }, 250); }
};

const visitCheckInInFlight = new Set();
const visitCheckOutInFlight = new Set();

function visitExecutionErrorMessage(error, fallback = 'Proses kunjungan gagal') {
  const code = error?.code || error?.message || '';
  return {
    VISIT_APPROVED_LEAVE_CONFLICT:'Check-in tidak dapat dilakukan karena ijin/cuti pada tanggal ini sudah disetujui.',
    VISIT_OUTSIDE_GEOFENCE:'Check-in berada di luar radius outlet.',
    VISIT_GPS_REQUIRED:'Lokasi GPS wajib tersedia untuk check-in.',
    VISIT_GEOFENCE_UNAVAILABLE:'Geofence outlet belum tersedia atau tidak valid.',
    REVISION_CONFLICT:'Data kunjungan berubah dari perangkat lain. Muat ulang lalu coba kembali.',
  }[code] || error?.message || fallback;
}

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
    showToast(visitExecutionErrorMessage(error,'Check-in gagal'), 'error');
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
    showToast(visitExecutionErrorMessage(error,'Check-out gagal'), 'error');
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
function employeeProjectIds(employeeId) {
  return activeProjectIdsForEmployee(getDB().projectAssignments || [], employeeId);
}

let employeeRowsCache = [];

function renderEmployees() {
  const employees = getEmployees();
  const db = getDB();
  const accounts = getAccounts() || [];
  const assignments = db.projectAssignments || [];
  const operationalCounts = employeeOperationalCounts(employees, assignments, accounts);
  const projectMap = Object.fromEntries((db.projects || []).map(project => [project.id, project]));
  const projectOptions = employeeProjectOptions(employees, assignments, db.projects || []);
  const currentMonth = todayISO().slice(0, 7);
  const salesByEmployee = new Map();
  for (const sale of getProductSales()) {
    if (!String(sale.soldAt || sale.date || '').startsWith(currentMonth)) continue;
    const key = String(sale.employeeId || '');
    salesByEmployee.set(key, (salesByEmployee.get(key) || 0) + (Number(sale.totalAmount ?? sale.amount) || 0));
  }
  employeeRowsCache = employees.map(e => {
    const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
    const cIdx = e.name.charCodeAt(0) % colors.length;
    const rowModel = employeeListModel(e, { assignments, accounts, projectMap });
    const { projectIds, projects, search, operational:flags, assignmentLabel, loginLabel } = rowModel;
    const model = {
      search,
      role:e.role || '',
      status:e.status || '',
      projectIds,
      assigned:flags.assigned,
      loginLinked:flags.loginLinked,
    };
    return {
      model,
      html:`<tr data-search="${esc(search)}" data-role="${esc(e.role || '')}" data-status="${esc(e.status || '')}" data-projects="${esc(projectIds.join('|'))}" data-assigned="${flags.assigned ? '1' : '0'}" data-login="${flags.loginLinked ? '1' : '0'}">
        <td data-label="Nama"><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:${colors[cIdx]};${safePhotoUrl(e.photo) ? `background-image:url('${safePhotoUrl(e.photo)}');background-size:cover;background-position:center;font-size:0;` : ''}">${getInitials(e.name)}</div><div><div style="font-weight:600;color:var(--gray-800);">${esc(e.name)}</div><div class="pm-subtext">${esc(e.employeeCode || e.code || e.id)} · ${esc(e.email)}</div></div></div></td>
        <td data-label="Role">${roleBadge(e.role)}</td>
        <td data-label="Project">${projects.map(p => `<span class="pm-project-chip">${esc(p.code || p.id)}</span>`).join('') || '—'}</td>
        <td data-label="Operational"><div class="pm-subtext">${esc(assignmentLabel)}</div><div class="pm-subtext">${esc(loginLabel)}</div></td>
        <td data-label="Area">${esc(e.area || '—')}</td>
        <td data-label="Telepon">${esc(e.phone || '—')}</td>
        <td data-label="Sales / Target"><span style="font-weight:600;">${formatCurrency(salesByEmployee.get(String(e.id)) || 0)}</span> / ${formatCurrency(salesTargetOf(e))}</td>
        <td data-label="Kunjungan">${e.totalVisits}</td>
        <td data-label="Status">${statusBadge(e.status)}</td>
        <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/employee/${e.id}'">Detail</button>${isProjectAdmin() && e.status === 'active' ? `<button class="btn btn-danger btn-sm" data-pqt-onclick="FT.deleteEmployee('${e.id}')">Nonaktifkan</button>` : ''}</div></td>
      </tr>`,
    };
  });
  const initialPage = paginateEmployees(employeeRowsCache, employeePage, EMPLOYEE_PAGE_SIZE);
  employeePage = initialPage.currentPage;
  const rendered = `
    <div class="card">
      <div class="pm-kpi-grid" style="margin-bottom:14px;">
        <div class="pm-kpi"><span>Total Karyawan</span><strong>${operationalCounts.total}</strong></div>
        <div class="pm-kpi"><span>Aktif</span><strong>${operationalCounts.active}</strong></div>
        <div class="pm-kpi"><span>Belum Ditugaskan</span><strong>${operationalCounts.unassigned}</strong></div>
        <div class="pm-kpi"><span>Login Belum Terhubung</span><strong>${operationalCounts.loginMissing}</strong></div>
      </div>
      <div class="filter-row">
        <input class="input search-input" id="empSearch" placeholder="🔍 Cari nama, email, kode, area, project..." aria-label="Cari karyawan" data-pqt-oninput="FT.filterEmployees(1)">
        <select class="select" id="empRoleFilter" style="width:180px;" aria-label="Filter role" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Role</option><option value="Field Sales">Field Sales</option><option value="Supervisor">Supervisor</option></select>
        <select class="select" id="empStatusFilter" style="width:160px;" aria-label="Filter status" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="terminated">Berakhir</option></select>
        <select class="select" id="empProjectFilter" style="width:220px;" aria-label="Filter project" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Project</option>${projectOptions.map(project => `<option value="${esc(project.id)}">${esc(project.code || project.id)} — ${esc(project.name)}</option>`).join('')}</select>
        <select class="select" id="empAssignmentFilter" style="width:180px;" aria-label="Filter assignment" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Assignment</option><option value="assigned">Sudah Ditugaskan</option><option value="unassigned">Belum Ditugaskan</option></select>
        <select class="select" id="empLoginFilter" style="width:180px;" aria-label="Filter login" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Login</option><option value="linked">Login Terhubung</option><option value="unlinked">Login Belum Terhubung</option></select>
        <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetEmployeeFilters()">Reset</button>
        <div class="spacer"></div>
        <span id="employeeSyncState">${employeeSyncLabel()}</span>
        <button class="btn btn-secondary" id="employeeRefreshBtn" type="button" data-pqt-onclick="FT.refreshEmployees()">Refresh</button>
        ${isProjectAdmin() ? `<button class="btn btn-secondary" data-pqt-onclick="FT.openBulkEmployees()">Bulk Upload</button><button class="btn btn-primary" data-pqt-onclick="FT.openEmployeeModal()">+ Tambah Karyawan</button>` : ``}
      </div>
      <div id="employeeResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper">
        <table class="table employee-table" id="empTable">
          <thead><tr><th>Nama</th><th>Role</th><th>Project</th><th>Operational</th><th>Area</th><th>Telepon</th><th>Sales / Target</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${initialPage.items.map(row => row.html).join('')}</tbody>
        </table>
      </div>
      <div id="employeeEmpty" class="pm-empty" hidden>Tidak ada karyawan yang sesuai dengan filter. Gunakan Reset untuk menampilkan seluruh data.</div>
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
  const filters = employeeFilterSnapshot(key => {
    const ids = {
      search:'empSearch', role:'empRoleFilter', status:'empStatusFilter',
      projectId:'empProjectFilter', assignment:'empAssignmentFilter', login:'empLoginFilter',
    };
    return document.getElementById(ids[key])?.value || '';
  });
  const matched = employeeRowsCache.filter(row => employeeMatchesFilters(row.model, filters));
  const pageState = paginateEmployees(matched, page, EMPLOYEE_PAGE_SIZE);
  employeePage = pageState.currentPage;
  const tbody = document.querySelector('#empTable tbody');
  if (tbody) tbody.innerHTML = pageState.items.map(row => row.html).join('');
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

window.FT.resetEmployeeFilters = function() {
  ['empSearch','empRoleFilter','empStatusFilter','empProjectFilter','empAssignmentFilter','empLoginFilter'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  employeePage = 1;
  window.FT.filterEmployees(1);
};

window.FT.refreshEmployees = async function() {
  const button = document.getElementById('employeeRefreshBtn');
  if (!getActor()?.organizationId) return;
  try {
    if (button) { button.disabled = true; button.textContent = 'Memuat…'; }
    const result = await refreshOperationalData(getDB(), getActor());
    if (result?.refreshed) {
      showToast('Data Employees diperbarui', 'success');
      render();
    } else {
      showToast('Data Employees sudah terbaru');
      window.FT.filterEmployees(employeePage);
    }
  } catch (error) {
    showToast(error?.message || 'Refresh Employees gagal', 'error');
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = 'Refresh'; }
  }
};
function employeePhotoField(current = '') {
  const src = safePhotoUrl(current || '');
  return `
    <div class="form-group emp-photo-field">
      <label class="label">Foto karyawan</label>
      <div class="employee-photo-editor">
        <img class="employee-photo-preview" alt="Preview" src="${esc(src)}" onerror="this.style.opacity=.3">
        <div>
          <input class="input" type="file" name="photoFile" accept="image/jpeg,image/png,image/webp" data-pqt-onchange="FT.previewEmployeePhoto(this)">
          <input type="hidden" name="photo" value="${esc(src)}">
          <div class="employee-photo-help">JPG/PNG/WebP. Foto dikompresi lalu disimpan di cloud storage.</div>
        </div>
      </div>
    </div>`;
}

window.FT.previewEmployeePhoto = function(input) {
  const file = input.files?.[0];
  const preview = input.closest('.emp-photo-field')?.querySelector('.employee-photo-preview');
  if (file && preview) preview.src = URL.createObjectURL(file);
};

function employeePhotoObjectKey(value = '') {
  const text = String(value || '').trim();
  const marker = '/api/files/';
  const index = text.indexOf(marker);
  if (index < 0) return '';
  try { return decodeURIComponent(text.slice(index + marker.length).split(/[?#]/)[0]); }
  catch { return ''; }
}

async function employeePhotoFromForm(form, { fallback = '', projectId = '', employeeCode = '' } = {}) {
  const file = form.querySelector('input[name="photoFile"]')?.files?.[0];
  const stored = form.querySelector('input[name="photo"]')?.value || fallback || '';
  if (!file && !String(stored).startsWith('data:image/')) return { url:stored, key:'', uploaded:false };
  const source = file || await fetch(stored).then(response => response.blob());
  const compressed = await compressImage(source, { maxPx:480, quality:0.82 });
  const blob = await fetch(compressed).then(response => response.blob());
  const safeName = String(employeeCode || 'employee').replace(/[^a-zA-Z0-9_-]+/g,'-');
  const uploadFile = new File([blob], `${safeName}.jpg`, { type:'image/jpeg' });
  const uploaded = await uploadAsset(uploadFile, { category:'employee-profile', projectId:projectId || 'general', name:uploadFile.name });
  return { url:uploaded.url, key:uploaded.key, uploaded:true };
}

async function cleanupEmployeePhoto(key) {
  if (!key) return;
  try { await deleteUploadedAsset(key); }
  catch (error) { console.warn('employee_photo_cleanup_failed', error?.message || error); }
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
      ${employeePhotoField('')}
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
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  data.salesTargetAmount = parseInt(data.salesTargetAmount, 10) || 0;
  data.attendancePointId = data.attendancePointId || null;
  data.joinDate = new Date().toISOString().slice(0, 10);
  data.status = 'active';
  if (data.role === 'Field Sales' && !String(data.supervisorEmail || '').trim()) {
    showToast('Supervisor wajib dipilih untuk Field Sales.', 'error');
    return;
  }
  let uploadedPhoto = null;
  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Memeriksa…'; }
    await ensureBulkEmployeesRuntime();
    const { checked } = await window.BulkEmployees.previewSingleEmployee({ ...data, photo:'' });
    if (!checked?.valid) {
      const error = new Error((checked?.errors || ['VALIDATION_FAILED']).join(', '));
      error.code = checked?.errors?.[0] || 'VALIDATION_FAILED';
      throw error;
    }
    if (checked.loginAction === 'create' && !String(data.password || '')) {
      const password = form.elements.password;
      if (password) {
        password.setCustomValidity('Password wajib untuk akun baru.');
        password.reportValidity();
        password.setCustomValidity('');
      }
      return;
    }
    if (submit) submit.textContent = 'Mengunggah…';
    uploadedPhoto = await employeePhotoFromForm(form, { projectId:data.projectId, employeeCode:data.employeeCode });
    data.photo = uploadedPhoto.url;
    if (submit) submit.textContent = 'Menyimpan…';
    delete data.photoFile;
    await ensureBulkEmployeesRuntime();
    await window.BulkEmployees.createSingleEmployee(data);
    closeModal();
    showToast(checked.loginAction === 'create'
      ? 'Karyawan, penugasan, dan akun login berhasil dibuat'
      : 'Karyawan berhasil dibuat dan akun login existing berhasil dihubungkan', 'success');
    render();
  } catch (error) {
    if (uploadedPhoto?.uploaded) await cleanupEmployeePhoto(uploadedPhoto.key);
    showToast(error.message || String(error), 'error');
  } finally {
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = 'Simpan'; }
  }
};
window.FT.deleteEmployee = async function(id) {
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const current = getEmployees().find(row => row.id === id);
  if (!current) return;
  const { message:impact } = employeeDeactivationImpact(id, getDB().projectAssignments || []);
  if (!confirm(`Nonaktifkan karyawan ini?${impact} Akses login aktif akan dicabut.`)) return;
  try {
    await ensureBulkEmployeesRuntime();
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
          <div class="avatar avatar-lg" style="background:${colors[cIdx]}; margin:0 auto 12px;${safePhotoUrl(emp.photo) ? `background-image:url('${safePhotoUrl(emp.photo)}');background-size:cover;background-position:center;font-size:0;` : ''}">${getInitials(emp.name)}</div>
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
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  const current = getEmployees().find(x => x.id === id);
  if (!current) return;
  const data = Object.fromEntries(new FormData(form));
  data.salesTargetAmount = parseInt(data.salesTargetAmount, 10) || 0;
  data.attendancePointId = data.attendancePointId || null;
  data.status = current.status;
  delete data.password;
  delete data.lat;
  delete data.lng;
  let uploadedPhoto = null;
  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Mengunggah…'; }
    data.employeeCode = current.employeeCode || current.code || id;
    data.projectId = '';
    data.joinDate = current.joinDate || '';
    const photoProjectId = employeeProjectIds(id)[0] || 'general';
    uploadedPhoto = await employeePhotoFromForm(form, { fallback:current.photo || '', projectId:photoProjectId, employeeCode:data.employeeCode });
    data.photo = uploadedPhoto.url;
    delete data.photoFile;
    if (submit) submit.textContent = 'Menyimpan…';
    await ensureBulkEmployeesRuntime();
    await window.BulkEmployees.updateSingleEmployee(data);
    const oldKey = uploadedPhoto?.uploaded ? employeePhotoObjectKey(current.photo) : '';
    if (oldKey && oldKey !== uploadedPhoto.key) await cleanupEmployeePhoto(oldKey);
    closeModal(); showToast('Data operasional karyawan berhasil diperbarui', 'success'); render();
  } catch (error) {
    if (uploadedPhoto?.uploaded) await cleanupEmployeePhoto(uploadedPhoto.key);
    showToast(error.message || String(error), 'error');
  } finally {
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = 'Simpan'; }
  }
};
// ===== Outlets Page =====
let outletPage = 1;

function outletOptionList(rows, valueKey, labelOf, selected = '') {
  return (rows || []).map(row => {
    const value = String(row?.[valueKey] || '');
    return `<option value="${esc(value)}" ${String(selected) === value ? 'selected' : ''}>${esc(labelOf(row))}</option>`;
  }).join('');
}


function outletSyncLabel() {
  const presentation = outletSyncPresentation(cloudDataStatus());
  return `<span class="status-badge ${presentation.className}">${esc(presentation.label)}</span>`;
}

let outletRowsCache = [];

function renderOutlets() {
  const db = getDB();
  const outlets = getOutlets();
  const projects = db.projects || [];
  const clients = db.clients || [];
  const visits = getVisits();
  const options = outletFilterOptions(outlets, { projects, clients });
  const summary = outletStatusSummary(outlets);
  const projectMap = new Map(projects.map(project => [String(project.id), project]));
  const clientMap = new Map(clients.map(client => [String(client.id), client]));
  const visitStats = new Map();
  for (const visit of visits) {
    const key = String(visit.outletId || '');
    if (!key) continue;
    const date = String(visit.date || visit.visitDate || visit.scheduledAt || '').slice(0,10);
    const current = visitStats.get(key) || { count:0, lastVisitDate:'' };
    current.count += 1;
    if (date && date > current.lastVisitDate) current.lastVisitDate = date;
    visitStats.set(key, current);
  }
  const models = outlets.map(outlet => outletOperationalModel(outlet, {
    projects, clients, visits, projectMap, clientMap, visitStats,
  }));
  outletRowsCache = models.map(model => {
    const o = model.outlet;
    return {
      model,
      html:`
        <tr>
          <td>
            <div style="font-weight:700;color:var(--gray-800)">${outletIcon(o.type)} ${esc(o.name)}</div>
            <div class="am-muted">${esc(o.outletNumber || o.code || o.id)} · ${esc(displayValue(o.address))}</div>
          </td>
          <td>
            <div style="font-weight:600">${esc(model.projectLabel || 'Belum terhubung')}</div>
            <div class="am-muted">${esc(model.clientLabel || 'Tanpa client')}${model.shared ? ' · Shared outlet' : ''}</div>
          </td>
          <td><div>${esc(displayValue(o.type))}</div><div class="am-muted">${esc(displayValue(o.area))} · ${esc(displayValue(o.channel))}</div></td>
          <td><div>${model.visitCount} kunjungan</div><div class="am-muted">Terakhir: ${model.lastVisitDate ? esc(formatDateShort(model.lastVisitDate)) : 'Belum ada'}</div></td>
          <td>${statusBadge(o.status)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/outlet/' + ${jsArg(o.id)}">Detail</button>
            <button class="btn btn-danger btn-sm" style="margin-left:4px;" data-pqt-onclick="FT.deleteOutlet(${jsArg(o.id)})">${outletLifecycleAction(o, model.visitCount).label}</button>
          </td>
        </tr>`,
    };
  });
  const initialPage = paginateOutlets(outletRowsCache, outletPage, OUTLET_PAGE_SIZE);
  outletPage = initialPage.currentPage;
  const rendered = `
    <div class="pm-kpis">
      <div class="pm-kpi"><span>Total Outlet</span><strong>${summary.total}</strong></div>
      <div class="pm-kpi"><span>Aktif</span><strong>${summary.active}</strong></div>
      <div class="pm-kpi"><span>Nonaktif</span><strong>${summary.inactive}</strong></div>
      <div class="pm-kpi"><span>Archived</span><strong>${summary.archived}</strong></div>
    </div>
    <div class="card">
      <div class="filter-row" style="gap:8px;flex-wrap:wrap">
        <input class="input search-input" id="outletSearch" placeholder="🔍 Nama, kode, alamat, PIC, project..." data-pqt-oninput="FT.filterOutlets(1)">
        <select class="select" id="outletProjectFilter" data-pqt-onchange="FT.filterOutlets(1)"><option value="">Semua Project</option>${outletOptionList(options.projects,'id',project => `${project.code || project.id} — ${project.name || ''}`)}</select>
        <select class="select" id="outletClientFilter" data-pqt-onchange="FT.filterOutlets(1)"><option value="">Semua Client</option>${outletOptionList(options.clients,'id',client => client.name || client.code || client.id)}</select>
        <select class="select" id="outletStatusFilter" data-pqt-onchange="FT.filterOutlets(1)"><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="archived">Archived</option></select>
        <select class="select" id="outletTypeFilter" data-pqt-onchange="FT.filterOutlets(1)"><option value="">Semua Tipe</option>${storeOptionList(options.types)}</select>
        <select class="select" id="outletAreaFilter" data-pqt-onchange="FT.filterOutlets(1)"><option value="">Semua Area</option>${storeOptionList(options.areas)}</select>
        <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.resetOutletFilters()">Reset</button>
        <div class="spacer"></div>
        <span id="outletSyncState">${outletSyncLabel()}</span>
        <button class="btn btn-secondary" id="outletRefreshBtn" data-pqt-onclick="FT.refreshOutlets()">Refresh</button>
        <button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('outlets')">Bulk Upload</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openOutletModal()">+ Tambah Outlet</button>
      </div>
      <div id="outletResultSummary" class="am-muted" style="margin:10px 0"></div>
      <div class="visits-table-wrapper">
        <table class="table" id="outletTable">
          <thead><tr><th>Outlet</th><th>Project / Client</th><th>Tipe / Area</th><th>Operasional</th><th>Status</th><th></th></tr></thead>
          <tbody>${initialPage.items.map(row => row.html).join('')}</tbody>
        </table>
      </div>
      <div id="outletEmpty" class="pm-empty" hidden>Tidak ada outlet yang sesuai filter. Gunakan Reset untuk menampilkan seluruh data.</div>
      <div id="outletPager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.outletPage(-1)">Sebelumnya</button><span id="outletPageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.outletPage(1)">Berikutnya</button></div>
    </div>
  `;
  queueMicrotask(() => window.FT?.filterOutlets?.(outletPage));
  return rendered;
}

window.FT.outletPage = function(delta) {
  outletPage = Math.max(1, outletPage + Number(delta || 0));
  window.FT.filterOutlets(outletPage);
};

window.FT.filterOutlets = function(page = outletPage) {
  const ids = { search:'outletSearch', projectId:'outletProjectFilter', clientId:'outletClientFilter', status:'outletStatusFilter', type:'outletTypeFilter', area:'outletAreaFilter' };
  const filters = outletFilterSnapshot(key => document.getElementById(ids[key])?.value || '');
  const matched = outletRowsCache.filter(row => outletMatchesFilters(row.model, filters));
  const pageState = paginateOutlets(matched, page, OUTLET_PAGE_SIZE);
  outletPage = pageState.currentPage;
  const tbody = document.querySelector('#outletTable tbody');
  if (tbody) tbody.innerHTML = pageState.items.map(row => row.html).join('');
  const summary = document.getElementById('outletResultSummary');
  if (summary) summary.textContent = pageState.total ? `Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} outlet` : (outletRowsCache.length ? 'Tidak ada outlet yang sesuai filter.' : 'Belum ada outlet.');
  const empty = document.getElementById('outletEmpty');
  if (empty) {
    empty.hidden = pageState.total !== 0;
    empty.textContent = outletRowsCache.length ? 'Tidak ada outlet yang sesuai filter. Gunakan Reset untuk menampilkan seluruh data.' : 'Belum ada outlet. Tambahkan outlet atau gunakan Bulk Upload.';
  }
  const pager = document.getElementById('outletPager');
  if (pager) pager.hidden = pageState.total <= OUTLET_PAGE_SIZE;
  const label = document.getElementById('outletPageLabel');
  if (label) label.textContent = `Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
  const sync = document.getElementById('outletSyncState');
  if (sync) sync.innerHTML = outletSyncLabel();
};

window.FT.resetOutletFilters = function() {
  ['outletSearch','outletProjectFilter','outletClientFilter','outletStatusFilter','outletTypeFilter','outletAreaFilter'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  outletPage = 1;
  window.FT.filterOutlets(1);
};

window.FT.refreshOutlets = async function() {
  const button = document.getElementById('outletRefreshBtn');
  try {
    if (button) { button.disabled = true; button.textContent = 'Memuat…'; }
    const result = await refreshOperationalData(getDB(), getActor());
    if (result?.refreshed) { showToast('Data Outlets diperbarui', 'success'); render(); }
    else { showToast('Data Outlets sudah terbaru'); window.FT.filterOutlets(outletPage); }
  } catch (error) {
    showToast(error?.message || 'Refresh Outlets gagal', 'error');
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = 'Refresh'; }
  }
};

function storeOptionList(rows, selected = '') {
  return (rows || []).map(v => `<option value="${esc(v)}" ${String(selected) === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

window.FT.syncManagerOutletCatalog = function(projectId) {
  const cat = normalizeOutletCatalog(projectId ? getProjectStoreSettings(projectId) : defaultStoreCatalog());
  const fill = (name, values) => {
    const sel = document.querySelector(`form[data-outlet-form="1"] select[name="${name}"]`);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = storeOptionList(values, cur);
    if (cur && !values.includes(cur)) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
  };
  fill('channel', cat.segments);
  fill('ownership', cat.ownerships);
  fill('type', cat.types);
};

window.FT.openOutletModal = function() {
  const model = outletFormModel({}, defaultStoreCatalog());
  const cat = model.catalog;
  openModal('New Outlet', `
    <form data-outlet-form="1" data-pqt-onsubmit="FT.createOutlet(event)">
      <div class="form-group"><label class="label">Nama toko</label><input class="input" name="name" required></div>
      ${entityScopeFields().replace('<select class="select" name="projectId" required>', '<select class="select" name="projectId" required data-pqt-onchange="FT.syncManagerOutletCatalog(this.value)">')}
      <div class="form-group">
        <label class="label">Lokasi di peta</label>
        <div class="filter-row" style="margin-bottom:8px"><input class="input search-input" id="outletMapSearch" placeholder="Cari alamat / nama jalan / tempat..."><button type="button" class="btn btn-secondary" data-pqt-onclick="FS.searchOutletMap()">Cari</button></div>
        <div id="outletPickMap" style="height:240px;border-radius:14px;border:1px solid var(--gray-200);overflow:hidden"></div>
        <div class="am-muted" id="outletMapHint" style="margin-top:6px">Klik peta untuk menandai titik toko. Alamat terisi otomatis.</div>
        <input type="hidden" name="lat" id="outletLat" required><input type="hidden" name="lng" id="outletLng" required><input type="hidden" name="mapLabel" id="outletMapLabel">
      </div>
      <div class="form-group"><label class="label">Alamat (otomatis dari peta, bisa diedit)</label><textarea class="textarea" name="address" id="outletAddress" required></textarea></div>
      <div class="form-row"><div class="form-group"><label class="label">Segment</label><select class="select" name="channel">${storeOptionList(cat.segments)}</select></div><div class="form-group"><label class="label">Akun (ownership store)</label><select class="select" name="ownership">${storeOptionList(cat.ownerships)}</select></div></div>
      <div class="form-row"><div class="form-group"><label class="label">Type (tipe store)</label><select class="select" name="type">${storeOptionList(cat.types)}</select></div><div class="form-group"><label class="label">Area / Kota</label><input class="input" name="area" id="outletArea" required></div></div>
      <div class="form-row"><div class="form-group"><label class="label">Telepon</label><input class="input" name="phone"></div><div class="form-group"><label class="label">Pemilik / PIC toko</label><input class="input" name="owner"></div></div>
      <div id="outletNotesWrap">${outletNotesField(cat)}</div>
      <div class="form-row"><div class="form-group"><label class="label">Frekuensi kunjungan</label><select class="select" name="visitFrequency"><option>Mingguan</option><option>Bulanan</option></select></div><div class="form-group"><label class="label">Status</label><select class="select" name="status"><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></div></div>
      <div class="modal-footer" style="padding:0;margin-top:8px"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
    </form>`);
  setTimeout(() => window.FS?.initOutletMap?.(), 80);
};

function normalizeOutletFormCoordinates(data) {
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Latitude outlet tidak valid.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Longitude outlet tidak valid.');
  return { lat, lng };
}

async function confirmAuthoritativeSync() {
  await waitForOperationalSync();
  await refreshOperationalData(getDB(), getActor());
}

window.FT.createOutlet = async function(e) {
  e.preventDefault();
  if (!isProjectAdmin()) { showToast('Akses ditolak', 'error'); return; }
  const form=e.target, submit=form.querySelector('button[type="submit"]'), data=Object.fromEntries(new FormData(form));
  try {
    if (!data.lat || !data.lng) throw new Error('Tandai titik toko di peta atau cari lokasi dulu.');
    Object.assign(data, normalizeOutletFormCoordinates(data));
    if (submit) { submit.disabled=true; submit.textContent='Menyimpan…'; }
    createOutlet(data);
    if (submit) submit.textContent='Sinkronisasi…';
    await confirmAuthoritativeSync();
    closeModal(); showToast('Outlet berhasil disimpan.','success'); render();
  } catch (error) {
    restoreOperationalBaseline(getDB()); showToast(error.message || String(error),'error'); render();
  } finally { if (submit?.isConnected) { submit.disabled=false; submit.textContent='Simpan'; } }
};

window.FT.deleteOutlet = async function(id) {
  if (!isProjectAdmin()) { showToast('Akses ditolak','error'); return; }
  const references=outletReferenceSummary(id);
  const outlet=getOutlets().find(row=>row.id===id)||{};
  const lifecycle=outletLifecycleAction(outlet,references.total);
  if (!confirm(lifecycle.confirm)) return;
  try {
    const result=deleteOutlet(id); await confirmAuthoritativeSync();
    showToast(result.deactivated ? 'Outlet dinonaktifkan dan histori tetap dipertahankan' : 'Outlet berhasil dihapus','success'); render();
  } catch (error) { restoreOperationalBaseline(getDB()); showToast(error.message || String(error),'error'); render(); }
};

// ===== Outlet Detail =====
function renderOutletDetail(id) {
  const o=getOutlets().find(x=>x.id===id);
  if(!o) return '<div class="empty-state"><h3>Outlet tidak ditemukan</h3></div>';
  const db=getDB(), model=outletOperationalModel(o,{projects:db.projects||[],clients:db.clients||[],visits:getVisits()});
  const visits=getVisits().filter(v=>v.outletId===id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const empMap=Object.fromEntries(getEmployees().map(e=>[e.id,e]));
  return `
    <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-bottom:24px">
      <div class="card" style="flex:0 0 340px">
        <div style="text-align:center;padding:12px 0 20px"><div style="font-size:48px;margin-bottom:8px">${outletIcon(o.type)}</div><div style="font-size:18px;font-weight:800;color:var(--gray-900)">${esc(o.name)}</div><div style="margin-top:4px">${statusBadge(o.status)}</div></div>
        <div class="detail-grid">
          <div class="detail-label">Kode</div><div class="detail-value">${esc(displayValue(o.outletNumber||o.code||o.id))}</div>
          <div class="detail-label">Project</div><div class="detail-value">${esc(model.projectLabel||'—')}</div>
          <div class="detail-label">Client</div><div class="detail-value">${esc(model.clientLabel||'—')}</div>
          <div class="detail-label">Tipe</div><div class="detail-value">${esc(displayValue(o.type))}</div>
          <div class="detail-label">Segment</div><div class="detail-value">${esc(displayValue(o.channel))}</div>
          <div class="detail-label">Ownership</div><div class="detail-value">${esc(displayValue(o.ownership))}</div>
          <div class="detail-label">Alamat</div><div class="detail-value full">${esc(displayValue(o.address))}</div>
          <div class="detail-label">Pemilik</div><div class="detail-value">${esc(displayValue(o.owner))}</div>
          <div class="detail-label">Telepon</div><div class="detail-value">${esc(displayValue(o.phone))}</div>
          <div class="detail-label">Area</div><div class="detail-value">${esc(displayValue(o.area))}</div>
          <div class="detail-label">Lokasi</div><div class="detail-value">${Number.isFinite(Number(o.lat))&&Number.isFinite(Number(o.lng))?`${Number(o.lat).toFixed(4)}, ${Number(o.lng).toFixed(4)}`:'—'}</div>
          <div class="detail-label">Frekuensi</div><div class="detail-value">${esc(displayValue(o.visitFrequency))}</div>
          <div class="detail-label">Notes</div><div class="detail-value full">${esc(displayValue(o.notes))}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:20px"><button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/outlets'">← Kembali</button><button class="btn btn-primary btn-sm" data-pqt-onclick="FT.editOutlet(${jsArg(o.id)})">Edit</button></div>
      </div>
      <div style="flex:1;min-width:300px"><div class="card"><div class="card-title">Riwayat Kunjungan</div><div class="card-subtitle">${visits.length} kunjungan · terakhir ${model.lastVisitDate?esc(formatDateShort(model.lastVisitDate)):'belum ada'}</div>
        ${visits.length===0?'<div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada riwayat</h3></div>':`<div class="visits-table-wrapper"><table class="table"><thead><tr><th>Tanggal</th><th>Karyawan</th><th>Check In</th><th>Status</th></tr></thead><tbody>${visits.map(v=>{const emp=empMap[v.employeeId];return `<tr><td>${formatDateShort(v.date)}</td><td>${esc(emp?emp.name:'-')}</td><td>${esc(v.checkInTime||'-')}</td><td>${statusBadge(v.status)}</td></tr>`}).join('')}</tbody></table></div>`}
      </div></div>
    </div>`;
}

window.FT.editOutlet = function(id) {
  const o=getOutlets().find(x=>x.id===id);
  if(!o) return;
  const projectId=o.projectIds?.[0]||'';
  const model=outletFormModel(o,projectId?getProjectStoreSettings(projectId):defaultStoreCatalog());
  const cat=model.catalog;
  openModal('Edit Outlet', `
    <form data-outlet-form="1" data-pqt-onsubmit="FT.updateOutlet(event, ${jsArg(id)})">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" value="${esc(model.name)}" required></div>
      ${entityScopeFields(o).replace('<select class="select" name="projectId" required>', '<select class="select" name="projectId" required data-pqt-onchange="FT.syncManagerOutletCatalog(this.value)">')}
      <div class="form-group"><label class="label">Lokasi di peta</label><div class="filter-row" style="margin-bottom:8px"><input class="input search-input" id="outletMapSearch" placeholder="Cari alamat / nama jalan / tempat..."><button type="button" class="btn btn-secondary" data-pqt-onclick="FS.searchOutletMap()">Cari</button></div><div id="outletPickMap" style="height:240px;border-radius:14px;border:1px solid var(--gray-200);overflow:hidden"></div><div class="am-muted" id="outletMapHint" style="margin-top:6px">Titik saat ini akan ditampilkan. Klik peta untuk memindahkan lokasi.</div><input type="hidden" name="lat" id="outletLat" value="${esc(model.lat)}" required><input type="hidden" name="lng" id="outletLng" value="${esc(model.lng)}" required><input type="hidden" name="mapLabel" id="outletMapLabel"></div>
      <div class="form-group"><label class="label">Alamat</label><textarea class="textarea" name="address" id="outletAddress" required>${esc(model.address)}</textarea></div>
      <div class="form-row"><div class="form-group"><label class="label">Segment</label><select class="select" name="channel">${storeOptionList(cat.segments,model.channel)}</select></div><div class="form-group"><label class="label">Akun (ownership store)</label><select class="select" name="ownership">${storeOptionList(cat.ownerships,model.ownership)}</select></div></div>
      <div class="form-row"><div class="form-group"><label class="label">Type</label><select class="select" name="type">${storeOptionList(cat.types,model.type)}</select></div><div class="form-group"><label class="label">Area</label><input class="input" name="area" id="outletArea" value="${esc(model.area)}" required></div></div>
      <div class="form-row"><div class="form-group"><label class="label">Pemilik</label><input class="input" name="owner" value="${esc(model.owner)}"></div><div class="form-group"><label class="label">Telepon</label><input class="input" name="phone" value="${esc(model.phone)}"></div></div>
      <div id="outletNotesWrap">${outletNotesField(cat,model.notes)}</div>
      <div class="form-row"><div class="form-group"><label class="label">Frekuensi</label><select class="select" name="visitFrequency"><option ${model.visitFrequency==='Mingguan'?'selected':''}>Mingguan</option><option ${model.visitFrequency==='Bulanan'?'selected':''}>Bulanan</option></select></div><div class="form-group"><label class="label">Status</label><select class="select" name="status"><option value="active" ${model.status==='active'?'selected':''}>Active</option><option value="inactive" ${model.status==='inactive'?'selected':''}>Inactive</option><option value="archived" ${model.status==='archived'?'selected':''}>Archived</option></select></div></div>
      <div class="modal-footer" style="padding:0;margin-top:8px"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
    </form>`);
  setTimeout(()=>window.FS?.initOutletMap?.(),80);
};

window.FT.updateOutlet = async function(e,id) {
  e.preventDefault();
  if(!isProjectAdmin()){showToast('Akses ditolak','error');return;}
  const form=e.target,submit=form.querySelector('button[type="submit"]'),data=Object.fromEntries(new FormData(form));
  try{
    Object.assign(data,normalizeOutletFormCoordinates(data));
    if(submit){submit.disabled=true;submit.textContent='Menyimpan…';}
    updateOutlet(id,data);
    if(submit)submit.textContent='Sinkronisasi…';
    await confirmAuthoritativeSync();
    closeModal();showToast('Data outlet berhasil diperbarui.','success');render();
  }catch(error){restoreOperationalBaseline(getDB());showToast(stockSalesFriendlyErrorMessage(error),'error');render();await recoverStockSalesAfterError(error);}
  finally{if(submit?.isConnected){submit.disabled=false;submit.textContent='Simpan';}}
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
            ${visits.length === 0 ? `<tr><td colspan="8"><div class="empty-state">${appIcon('visits')}<h3>Belum ada riwayat kunjungan</h3></div></td></tr>` :
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
let productPage = 1;

function productScopeFields(model) {
  if (!model.hasAvailableProjects) return '<div class="pm-empty">Tidak ada project aktif yang dapat digunakan.</div>';
  return `
    <div class="form-group">
      <label class="label">Project / Klien</label>
      <select class="select" name="projectIds" multiple size="${Math.min(6,Math.max(2,model.projectOptions.length))}" required>
        ${model.projectOptions.map(option => `<option value="${esc(option.id)}" ${option.selected?'selected':''}>${esc(option.label)}</option>`).join('')}
      </select>
      <div class="am-muted" style="margin-top:5px">Bisa memilih beberapa project, tetapi seluruh project harus berasal dari client yang sama.</div>
    </div>`;
}

function productFormFields(p = null) {
  const db=getDB(), actor=getActor();
  const model=productFormModel(p||{},{
    projects:db.projects||[],
    clients:db.clients||[],
    actor,
    isOrgAdmin:isOrgAdminRole(actor?.role),
  });
  return `
    <div class="form-group"><label class="label">Nama Produk</label><input class="input" name="name" value="${esc(model.name)}" required></div>
    ${productScopeFields(model)}
    <div class="form-row">
      <div class="form-group"><label class="label">Brand / Merek</label><input class="input" name="brand" value="${esc(model.brand)}" placeholder="Nestlé, Unilever..." required></div>
      <div class="form-group"><label class="label">SKU</label><input class="input" name="sku" value="${esc(model.sku)}" placeholder="NST-XXX-001" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Kategori</label><input class="input" name="category" value="${esc(model.category)}" placeholder="Minuman, Snack..." required list="catList"></div>
      <div class="form-group"><label class="label">Satuan</label><input class="input" name="unit" value="${esc(model.unit)}" placeholder="pcs, dus, sak" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Harga Jual (Rp)</label><input class="input" type="number" name="price" value="${model.price}" required min="0"></div>
      <div class="form-group"><label class="label">Cost / HPP (opsional)</label><input class="input" type="number" name="cost" value="${model.cost}" min="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Margin % (opsional)</label><input class="input" type="number" name="margin" value="${model.margin}" min="0" max="100" step="0.1"></div>
      <div class="form-group"><label class="label">Status</label><select class="select" name="status">
        <option value="active" ${model.status==='active'?'selected':''}>Active</option>
        <option value="inactive" ${model.status==='inactive'?'selected':''}>Inactive</option>
        <option value="archived" ${model.status==='archived'?'selected':''}>Archived</option>
      </select></div>
    </div>`;
}

function productFormData(form) {
  const fd=new FormData(form);
  return normalizeProductFormPayload(Object.fromEntries(fd),fd.getAll('projectIds'));
}

function productSyncLabel() {
  const presentation=productSyncPresentation(cloudDataStatus());
  return `<span class="status-badge ${presentation.className}">${esc(presentation.label)}</span>`;
}

function productOptionList(rows, valueKey, labelFn) {
  return (rows||[]).map(row=>`<option value="${esc(row[valueKey])}">${esc(labelFn(row))}</option>`).join('');
}

let productRowsCache = [];

function renderProducts() {
  const products = getProducts();
  const db = getDB();
  const projects = db.projects || [];
  const clients = db.clients || [];
  const projectMap = new Map(projects.map(project => [String(project.id), project]));
  const clientMap = new Map(clients.map(client => [String(client.id), client]));
  const models = products.map(product => productOperationalModel(product, { projects, clients, projectMap, clientMap }));
  const options = productFilterOptions(products,{projects,clients});
  const statusSummary = productStatusSummary(products);
  const sharedCount = models.filter(model => model.shared).length;
  const referenceCounts = new Map();
  for (const rows of [db.productSales, db.stocks, db.priceObservations, db.competitorIntel]) {
    for (const row of rows || []) {
      const key = String(row.productId || '');
      if (!key) continue;
      referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
    }
  }
  productRowsCache = models.map(model => {
    const p = model.product;
    const lifecycle = productLifecycleAction(p, referenceCounts.get(String(p.id)) || 0);
    return {
      model,
      html:`
        <tr>
          <td><div style="font-weight:700;color:var(--gray-800)">${esc(p.name)}</div><div class="am-muted">${esc(p.sku)} · ${esc(p.unit||'—')}</div></td>
          <td><div style="font-weight:600">${esc(model.projectLabel||'Belum terhubung')}</div><div class="am-muted">${esc(model.clientLabel||'Tanpa client')}${model.shared?' · Shared product':''}</div></td>
          <td><div>${esc(p.brand||'—')}</div><div class="am-muted">${esc(p.category||'—')}</div></td>
          <td><div style="font-weight:700">${formatCurrency(p.price)}</div><div class="am-muted">${p.cost!=null?`HPP ${formatCurrency(p.cost)}`:'HPP —'} · ${p.margin!=null?`${p.margin}%`:'Margin —'}</div></td>
          <td>${statusBadge(p.status)}</td>
          <td style="white-space:nowrap"><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.editProduct(${jsArg(p.id)})">Edit</button><button class="btn btn-danger btn-sm" style="margin-left:4px" data-pqt-onclick="FT.deleteProductConfirm(${jsArg(p.id)})">${esc(lifecycle.label)}</button></td>
        </tr>`,
    };
  });
  const initialPage = paginateProducts(productRowsCache, productPage, PRODUCT_PAGE_SIZE);
  productPage = initialPage.currentPage;
  const rendered=`
    <div class="grid-4" style="margin-bottom:14px">
      <div class="stat-card"><div class="stat-label">Total Produk</div><div class="stat-value">${statusSummary.total}</div></div>
      <div class="stat-card"><div class="stat-label">Aktif</div><div class="stat-value">${statusSummary.active}</div></div>
      <div class="stat-card"><div class="stat-label">Brand</div><div class="stat-value">${statusSummary.brands}</div></div>
      <div class="stat-card"><div class="stat-label">Shared Product</div><div class="stat-value">${sharedCount}</div></div>
    </div>
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="productSearch" placeholder="Cari nama, SKU, brand, project, client..." data-pqt-oninput="FT.filterProducts(1)">
        <select class="select" id="productProjectFilter" data-pqt-onchange="FT.filterProducts(1)"><option value="">Semua Project</option>${productOptionList(options.projects,'id',p=>`${p.code||p.id} — ${p.name||''}`)}</select>
        <select class="select" id="productClientFilter" data-pqt-onchange="FT.filterProducts(1)"><option value="">Semua Client</option>${productOptionList(options.clients,'id',c=>c.name||c.code||c.id)}</select>
        <select class="select" id="productCatFilter" data-pqt-onchange="FT.filterProducts(1)"><option value="">Semua Kategori</option>${options.categories.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
        <select class="select" id="productBrandFilter" data-pqt-onchange="FT.filterProducts(1)"><option value="">Semua Brand</option>${options.brands.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>
        <select class="select" id="productStatusFilter" data-pqt-onchange="FT.filterProducts(1)"><option value="">Semua Status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select>
        <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.resetProductFilters()">Reset</button>
        <div class="spacer"></div>
        <span id="productSyncState">${productSyncLabel()}</span>
        <button class="btn btn-secondary" id="productRefreshBtn" data-pqt-onclick="FT.refreshProducts()">Refresh</button>
        <button class="btn btn-secondary" data-pqt-onclick="FT.openBulkMaster('products')">Bulk Upload</button>
        <button class="btn btn-primary" data-pqt-onclick="FT.openProductModal()">+ Tambah Produk</button>
      </div>
      <datalist id="catList">${options.categories.map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
      <div id="productResultSummary" class="am-muted" style="margin:10px 0"></div>
      <div class="visits-table-wrapper"><table class="table" id="productTable">
        <thead><tr><th>Produk</th><th>Project / Client</th><th>Brand / Kategori</th><th>Harga</th><th>Status</th><th></th></tr></thead>
        <tbody>${initialPage.items.map(row => row.html).join('')}</tbody>
      </table></div>
      <div id="productEmpty" class="pm-empty" hidden></div>
      <div id="productPager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.productPage(-1)">Sebelumnya</button><span id="productPageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.productPage(1)">Berikutnya</button></div>
    </div>`;
  queueMicrotask(()=>window.FT?.filterProducts?.(productPage));
  return rendered;
}

window.FT.productPage=function(delta){ productPage=Math.max(1,productPage+Number(delta||0)); window.FT.filterProducts(productPage); };

window.FT.filterProducts=function(page=productPage){
  const ids={search:'productSearch',projectId:'productProjectFilter',clientId:'productClientFilter',category:'productCatFilter',brand:'productBrandFilter',status:'productStatusFilter'};
  const filters=productFilterSnapshot(key=>document.getElementById(ids[key])?.value||'');
  const matched=productRowsCache.filter(row=>productMatchesFilters(row.model,filters));
  const pageState=paginateProducts(matched,page,PRODUCT_PAGE_SIZE);
  productPage=pageState.currentPage;
  const tbody=document.querySelector('#productTable tbody');
  if(tbody) tbody.innerHTML=pageState.items.map(row=>row.html).join('');
  const summary=document.getElementById('productResultSummary');
  if(summary) summary.textContent=pageState.total?`Menampilkan ${pageState.from}–${pageState.to} dari ${pageState.total} produk`:(productRowsCache.length?'Tidak ada produk yang sesuai filter.':'Belum ada produk.');
  const empty=document.getElementById('productEmpty');
  if(empty){empty.hidden=pageState.total!==0;empty.textContent=productRowsCache.length?'Tidak ada produk yang sesuai filter. Gunakan Reset untuk menampilkan seluruh data.':'Belum ada produk. Tambahkan produk atau gunakan Bulk Upload.';}
  const pager=document.getElementById('productPager'); if(pager) pager.hidden=pageState.total<=PRODUCT_PAGE_SIZE;
  const label=document.getElementById('productPageLabel'); if(label) label.textContent=`Halaman ${pageState.currentPage} / ${pageState.pageCount}`;
  const sync=document.getElementById('productSyncState'); if(sync) sync.innerHTML=productSyncLabel();
};

window.FT.resetProductFilters=function(){
  ['productSearch','productProjectFilter','productClientFilter','productCatFilter','productBrandFilter','productStatusFilter'].forEach(id=>{const field=document.getElementById(id);if(field)field.value='';});
  productPage=1; window.FT.filterProducts(1);
};

window.FT.refreshProducts=async function(){
  const button=document.getElementById('productRefreshBtn');
  try{
    if(button){button.disabled=true;button.textContent='Memuat…';}
    const result=await refreshOperationalData(getDB(),getActor());
    if(result?.refreshed){showToast('Data Products diperbarui','success');render();}
    else{showToast('Data Products sudah terbaru');window.FT.filterProducts(productPage);}
  }catch(error){showToast(error?.message||'Refresh Products gagal','error');}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='Refresh';}}
};

window.FT.openProductModal=function(){
  openModal('Tambah Produk',`<form data-pqt-onsubmit="FT.createProduct(event)">${productFormFields()}<div class="modal-footer" style="padding:0;margin-top:8px"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`);
};

window.FT.createProduct=async function(e){
  e.preventDefault(); if(!isProjectAdmin()){showToast('Akses ditolak','error');return;}
  const form=e.target,submit=form.querySelector('button[type="submit"]'),data=productFormData(form);
  try{if(submit){submit.disabled=true;submit.textContent='Menyimpan…';}createProduct(data);if(submit)submit.textContent='Sinkronisasi…';await confirmAuthoritativeSync();closeModal();showToast('Produk berhasil ditambahkan.','success');render();}
  catch(error){restoreOperationalBaseline(getDB());showToast(error.message||String(error),'error');render();}
  finally{if(submit?.isConnected){submit.disabled=false;submit.textContent='Simpan';}}
};

window.FT.editProduct=function(id){
  if(!isProjectAdmin())return;const p=getProducts().find(x=>x.id===id);if(!p)return;
  openModal('Edit Produk',`<form data-pqt-onsubmit="FT.updateProduct(event,${jsArg(id)})">${productFormFields(p)}<div class="modal-footer" style="padding:0;margin-top:8px"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`);
};

window.FT.updateProduct=async function(e,id){
  e.preventDefault();if(!isProjectAdmin()){showToast('Akses ditolak','error');return;}
  const form=e.target,submit=form.querySelector('button[type="submit"]'),data=productFormData(form);
  try{if(submit){submit.disabled=true;submit.textContent='Menyimpan…';}updateProduct(id,data);if(submit)submit.textContent='Sinkronisasi…';await confirmAuthoritativeSync();closeModal();showToast('Produk dan relasi project berhasil diperbarui','success');render();}
  catch(error){restoreOperationalBaseline(getDB());showToast(error.message||String(error),'error');render();}
  finally{if(submit?.isConnected){submit.disabled=false;submit.textContent='Simpan';}}
};

window.FT.deleteProductConfirm=async function(id){
  if(!isProjectAdmin()){showToast('Akses ditolak','error');return;}
  const references=productReferenceSummary(id);
  const product=getProducts().find(row=>row.id===id)||{};
  const lifecycle=productLifecycleAction(product,references.total);
  if(!confirm(lifecycle.confirm))return;
  try{const result=deleteProduct(id);await confirmAuthoritativeSync();showToast(result.deactivated?'Produk dinonaktifkan dan histori tetap dipertahankan':'Produk berhasil dihapus','success');render();}
  catch(error){restoreOperationalBaseline(getDB());showToast(error.message||String(error),'error');render();}
};

function stockProjectRows() {
  const organizationId = String(getCurrentOrgId() || '');
  const actor = getActor() || {};
  const allowed = new Set((actor.projectIds || []).map(String));
  const broad = isOrgAdminRole(actor.role);
  return (getDB().projects || []).filter(row =>
    (!organizationId || String(row.organizationId || organizationId) === organizationId)
    && row.status !== 'archived'
    && (broad || allowed.has(String(row.id)))
  );
}

function stockCommonProjectIds(outletId, productId) {
  const outlet = getOutlets().find(row => String(row.id) === String(outletId));
  const product = getProducts().find(row => String(row.id) === String(productId));
  return commonProjectIds(outlet, product);
}

async function recoverStockSalesAfterError(error) {
  if (!['REVISION_CONFLICT','INVENTORY_CYCLE_OPENING_MISMATCH'].includes(String(error?.code || error?.message || ''))) return false;
  try {
    location.reload();
    return true;
  } catch {
    return false;
  }
}

async function runStockSalesMutation(execute, { successMessage = '', onSuccess = null } = {}) {
  try {
    const result = await execute();
    await waitForOperationalSync();
    await refreshOperationalData(getDB(), getActor());
    if (onSuccess) await onSuccess(result);
    if (successMessage) showToast(successMessage, 'success');
    return { ok:true, result };
  } catch (error) {
    restoreOperationalBaseline(getDB());
    showToast(stockSalesFriendlyErrorMessage(error), 'error');
    render();
    await recoverStockSalesAfterError(error);
    return { ok:false, error };
  }
}

// ===== Product Sales =====
function renderProductSales({ mine = false } = {}) {
  const employeeId = myEmployeeId();
  const products = Object.fromEntries(getProducts().map(row => [row.id,row]));
  const outlets = Object.fromEntries(getOutlets().map(row => [row.id,row]));
  const employees = Object.fromEntries(getEmployees().map(row => [row.id,row]));
  const rows = getProductSales()
    .filter(row => !mine || String(row.employeeId || '') === String(employeeId || ''))
    .sort((a,b) => String(b.soldAt || b.date || '').localeCompare(String(a.soldAt || a.date || '')));
  const manualAllowed = !mine && isProjectAdmin();
  const auditRows = getProductSalesAudit();
  const pendingCorrections = manualAllowed ? pendingManualCorrections(auditRows) : [];
  const salesTotals = salesSummary(rows);
  const totalQty = salesTotals.quantity;
  const totalAmount = salesTotals.amount;
  const manualCount = salesTotals.manual;
  const thisMonth = todayISO().slice(0,7);
  queueMicrotask(()=>window.FT?.filterProductSales?.());
  return `
    ${pendingCorrections.length ? `<div class="card" style="margin-bottom:16px;border-color:var(--amber-300);background:var(--amber-50)">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div><strong>${pendingCorrections.length} koreksi manual belum memiliki replacement</strong><div class="am-muted">Sumber sudah di-void dan tetap tersimpan di audit trail.</div></div>
        <div class="spacer"></div>
        ${pendingCorrections.slice(0,3).map(row=>`<button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openManualSaleModal(${jsArg(row.id)})">Lanjut ${esc(row.id)}</button>`).join('')}
      </div>
    </div>` : ''}
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Transaksi aktif</div><div class="stat-value" id="salesKpiTransactions">${rows.length}</div></div>
      <div class="stat-card"><div class="stat-label">Qty terjual</div><div class="stat-value" id="salesKpiQty">${totalQty}</div></div>
      <div class="stat-card"><div class="stat-label">Nilai penjualan</div><div class="stat-value" id="salesKpiAmount" style="font-size:20px">${formatCurrency(totalAmount)}</div><div class="am-muted" id="salesKpiManual">${manualCount} manual exception</div></div>
    </div>
    <div class="card">
      <div class="filter-row">
        <input class="input search-input" id="salesSearch" placeholder="Cari employee, outlet, produk..." data-pqt-oninput="FT.filterProductSales()">
        <select class="select" id="salesSourceFilter" style="width:170px" data-pqt-onchange="FT.filterProductSales()">
          <option value="">Semua sumber</option><option value="derived">Derived Stock</option><option value="manual">Manual Exception</option>
        </select>
        <input class="input" id="salesFromFilter" type="date" value="${thisMonth}-01" data-pqt-onchange="FT.filterProductSales()" style="width:155px">
        <input class="input" id="salesToFilter" type="date" value="${todayISO()}" data-pqt-onchange="FT.filterProductSales()" style="width:155px">
        <div class="spacer"></div>
        <span id="salesResultSummary" class="am-muted"></span>
        ${manualAllowed ? '<button class="btn btn-primary" data-pqt-onclick="FT.openManualSaleModal()">+ Manual Exception</button>' : ''}
      </div>
      <div class="card-subtitle" style="margin-bottom:12px">Penjualan otomatis berasal dari pergerakan stok yang sudah difinalisasi. Transaksi manual hanya dipakai untuk pengecualian atau koreksi dan tetap memiliki jejak audit.</div>
      <div class="visits-table-wrapper">
        <table class="table" id="productSalesTable"><thead><tr><th>Tanggal</th><th>Employee</th><th>Outlet</th><th>Produk</th><th>Qty</th><th>Nilai</th><th>Sumber</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(row => {
            const provenance=String(row.provenance || 'manual_legacy');
            const manual=!['derived_stock','inventory_cycle'].includes(provenance);
            const date=String(row.soldAt || row.date || '').slice(0,10);
            const search=[employees[row.employeeId]?.name,row.employeeId,outlets[row.outletId]?.name,row.outletId,products[row.productId]?.name,products[row.productId]?.sku].filter(Boolean).join(' ').toLowerCase();
            return `<tr data-search="${esc(search)}" data-source="${manual?'manual':'derived'}" data-date="${esc(date)}" data-qty="${Number(row.quantity ?? row.qty ?? 0)}" data-amount="${Number(row.totalAmount ?? row.amount ?? 0)}">
              <td>${formatDateShort(date)}</td>
              <td>${esc(employees[row.employeeId]?.name || row.employeeId || '-')}</td>
              <td>${esc(outlets[row.outletId]?.name || row.outletId || '-')}</td>
              <td>${esc(products[row.productId]?.name || row.productId || '-')}</td>
              <td>${Number(row.quantity ?? row.qty ?? 0)}</td>
              <td>${formatCurrency(Number(row.totalAmount ?? row.amount ?? 0))}</td>
              <td>${manual ? '<span class="badge badge-warning">Manual Exception</span>' : '<span class="badge badge-success">Derived Stock</span>'}</td>
              <td>${manualAllowed && manual ? `<button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.correctManualSale(${jsArg(row.id)})">Koreksi</button>` : ''}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="8"><div class="empty-state"><h3>Belum ada penjualan</h3><p>Penjualan akan muncul setelah Inventory Cycle difinalisasi.</p></div></td></tr>'}</tbody>
        </table>
      </div>
      <div id="salesEmptyFilter" class="empty-state" hidden><h3>Tidak ada transaksi sesuai filter</h3><p>Ubah periode, sumber, atau kata pencarian.</p></div>
    </div>`;
}

window.FT.filterProductSales = function() {
  const filters=salesFilterSnapshot(key=>({
    search:document.getElementById('salesSearch')?.value,
    source:document.getElementById('salesSourceFilter')?.value,
    from:document.getElementById('salesFromFilter')?.value,
    to:document.getElementById('salesToFilter')?.value,
  })[key]||'');
  const rows=[...document.querySelectorAll('#productSalesTable tbody tr[data-search]')];
  const visibleRows=[];
  rows.forEach(row=>{
    const model={
      search:row.dataset.search||'', source:row.dataset.source||'', date:row.dataset.date||'',
      quantity:Number(row.dataset.qty||0), totalAmount:Number(row.dataset.amount||0),
      provenance:row.dataset.source==='manual'?'manual_override':'derived_stock',
    };
    const show=salesMatchesFilters(model,filters);
    row.style.display=show?'':'none';
    if(show) visibleRows.push(model);
  });
  const totals=salesSummary(visibleRows);
  const tx=document.getElementById('salesKpiTransactions'); if(tx) tx.textContent=String(totals.transactions);
  const qty=document.getElementById('salesKpiQty'); if(qty) qty.textContent=String(totals.quantity);
  const amount=document.getElementById('salesKpiAmount'); if(amount) amount.textContent=formatCurrency(totals.amount);
  const manual=document.getElementById('salesKpiManual'); if(manual) manual.textContent=`${totals.manual} manual exception`;
  const summary=document.getElementById('salesResultSummary');
  if(summary) summary.textContent=`${totals.transactions} dari ${rows.length} transaksi`;
  const empty=document.getElementById('salesEmptyFilter');
  if(empty) empty.hidden=totals.transactions!==0 || rows.length===0;
};

window.FT.openManualSaleModal = function(correctionOfSaleId = '') {
  if (!isProjectAdmin()) { showToast('Manual sale hanya untuk Manager/Admin.', 'error'); return; }
  const source = correctionOfSaleId ? getProductSalesAudit().find(row => row.id === correctionOfSaleId) : null;
  const employeeRows = getEmployees();
  const productRows = getProducts().filter(row => row.status === 'active');
  const outletRows = getOutlets().filter(row => row.status !== 'archived');
  const projectRows = stockProjectRows();
  const idempotencyKey=`manual-sale:${crypto.randomUUID?.() || (Date.now()+'-'+Math.random())}`;
  openModal(correctionOfSaleId ? 'Replacement Manual Sale' : 'Manual Sale Exception', `
    <form data-pqt-onsubmit="FT.saveManualSale(event,${jsArg(correctionOfSaleId)})">
      <input type="hidden" name="idempotencyKey" value="${esc(idempotencyKey)}">
      <div class="form-group"><label class="label">Project</label><select class="select" name="projectId" required><option value="">Pilih project</option>${projectRows.map(row=>`<option value="${row.id}" ${source?.projectId===row.id?'selected':''}>${esc(row.name||row.code||row.id)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Employee</label><select class="select" name="employeeId" required><option value="">Pilih employee</option>${employeeRows.map(row=>`<option value="${row.id}" ${source?.employeeId===row.id?'selected':''}>${esc(row.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Outlet</label><select class="select" name="outletId" required><option value="">Pilih outlet</option>${outletRows.map(row=>`<option value="${row.id}" ${source?.outletId===row.id?'selected':''}>${esc(formatOutletLabel(row))}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Produk</label><select class="select" name="productId" required><option value="">Pilih produk</option>${productRows.map(row=>`<option value="${row.id}" ${source?.productId===row.id?'selected':''}>${esc(row.name)} (${esc(row.sku||'-')})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Qty</label><input class="input" type="number" name="qty" min="0.0001" step="any" value="${source?.quantity ?? source?.qty ?? ''}" required></div>
        <div class="form-group"><label class="label">Unit Price</label><input class="input" type="number" name="unitPrice" min="0" step="any" value="${source?.unitPrice ?? ''}" required></div>
      </div>
      <div class="form-group"><label class="label">Tanggal</label><input class="input" type="date" name="date" value="${todayISO()}" required></div>
      <div class="form-group"><label class="label">Alasan manual</label><textarea class="textarea" name="manualReason" minlength="10" required placeholder="Jelaskan alasan exception/correction..."></textarea></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div>
    </form>
  `);
};

window.FT.saveManualSale = async function(e, correctionOfSaleId = '') {
  e.preventDefault();
  const form=e.target, submit=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form));
  const projectId=String(data.projectId || '');
  if(!projectId || !stockCommonProjectIds(data.outletId,data.productId).includes(projectId)){showToast('Project tidak sesuai dengan relasi outlet dan produk.','error');return;}
  try{
    if(submit){submit.disabled=true;submit.textContent='Sinkronisasi…';}
    await runStockSalesMutation(() => createProductSale({
      ...data, projectId, qty:Number(data.qty), unitPrice:Number(data.unitPrice),
      soldAt:`${data.date}T12:00:00+07:00`,
      correctionOfSaleId:correctionOfSaleId || null,
      idempotencyKey:String(data.idempotencyKey || ''),
    }), {
      successMessage:'Manual sale tersimpan dengan audit trail.',
      onSuccess:()=>{ closeModal(); render(); },
    });
  } finally { if(submit?.isConnected){submit.disabled=false;submit.textContent='Simpan';} }
};

window.FT.correctManualSale = function(id) {
  if(!isProjectAdmin()){showToast('Akses ditolak','error');return;}
  const sale=(getDB().productSales||[]).find(row=>row.id===id);
  if(!sale){showToast('Penjualan tidak ditemukan.','error');return;}
  openModal('Koreksi Manual Sale', `
    <form data-pqt-onsubmit="FT.confirmManualSaleCorrection(event,${jsArg(id)})">
      <div class="am-muted" style="margin-bottom:12px">Transaksi lama akan di-void dan dipertahankan sebagai audit trail. Setelah itu sistem membuka form replacement.</div>
      <div class="form-group"><label class="label">Alasan koreksi</label><textarea class="textarea" name="reason" minlength="10" required placeholder="Jelaskan kesalahan dan alasan koreksi..."></textarea></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Void & Buat Replacement</button></div>
    </form>
  `);
};

window.FT.confirmManualSaleCorrection = async function(e,id) {
  e.preventDefault();
  const form=e.target, submit=form.querySelector('button[type="submit"]');
  const reason=String(new FormData(form).get('reason')||'').trim();
  try{
    if(submit){submit.disabled=true;submit.textContent='Memproses…';}
    await runStockSalesMutation(() => voidProductSale(id,reason), {
      onSuccess:()=>{ closeModal(); render(); window.FT.openManualSaleModal(id); },
    });
  } finally { if(submit?.isConnected){submit.disabled=false;submit.textContent='Void & Buat Replacement';} }
};

// ===== Stocks Page (Manager) =====
function renderStocks() {
  const productMap = Object.fromEntries(getProducts().map(p => [p.id, p]));
  const outletMap = Object.fromEntries(getOutlets().map(o => [o.id, o]));
  const stocks = getStocks().filter(s => productMap[s.productId] && outletMap[s.outletId]);
  const stockTotals = stockSummary(stocks);
  const lowStocks = stocks.filter(s => Number(s.quantity||0) <= Number(s.minStock||0));
  const projectRows = stockProjectRows();

  return `
    <div class="grid-3" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Saldo stok</div><div class="stat-value">${stockTotals.total}</div></div>
      <div class="stat-card"><div class="stat-label">Stok menipis</div><div class="stat-value">${stockTotals.low}</div></div>
      <div class="stat-card"><div class="stat-label">Stok habis</div><div class="stat-value">${stockTotals.empty}</div></div>
    </div>
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
        <select class="select" id="stockProjectFilter" style="width:190px;" data-pqt-onchange="FT.filterStocks()">
          <option value="">Semua Project</option>
          ${projectRows.map(p=>`<option value="${p.id}">${esc(p.name||p.code||p.id)}</option>`).join('')}
        </select>
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
        <button class="btn btn-primary" data-pqt-onclick="FT.openStockModal()">+ Stock Movement</button>
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
                <tr data-project="${esc(s.projectId||'')}" data-outlet="${esc(s.outletId||'')}" data-status="${isLow?'low':'ok'}">
                  <td>${outletIcon(o.type)} ${esc(o.name)}</td>
                  <td><span style="font-weight:600;">${esc(p.name)}</span><br><span style="font-size:11px; color:var(--gray-400);">${esc(p.sku||'-')}</span></td>
                  <td style="font-weight:700; color:${isLow?'var(--red-500)':'var(--gray-800)'};">${s.quantity} ${p.unit}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px; color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewStockHistory('${s.id}')">Riwayat</button>
                    <button class="btn btn-secondary btn-sm" style="margin-left:4px" data-pqt-onclick="FT.editStock('${s.id}')">Adjustment</button>
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
  const filters=stockFilterSnapshot(key=>({
    search:document.getElementById('stockSearch')?.value,
    projectId:document.getElementById('stockProjectFilter')?.value,
    outletId:document.getElementById('stockOutletFilter')?.value,
    status:document.getElementById('stockStatusFilter')?.value,
  })[key]||'');
  document.querySelectorAll('#stockTable tbody tr[data-outlet]').forEach(row => {
    const show=stockMatchesFilters({
      search:row.textContent||'', projectId:row.dataset.project||'', outletId:row.dataset.outlet||'', status:row.dataset.status||'',
    },filters);
    row.style.display = show ? '' : 'none';
  });
};

window.FT.viewStockHistory = function(id) {
  const stock=getStocks().find(row=>row.id===id);
  if(!stock)return;
  const product=getProducts().find(row=>row.id===stock.productId);
  const outlet=getOutlets().find(row=>row.id===stock.outletId);
  const cycles=getInventoryCycles()
    .filter(row=>String(row.projectId||'')===String(stock.projectId||'') && row.outletId===stock.outletId && row.productId===stock.productId)
    .sort((a,b)=>String(b.cycleDate||'').localeCompare(String(a.cycleDate||'')) || String(b.finalizedAt||'').localeCompare(String(a.finalizedAt||'')));
  openModal('Riwayat Stok', `
    <div style="margin-bottom:12px"><strong>${esc(outlet?.name||stock.outletId||'-')} → ${esc(product?.name||stock.productId||'-')}</strong><div class="am-muted">Saldo saat ini: ${Number(stock.quantity||0)} ${esc(product?.unit||'')}</div></div>
    <div class="visits-table-wrapper"><table class="table">
      <thead><tr><th>Tanggal</th><th>Opening</th><th>Stock In</th><th>Adjustment</th><th>Closing</th><th>Sell-out</th><th>Status</th></tr></thead>
      <tbody>${cycles.length ? cycles.map(row=>`<tr>
        <td>${formatDateShort(row.cycleDate)}${row.correctionOfCycleId ? '<br><span class="am-muted">Correction</span>' : ''}</td><td>${Number(row.openingQty||0)}</td><td>${Number(row.stockInQty||0)}</td>
        <td>${Number(row.adjustmentQty||0)}</td><td>${Number(row.closingQty||0)}</td><td>${Number(row.sellOutQty||0)}</td><td>${statusBadge(row.status||'draft')}</td>
      </tr>`).join('') : '<tr><td colspan="7"><div class="empty-state"><p>Belum ada riwayat Inventory Cycle.</p></div></td></tr>'}</tbody>
    </table></div>
    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Tutup</button></div>
  `);
};

window.FT.openStockModal = function() {
  const projectRows = stockProjectRows();
  openModal('Catat Stock In', `
    <form data-pqt-onsubmit="FT.createStock(event)">
      <div class="form-group"><label class="label">Project</label><select class="select" name="projectId" required><option value="">Pilih project</option>${projectRows.map(row=>`<option value="${row.id}">${esc(row.name||row.code||row.id)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Pencatat</label><select class="select" name="employeeId" required><option value="">Pilih employee</option>${getEmployees().filter(row=>row.status==='active'||row.employmentStatus==='active').map(row=>`<option value="${row.id}" ${myEmployeeId()===row.id?'selected':''}>${esc(row.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Outlet</label><select class="select" name="outletId" required><option value="">Pilih outlet</option>${getOutlets().map(o=>`<option value="${o.id}">${esc(formatOutletLabel(o))}</option>`).join('')}</select></div>
      <div class="form-group"><label class="label">Produk</label><select class="select" name="productId" required><option value="">Pilih produk</option>${getProducts().filter(p=>p.status==='active').map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku||'-')})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Stock masuk</label><input class="input" type="number" name="stockInQty" min="0" step="1" required></div>
        <div class="form-group"><label class="label">Closing stock</label><input class="input" type="number" name="closingQty" min="0" step="1" required></div>
      </div>
      <div class="form-group"><label class="label">Minimum stock</label><input class="input" type="number" name="minStock" value="5" min="0" step="1" required></div>
      <div class="am-muted" style="margin-top:-4px">Stok awal diambil otomatis dari saldo terbaru. Penjualan dihitung dari selisih pergerakan stok.</div>
      <div class="modal-footer" style="padding:0; margin-top:14px;">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Finalisasi</button>
      </div>
    </form>
  `);
};

window.FT.createStock = async function(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  const employeeId = String(data.employeeId || myEmployeeId() || '');
  const projectId = String(data.projectId || '');
  const current = getStocks().find(row => row.outletId === data.outletId && row.productId === data.productId && row.projectId === projectId);
  if (!employeeId) { showToast('Akun ini belum terhubung ke employee untuk mencatat stock movement.', 'error'); return; }
  if (!projectId || !stockCommonProjectIds(data.outletId,data.productId).includes(projectId)) { showToast('Project tidak sesuai dengan relasi outlet dan produk.', 'error'); return; }
  const existingCycle = findInventoryCycleOnDate(getInventoryCycles(),projectId,data.outletId,data.productId,todayISO());
  if (existingCycle) { showToast('Cycle stok hari ini untuk outlet/produk tersebut sudah ada. Tidak dibuat duplikat.', 'error'); return; }
  const openingQty = Number(current?.quantity || 0);
  const validation=validateStockMovementInput({ openingQty, stockInQty:data.stockInQty, closingQty:data.closingQty, minStock:data.minStock });
  if (!validation.ok) {
    showToast(validation.error==='STOCK_CLOSING_EXCEEDS_AVAILABLE'
      ? `Closing stock (${data.closingQty}) tidak boleh melebihi stok tersedia (${validation.available}).`
      : 'Nilai stok tidak valid.', 'error'); return;
  }
  const { stockInQty, closingQty, minStock }=validation;
  try {
    if (submit) { submit.disabled=true; submit.textContent='Finalisasi…'; }
    await runStockSalesMutation(() => createInventoryCycle({
      projectId, outletId:data.outletId, productId:data.productId, employeeId,
      cycleDate:todayISO(), status:'finalized', openingQty, stockInQty, adjustmentQty:0,
      returnQty:0, damagedQty:0, transferOutQty:0, closingQty, minStock,
      idempotencyKey:`stock-in:${projectId}:${data.outletId}:${data.productId}:${todayISO()}:${Date.now()}`,
    }), {
      successMessage:'Stock movement berhasil difinalisasi.',
      onSuccess:()=>{ closeModal(); render(); },
    });
  } finally {
    if (submit?.isConnected) { submit.disabled=false; submit.textContent='Finalisasi'; }
  }
};

window.FT.editStock = function(id) {
  const s = getStocks().find(x => x.id === id);
  if (!s) return;
  const pMap = Object.fromEntries(getProducts().map(p=>[p.id,p]));
  const oMap = Object.fromEntries(getOutlets().map(o=>[o.id,o]));
  const recorderRows=getEmployees().filter(row=>row.status==='active'||row.employmentStatus==='active');
  const sourceCycle=getInventoryCycles()
    .filter(row=>String(row.projectId||'')===String(s.projectId||'') && row.outletId===s.outletId && row.productId===s.productId && row.status==='finalized')
    .sort((a,b)=>String(b.finalizedAt||b.cycleDate||'').localeCompare(String(a.finalizedAt||a.cycleDate||'')))[0] || null;
  openModal('Stock Adjustment', `
    <form data-pqt-onsubmit="FT.updateStock(event,'${id}',${jsArg(sourceCycle?.id||'')})">
      <div class="form-group"><label class="label">Outlet / Produk</label><div style="padding:10px 12px;background:var(--gray-50);border-radius:10px;font-size:14px">${esc(oMap[s.outletId]?.name||'-')} → ${esc(pMap[s.productId]?.name||'-')}</div></div>
      <div class="form-group"><label class="label">Pencatat</label><select class="select" name="employeeId" required><option value="">Pilih employee</option>${recorderRows.map(row=>`<option value="${row.id}" ${(myEmployeeId()||s.updatedBy)===row.id?'selected':''}>${esc(row.name)}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="label">Opening stock</label><input class="input" value="${s.quantity}" disabled></div>
        <div class="form-group"><label class="label">Closing stock hasil koreksi</label><input class="input" type="number" name="closingQty" value="${s.quantity}" min="0" step="1" required></div>
      </div>
      <div class="form-group"><label class="label">Minimum stock</label><input class="input" type="number" name="minStock" value="${s.minStock}" min="0" step="1" required></div>
      <div class="form-group"><label class="label">Alasan adjustment</label><textarea class="textarea" name="adjustmentReason" minlength="10" required placeholder="Jelaskan penyebab koreksi stok..."></textarea></div>
      ${sourceCycle ? `<div class="am-muted">Koreksi akan mengikuti transaksi stok sebelumnya dan memperbarui penjualan otomatis tanpa menghapus riwayat.</div>` : '<div class="am-muted">Belum ada transaksi stok final sebelumnya; perubahan akan dicatat sebagai transaksi baru.</div>'}
      <div class="modal-footer" style="padding:0;margin-top:8px">
        <button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button>
        <button type="submit" class="btn btn-primary">Finalisasi Adjustment</button>
      </div>
    </form>
  `);
};

window.FT.updateStock = async function(e, id, correctionOfCycleId = '') {
  e.preventDefault();
  const stock = getStocks().find(row => row.id === id);
  if (!stock) return;
  const form=e.target, submit=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form));
  const employeeId=String(data.employeeId || myEmployeeId() || '');
  const closingQty=Number(data.closingQty), openingQty=Number(stock.quantity), minStock=Number(data.minStock);
  const adjustmentQty=closingQty-openingQty;
  if (!employeeId) { showToast('Employee pencatat stok tidak tersedia.', 'error'); return; }
  if (!Number.isFinite(closingQty) || closingQty < 0 || !Number.isFinite(minStock) || minStock < 0) { showToast('Nilai stok tidak valid.', 'error'); return; }
  if (adjustmentQty === 0 && minStock === Number(stock.minStock)) { showToast('Tidak ada perubahan stok.'); return; }
  try {
    if(submit){submit.disabled=true;submit.textContent='Finalisasi…';}
    await runStockSalesMutation(() => createInventoryCycle({
      projectId:stock.projectId, outletId:stock.outletId, productId:stock.productId, employeeId,
      cycleDate:todayISO(), status:'finalized', openingQty, stockInQty:0, adjustmentQty,
      adjustmentReason:data.adjustmentReason, correctionOfCycleId:correctionOfCycleId || null,
      returnQty:0, damagedQty:0, transferOutQty:0, closingQty, minStock,
      idempotencyKey:`stock-adjustment:${stock.id}:${correctionOfCycleId||'base'}:${todayISO()}:${Date.now()}`,
    }), {
      successMessage:'Adjustment stok berhasil difinalisasi.',
      onSuccess:()=>{ closeModal(); render(); },
    });
  } finally {
    if(submit?.isConnected){submit.disabled=false;submit.textContent='Finalisasi Adjustment';}
  }
};

window.FT.deleteStock = function() {
  showToast('Stok tidak dihapus langsung. Gunakan Stock Adjustment agar audit trail tetap utuh.', 'error');
};

// ===== Attendance Manager Page =====
function renderAttendanceManager() {
  if (!attendanceLeaveChunk) {
    loadAttendanceLeaveChunk().catch(() => {});
    return routeChunkLoading('attendance');
  }
  return attendanceLeaveChunk.renderAttendanceManager();
}

window.FT.viewAttendance = function(id) {
  const row = getAttendance().find(item => String(item.id) === String(id));
  if (!row) return;
  const emp = getEmployees().find(item => String(item.id) === String(row.employeeId));
  const project = (getDB().projects || []).find(item => String(item.id) === String(row.projectId));
  const source = attendanceSourceKey(row) === 'visit' ? 'Otomatis dari Visit' : 'Manual';
  const correctedBy = getAccounts().find(acc => String(acc.id) === String(row.correctedBy));
  openModal('Detail Attendance', `
    <div class="ops-detail-grid">
      <div><span>Karyawan</span><strong>${esc(emp?.name || row.employeeId || '-')}</strong></div>
      <div><span>Project</span><strong>${esc(project?.code || row.projectId || '-')}</strong><small>${esc(project?.name || '')}</small></div>
      <div><span>Tanggal</span><strong>${formatDate(row.date || row.workDate)}</strong></div>
      <div><span>Status</span><strong>${statusBadge(row.status)}</strong></div>
      <div><span>Check In</span><strong>${esc(row.checkInTime || row.checkInAt || '—')}</strong></div>
      <div><span>Check Out</span><strong>${esc(row.checkOutTime || row.checkOutAt || '—')}</strong></div>
      <div><span>Source</span><strong>${esc(source)}</strong></div>
      <div><span>Koreksi</span><strong>${Number(row.correctionCount || 0)}x</strong></div>
    </div>
    ${row.correctionReason ? `<div class="ops-audit-box"><strong>Audit koreksi terakhir</strong><p>${esc(row.correctionReason)}</p><small>${esc(correctedBy?.name || correctedBy?.email || row.correctedBy || '-')} · ${esc(row.correctedAt || '-')}</small></div>` : ''}
    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Tutup</button>${attendanceSourceKey(row) === 'visit' ? '' : `<button type="button" class="btn btn-primary" data-pqt-onclick="FT.closeModal();FT.openAttendanceCorrection('${row.id}')">Koreksi</button>`}</div>`);
};

window.FT.openAttendanceCorrection = function(id) {
  const row = getAttendance().find(item => String(item.id) === String(id));
  if (!row) return;
  if (attendanceSourceKey(row) === 'visit') {
    showToast('Attendance dari Visit harus dikoreksi melalui workflow Visit.', 'error');
    return;
  }
  const normalized = normalizeAttendanceStatus(row.status);
  const selected = normalized === 'terlambat' ? 'late' : normalized === 'tidak hadir' ? 'absent' : 'present';
  const timeValue = attendanceTimeValue;
  openModal('Koreksi Attendance', `
    <form data-pqt-onsubmit="FT.saveAttendanceCorrection(event,'${id}')">
      <div class="form-group"><label class="label">Status</label>
        <select class="select" name="status">
          <option value="present" ${selected === 'present' ? 'selected' : ''}>Hadir</option>
          <option value="late" ${selected === 'late' ? 'selected' : ''}>Terlambat</option>
          <option value="absent" ${selected === 'absent' ? 'selected' : ''}>Tidak Hadir</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Check In</label><input class="input" type="time" name="checkInAt" value="${esc(timeValue(row.checkInAt || row.checkInTime))}"></div>
        <div class="form-group"><label class="label">Check Out</label><input class="input" type="time" name="checkOutAt" value="${esc(timeValue(row.checkOutAt || row.checkOutTime))}"></div>
      </div>
      <div class="form-group"><label class="label">Alasan koreksi</label><textarea class="textarea" name="correctionReason" minlength="10" required placeholder="Minimal 10 karakter untuk audit trail"></textarea></div>
      <div class="ops-inline-note">Identitas karyawan, project, tanggal, dan source tidak dapat diubah.</div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button class="btn btn-primary" type="submit">Simpan Koreksi</button></div>
    </form>`);
};

window.FT.saveAttendanceCorrection = async function(e,id) {
  e.preventDefault();
  const form=e.target, submit=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form));
  let cloudCommitted=false;
  try {
    if(submit){submit.disabled=true;submit.textContent='Menyimpan…';}
    correctAttendance(id,{
      status:data.status,
      checkInAt:data.checkInAt,
      checkInTime:data.checkInAt,
      checkOutAt:data.checkOutAt,
      checkOutTime:data.checkOutAt,
      correctionReason:data.correctionReason,
    });
    await waitForOperationalSync();
    cloudCommitted=true;
    await refreshOperationalData(getDB(),getActor());
    closeModal();
    showToast('Koreksi attendance tersimpan dengan audit trail.','success');
    render();
  } catch(error) {
    if(!cloudCommitted) restoreOperationalBaseline(getDB());
    const message=attendanceLeaveFriendlyErrorMessage(error,'Koreksi attendance gagal disimpan.');
    showToast(message,'error');
    await refreshOperationalData(getDB(),getActor()).catch(()=>null);
    render();
  } finally {
    if(submit?.isConnected){submit.disabled=false;submit.textContent='Simpan Koreksi';}
  }
};

window.FT.openAttendancePointModal = function() {
  openModal('Titik absensi', `
    <form data-pqt-onsubmit="FS.addAttendancePoint(event)">
      <div class="form-group"><label class="label">Nama</label><input class="input" name="name" required placeholder="Kantor pusat / Meeting point Senayan"></div>
      <div class="form-group"><label class="label">Jenis</label>
        <select class="select" name="type"><option value="office">Kantor</option><option value="meeting">Meeting point</option><option value="store">Toko</option></select>
      </div>
      <div class="form-group"><label class="label">Alamat</label><input class="input" name="address"></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
    </form>`);
};

window.FT.filterAttendance = function() {
  const filters = attendanceFilterSnapshot(key => ({
    search:document.getElementById('attSearch')?.value,
    projectId:document.getElementById('attProjectFilter')?.value,
    status:document.getElementById('attStatusFilter')?.value,
    source:document.getElementById('attSourceFilter')?.value,
    from:document.getElementById('attDateFrom')?.value,
    to:document.getElementById('attDateTo')?.value,
  })[key]);
  let visible = 0;
  document.querySelectorAll('#attTable tbody tr[data-att-row="1"]').forEach(row => {
    const show = attendanceMatchesFilters({
      text:row.textContent,
      projectId:row.dataset.project,
      status:row.dataset.status,
      source:row.dataset.source,
      date:row.dataset.date,
    },filters);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const count = document.getElementById('attResultCount');
  if (count) count.textContent = `${visible} record`;
  const empty = document.getElementById('attFilteredEmpty');
  if (empty) empty.hidden = visible !== 0;
};

window.FT.resetAttendanceFilters = function() {
  for (const id of ['attSearch','attProjectFilter','attStatusFilter','attSourceFilter','attDateFrom','attDateTo']) {
    const node = document.getElementById(id);
    if (node) node.value = '';
  }
  FT.filterAttendance();
};


// ===== Leaves Manager Page =====
function leaveStatusHtml(row) {
  if (leaveDisplayStatus(row) === 'withdrawn') return '<span class="status-badge ops-withdrawn-badge">Dibatalkan</span>';
  return statusBadge(row?.status);
}

function renderLeavesManager() {
  if (!attendanceLeaveChunk) {
    loadAttendanceLeaveChunk().catch(() => {});
    return routeChunkLoading('leave');
  }
  return attendanceLeaveChunk.renderLeavesManager();
}

window.FT.filterLeaves = function() {
  const filters = leaveFilterSnapshot(key => ({
    search:document.getElementById('leaveSearch')?.value,
    status:document.getElementById('leaveStatusFilter')?.value,
    type:document.getElementById('leaveTypeFilter')?.value,
    from:document.getElementById('leaveDateFrom')?.value,
    to:document.getElementById('leaveDateTo')?.value,
  })[key]);
  let visible = 0;
  document.querySelectorAll('#leaveTable tbody tr[data-leave-row="1"]').forEach(row => {
    const show = leaveMatchesFilters({
      text:row.textContent,
      status:row.dataset.status,
      type:row.dataset.type,
      start:row.dataset.start,
      end:row.dataset.end,
    },filters);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const count = document.getElementById('leaveResultCount');
  if (count) count.textContent = `${visible} pengajuan`;
  const empty = document.getElementById('leaveFilteredEmpty');
  if (empty) empty.hidden = visible !== 0;
};

window.FT.resetLeaveFilters = function() {
  for (const id of ['leaveSearch','leaveStatusFilter','leaveTypeFilter','leaveDateFrom','leaveDateTo']) {
    const node = document.getElementById(id);
    if (node) node.value = '';
  }
  FT.filterLeaves();
};


const leaveDecisionInFlight = new Set();
const leaveWithdrawalInFlight = new Set();

window.FT.openLeaveDecision = function(id,status) {
  const leave=getLeaves().find(row=>String(row.id)===String(id));
  if(!leave || leave.status!=='pending') return;
  const rejected=status==='rejected';
  const emp = getEmployees().find(row => String(row.id) === String(leave.employeeId));
  openModal(rejected?'Tolak Pengajuan':'Setujui Pengajuan',`
    <div class="ops-decision-summary">
      <strong>${esc(emp?.name || leave.employeeId || '-')}</strong>
      <span>${esc(leave.type || '-')} · ${formatDateShort(leave.startDate)} – ${formatDateShort(leave.endDate)} · ${leave.days || 0} hari</span>
      <p>${esc(leave.reason || '-')}</p>
    </div>
    <form data-pqt-onsubmit="FT.submitLeaveDecision(event,'${id}','${status}')">
      <div class="form-group"><label class="label">${rejected?'Alasan penolakan':'Catatan keputusan (opsional)'}</label>
        <textarea class="textarea" name="decisionNote" ${rejected?'required minlength="5"':''} placeholder="${rejected?'Minimal 5 karakter':'Catatan untuk audit trail'}"></textarea>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn ${rejected?'btn-danger':'btn-primary'}">${rejected?'Tolak':'Setujui'}</button></div>
    </form>`);
};

window.FT.submitLeaveDecision = async function(e,id,status) {
  e.preventDefault();
  const key = String(id || '');
  if (!key || leaveDecisionInFlight.has(key)) return;
  leaveDecisionInFlight.add(key);
  const form=e.target, submit=form.querySelector('button[type="submit"]');
  const decisionNote=String(new FormData(form).get('decisionNote')||'');
  let cloudCommitted=false;
  try {
    if(submit){submit.disabled=true;submit.textContent='Menyimpan…';}
    updateLeave(id,{status,decisionNote});
    await waitForOperationalSync();
    cloudCommitted=true;
    await refreshOperationalData(getDB(),getActor());
    closeModal();
    showToast(status==='approved'?'Pengajuan disetujui.':'Pengajuan ditolak.','success');
    render();
  } catch(error) {
    if(!cloudCommitted) restoreOperationalBaseline(getDB());
    const message=attendanceLeaveFriendlyErrorMessage(error,'Keputusan ijin/cuti gagal disimpan.');
    showToast(message,'error');
    await refreshOperationalData(getDB(),getActor()).catch(()=>null);
    render();
  } finally {
    leaveDecisionInFlight.delete(key);
    if(submit?.isConnected){submit.disabled=false;submit.textContent=status==='approved'?'Setujui':'Tolak';}
  }
};

window.FT.openWithdrawMyLeave = function(id) {
  const leave=getLeaves().find(row=>String(row.id)===String(id));
  if(!leave || leave.status!=='pending') return;
  openModal('Batalkan Pengajuan', `
    <div class="ops-decision-summary"><strong>${esc(leave.type || '-')}</strong><span>${formatDateShort(leave.startDate)} – ${formatDateShort(leave.endDate)}</span><p>Riwayat tetap disimpan untuk audit dan tidak dapat dihapus.</p></div>
    <form data-pqt-onsubmit="FT.submitWithdrawMyLeave(event,'${id}')">
      <div class="form-group"><label class="label">Catatan pembatalan (opsional)</label><textarea class="textarea" name="note" placeholder="Contoh: jadwal berubah"></textarea></div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Kembali</button><button type="submit" class="btn btn-danger">Batalkan Pengajuan</button></div>
    </form>`);
};

window.FT.submitWithdrawMyLeave = async function(e,id) {
  e.preventDefault();
  const note = String(new FormData(e.target).get('note') || '').trim();
  return FT.withdrawMyLeave(id, note);
};

window.FT.withdrawMyLeave = async function(id, note = '') {
  const key=String(id||'');
  const leave=getLeaves().find(row=>String(row.id)===key);
  if(!leave || leave.status!=='pending' || leaveWithdrawalInFlight.has(key)) return;
  leaveWithdrawalInFlight.add(key);
  let cloudCommitted=false;
  try {
    withdrawLeave(id,note || 'Dibatalkan oleh pengaju');
    await waitForOperationalSync();
    cloudCommitted=true;
    await refreshOperationalData(getDB(),getActor());
    closeModal();
    showToast('Pengajuan dibatalkan.','success');
    render();
  } catch(error) {
    if(!cloudCommitted) restoreOperationalBaseline(getDB());
    showToast(attendanceLeaveFriendlyErrorMessage(error,'Pengajuan gagal dibatalkan.'),'error');
    await refreshOperationalData(getDB(),getActor()).catch(()=>null);
    render();
  } finally {
    leaveWithdrawalInFlight.delete(key);
  }
};

window.FT.viewLeave = function(id) {
  const l = getLeaves().find(x => x.id === id);
  if (!l) return;
  const emp = getEmployees().find(e => e.id === l.employeeId);
  const accMap = Object.fromEntries(getAccounts().map(a => [a.id, a.name || a.email]));
  openModal('Detail Pengajuan', `
    <div class="detail-grid">
      <div class="detail-label">Karyawan</div><div class="detail-value">${esc(emp?.name || '-')}</div>
      <div class="detail-label">Tipe</div><div class="detail-value">${esc(l.type || '-')}</div>
      <div class="detail-label">Periode</div><div class="detail-value">${formatDate(l.startDate)} – ${formatDate(l.endDate)}</div>
      <div class="detail-label">Durasi</div><div class="detail-value">${l.days} hari</div>
      <div class="detail-label">Alasan</div><div class="detail-value full">${esc(l.reason || '-')}</div>
      <div class="detail-label">Status</div><div class="detail-value">${leaveStatusHtml(l)}</div>
      <div class="detail-label">Diajukan</div><div class="detail-value">${formatDateShort(l.submittedAt)}</div>
      <div class="detail-label">Approver</div><div class="detail-value">${esc(accMap[l.approverId] || (l.decisionKind === 'withdrawn' ? 'Pengaju' : '-'))}</div>
      <div class="detail-label">Catatan keputusan</div><div class="detail-value full">${esc(l.decisionNote || '-')}</div>
    </div>
    <div class="modal-footer ops-modal-footer-spaced"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Tutup</button></div>`);
};

// ===== My Attendance (Employee) =====
function renderMyAttendance() {
  const empId = myEmployeeId();
  const emp = getEmployees().find(e => e.id === empId);
  const records = getAttendance().filter(a => a.employeeId === empId).sort((a,b) => String(b.date || b.workDate || '').localeCompare(String(a.date || a.workDate || '')));
  const projectMap = Object.fromEntries((getDB().projects || []).map(project => [String(project.id),project]));
  const summary = {
    hadir: records.filter(r => normalizeAttendanceStatus(r.status) === 'hadir').length,
    terlambat: records.filter(r => normalizeAttendanceStatus(r.status) === 'terlambat').length,
    tidakHadir: records.filter(r => normalizeAttendanceStatus(r.status) === 'tidak hadir').length,
  };
  return `
    <div class="grid-3 ops-summary-grid">
      <div class="stat-card"><div class="stat-icon ops-icon-success">✅</div><div class="stat-label">Hadir</div><div class="stat-value">${summary.hadir}</div></div>
      <div class="stat-card"><div class="stat-icon ops-icon-warning">⏰</div><div class="stat-label">Terlambat</div><div class="stat-value">${summary.terlambat}</div></div>
      <div class="stat-card"><div class="stat-icon ops-icon-danger">❌</div><div class="stat-label">Tidak Hadir</div><div class="stat-value">${summary.tidakHadir}</div></div>
    </div>
    <div class="card">
      <div class="card-title">Riwayat Absensi</div>
      <div class="card-subtitle">${emp ? emp.name : ''} — ${records.length} catatan</div>
      <div class="visits-table-wrapper">
        <table class="table">
          <thead><tr><th>Tanggal</th><th>Project</th><th>Check In</th><th>Check Out</th><th>Source</th><th>Status</th></tr></thead>
          <tbody>
            ${records.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">✅</div><h3>Belum ada riwayat absensi</h3></div></td></tr>` :
            records.map(a => `
              <tr>
                <td>${formatDateShort(a.date || a.workDate)}</td>
                <td><strong>${esc(projectMap[String(a.projectId)]?.code || a.projectId || '-')}</strong><div class="am-muted">${esc(projectMap[String(a.projectId)]?.name || '')}</div></td>
                <td>${esc(a.checkInTime || a.checkInAt || '—')}</td>
                <td>${esc(a.checkOutTime || a.checkOutAt || '—')}</td>
                <td>${esc(attendanceSourceLabel(a))}</td>
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
    <div class="grid-3 ops-summary-grid">
      <div class="stat-card"><div class="stat-icon ops-icon-warning">⏳</div><div class="stat-label">Menunggu</div><div class="stat-value">${pending}</div></div>
      <div class="stat-card"><div class="stat-icon ops-icon-success">✅</div><div class="stat-label">Disetujui</div><div class="stat-value">${approved}</div></div>
      <div class="stat-card"><div class="stat-icon ops-icon-info">📄</div><div class="stat-label">Total Pengajuan</div><div class="stat-value">${leaves.length}</div></div>
    </div>
    <div class="card">
      <div class="filter-row">
        <div class="card-title ops-card-title-reset">Pengajuan Ijin & Cuti Saya</div>
        <div class="spacer"></div>
        <button type="button" class="btn btn-primary" data-pqt-onclick="FT.openMyLeaveModal()">+ Ajukan Ijin/Cuti</button>
      </div>
      <div class="visits-table-wrapper ops-table-spaced">
        <table class="table">
          <thead><tr><th>Tipe</th><th>Mulai</th><th>Sampai</th><th>Hari</th><th>Alasan</th><th>Status</th><th>Diajukan</th><th></th></tr></thead>
          <tbody>
            ${leaves.length === 0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📄</div><h3>Belum ada pengajuan</h3><p>Klik "Ajukan Ijin/Cuti" untuk membuat baru</p></div></td></tr>` :
            leaves.map(l => `
              <tr>
                <td><span class="ops-chip">${esc(l.type || '-')}</span></td>
                <td>${formatDateShort(l.startDate)}</td>
                <td>${formatDateShort(l.endDate)}</td>
                <td class="ops-days-cell">${l.days}</td>
                <td class="ops-reason-cell">${esc(l.reason || '-')}</td>
                <td>${leaveStatusHtml(l)}</td>
                <td class="ops-muted-cell">${formatDateShort(l.submittedAt)}</td>
                <td><div class="ops-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="FT.viewLeave('${l.id}')">Detail</button>
                  ${canEditPendingLeave(l,todayISO()) ? `<button type="button" class="btn btn-secondary btn-sm" data-pqt-onclick="FT.openEditMyLeave('${l.id}')">Edit</button>` : ''}
                  ${l.status === 'pending' ? `<button type="button" class="btn btn-danger btn-sm" data-pqt-onclick="FT.openWithdrawMyLeave('${l.id}')">Batalkan</button>` : ''}
                </div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

const leaveEditInFlight = new Set();

window.FT.openEditMyLeave = function(id) {
  const leave = getLeaves().find(row => String(row.id) === String(id));
  if (!leave || leave.status !== 'pending') return;
  if (!canEditPendingLeave(leave,todayISO())) {
    showToast('Pengajuan yang sudah mulai tidak dapat diedit.', 'error');
    return;
  }
  const leaveTypes = getLeaveTypes();
  openModal('Edit Pengajuan Ijin / Cuti', `
    <form data-pqt-onsubmit="FT.saveMyLeaveEdit(event,'${id}')">
      <div class="form-group"><label class="label">Tipe</label>
        <select class="select" name="type" required>${leaveTypes.map(t => `<option ${String(t.name) === String(leave.type) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="label">Tanggal Mulai</label><input class="input" type="date" name="startDate" id="leaveEditStart" value="${esc(leave.startDate || '')}" required data-pqt-onchange="FT.calcLeaveEditDays()"></div>
        <div class="form-group"><label class="label">Tanggal Selesai</label><input class="input" type="date" name="endDate" id="leaveEditEnd" value="${esc(leave.endDate || '')}" required data-pqt-onchange="FT.calcLeaveEditDays()"></div>
      </div>
      <div class="form-group"><label class="label">Durasi (hari)</label><input class="input" type="number" id="leaveEditDays" value="${Number(leave.days || 1)}" readonly></div>
      <div class="form-group"><label class="label">Alasan</label><textarea class="textarea" name="reason" minlength="5" required>${esc(leave.reason || '')}</textarea></div>
      <div class="ops-inline-note">Edit hanya tersedia selama pengajuan masih pending dan periodenya belum dimulai.</div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-pqt-onclick="FT.closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan Perubahan</button></div>
    </form>`);
};

window.FT.calcLeaveEditDays = function() {
  const start = document.getElementById('leaveEditStart')?.value || '';
  const end = document.getElementById('leaveEditEnd')?.value || '';
  const output = document.getElementById('leaveEditDays');
  if (!output || !start || !end) return;
  const diff = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
  output.value = diff > 0 ? diff : 1;
};

window.FT.saveMyLeaveEdit = async function(e,id) {
  e.preventDefault();
  const key = String(id || '');
  if (!key || leaveEditInFlight.has(key)) return;
  leaveEditInFlight.add(key);
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  let cloudCommitted = false;
  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Menyimpan…'; }
    updateLeave(id, { type:data.type, startDate:data.startDate, endDate:data.endDate, reason:data.reason, status:'pending' });
    await waitForOperationalSync();
    cloudCommitted = true;
    await refreshOperationalData(getDB(), getActor());
    closeModal();
    showToast('Pengajuan diperbarui.', 'success');
    render();
  } catch (error) {
    if (!cloudCommitted) restoreOperationalBaseline(getDB());
    const message = attendanceLeaveFriendlyErrorMessage(error,'Pengajuan gagal diperbarui.');
    showToast(message, 'error');
    await refreshOperationalData(getDB(), getActor()).catch(() => null);
    render();
  } finally {
    leaveEditInFlight.delete(key);
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = 'Simpan Perubahan'; }
  }
};

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
        <textarea class="textarea" name="reason" minlength="5" placeholder="Jelaskan alasan pengajuan..." required></textarea>
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

window.FT.createMyLeave = async function(e) {
  e.preventDefault();
  const form = e.target;
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form));
  data.employeeId = myEmployeeId();
  let cloudCommitted = false;
  try {
    if (submit) { submit.disabled = true; submit.textContent = 'Mengirim…'; }
    createLeave(data);
    if (submit) submit.textContent = 'Sinkronisasi…';
    await waitForOperationalSync();
    cloudCommitted = true;
    await refreshOperationalData(getDB(), getActor());
    closeModal();
    showToast('Pengajuan terkirim, menunggu approval.', 'success');
    render();
  } catch (error) {
    if (!cloudCommitted) restoreOperationalBaseline(getDB());
    const message = attendanceLeaveFriendlyErrorMessage(error,'Pengajuan ijin/cuti gagal dikirim.');
    showToast(message, 'error');
    await refreshOperationalData(getDB(), getActor()).catch(() => null);
    render();
  } finally {
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = 'Kirim Pengajuan'; }
  }
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
                  <td><span style="font-weight:600;">${esc(p.name)}</span><br><span style="font-size:11px;color:var(--gray-400);">${esc(p.sku||'-')}</span></td>
                  ${teamView ? `<td>${esc(salesName)}</td>` : ''}
                  <td style="font-weight:700;color:${isLow?'var(--red-500)':'var(--gray-800)'};">${Number(s.quantity||0)} ${esc(p.unit||'')}</td>
                  <td style="color:var(--gray-400);">${s.minStock}</td>
                  <td>${isLow ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-red-100 text-red-700 border-red-200">⚠️ Menipis</span>' : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200">✓ Aman</span>'}</td>
                  <td style="font-size:12px;color:var(--gray-400);">${formatDateShort(s.lastUpdated)}</td>
                  ${teamView ? '' : '<td><span class="am-muted">Update via kunjungan aktif</span></td>'}
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
      ${productPickerRows('stock', outletId, visit?.projectId || '')}
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

window.FT.saveVisitStock = async function(e, visitId, outletId) {
  e.preventDefault();
  const actorEmpId = myEmployeeId();
  const visit = getVisits().find(row => String(row.id) === String(visitId));
  const empId = isSupervisor() ? String(visit?.employeeId || '') : String(actorEmpId || '');
  const rows = [...e.target.querySelectorAll('.fs-product-row')];
  const submit = e.target.querySelector('button[type="submit"]');
  if (!empId || !visit?.projectId || String(visit.employeeId||'') !== empId) { showToast('Konteks employee/project kunjungan tidak valid.', 'error'); return; }
  try {
    const seen = new Set();
    const entries = [];
    if (submit) { submit.disabled=true; submit.textContent='Validasi…'; }
    for (const row of rows) {
      const productId = row.querySelector('[name="productId"]')?.value;
      const closingQty = Number(row.querySelector('[name="quantity"]')?.value);
      const stockInQty = Number(row.querySelector('[name="stockInQty"]')?.value || 0);
      const minStock = Number(row.querySelector('[name="minStock"]')?.value || 0);
      if (!productId) continue;
      if (seen.has(productId)) throw new Error('Produk yang sama tidak boleh dicatat dua kali dalam satu kunjungan.');
      seen.add(productId);
      if (findInventoryCycleOnDate(getInventoryCycles(),visit.projectId,outletId,productId,todayISO())) throw new Error('Cycle stok hari ini untuk salah satu produk sudah ada. Tidak dibuat duplikat.');
      const existing = getStocksByOutlet(outletId).find(s => s.productId === productId && (!s.projectId || s.projectId === visit.projectId));
      const openingQty = Number(existing?.quantity || 0);
      const validation=validateStockMovementInput({ openingQty, stockInQty, closingQty, minStock });
      if (!validation.ok) throw new Error(validation.error==='STOCK_CLOSING_EXCEEDS_AVAILABLE'
        ? `Closing stock produk melebihi stok tersedia (${validation.available}).`
        : 'Nilai stok tidak valid.');
      entries.push({ productId, openingQty:validation.openingQty, closingQty:validation.closingQty, stockInQty:validation.stockInQty, minStock:validation.minStock });
    }
    if (!entries.length) throw new Error('Pilih minimal satu produk untuk dicatat.');
    if (submit) submit.textContent='Finalisasi…';
    await runStockSalesMutation(() => {
      const created=[];
      for (const entry of entries) {
        created.push(createInventoryCycle({
          projectId:visit.projectId, outletId, productId:entry.productId, employeeId:empId, visitId,
          cycleDate:todayISO(), status:'finalized', openingQty:entry.openingQty, stockInQty:entry.stockInQty,
          adjustmentQty:0, returnQty:0, damagedQty:0, transferOutQty:0, closingQty:entry.closingQty,
          minStock:entry.minStock,
          idempotencyKey:`visit-stock:${visitId}:${entry.productId}`,
        }));
      }
      return created;
    }, {
      successMessage:`${seen.size} produk stok difinalisasi`,
      onSuccess:()=>{ closeModal(); render(); },
    });
  } catch (error) {
    showToast(stockSalesFriendlyErrorMessage(error), 'error');
  } finally {
    if (submit?.isConnected) { submit.disabled=false; submit.textContent='Simpan Stok'; }
  }
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
      ${productPickerRows('price', outletId, visit?.projectId || '')}
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
  if (!competitorPagesChunk) {
    loadCompetitorPagesChunk().catch(() => {});
    return routeChunkLoading('master kompetitor');
  }
  return competitorPagesChunk.renderCompetitors();
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
  if (!competitorPagesChunk) {
    loadCompetitorPagesChunk().catch(() => {});
    return routeChunkLoading('analisis kompetitor');
  }
  return competitorPagesChunk.renderCompetitorAnalysis();
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
const PHOTO_PAGE_SIZE = 24;

function renderFieldPhotosGallery({ managerView }) {
  if (!fieldPhotosChunk) {
    loadFieldPhotosChunk().catch(() => {});
    return routeChunkLoading('galeri foto');
  }
  return fieldPhotosChunk.renderFieldPhotosGallery({ managerView });
}

window.FT.setPhotoFilter = function(type) {
  state._photoFilterType = type || '';
  state._photoVisibleCount = PHOTO_PAGE_SIZE;
  render();
};

window.FT.loadMorePhotos = function() {
  state._photoVisibleCount = (Number(state._photoVisibleCount) || PHOTO_PAGE_SIZE) + PHOTO_PAGE_SIZE;
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

// ===== Mobile execution actions =====
// Legacy simulator renderer was removed from the production critical bundle.
// mobileCheckIn/mobileCheckOut remain because the live field UI uses them.

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
  window.FS?.disposeOutletMap?.();
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
function closeModal() {
  window.FS?.disposeOutletMap?.();
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
}
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
  // Authenticated restore paints before local DB parsing. For normal logged-out
  // entry we still initialize immediately so login/public pages keep legacy behavior.
  if (!state.sessionRestoring) getDB();
  state.route = getRoute();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      stopRouteRefresh();
      return;
    }
    refreshActiveRoute({ reason:'visibility' }).catch(() => {});
    configureRouteRefresh(state.route);
  });
  window.addEventListener('focus', () => {
    refreshActiveRoute({ reason:'focus' }).catch(() => {});
    configureRouteRefresh(state.route);
  });
  window.addEventListener('pagehide', () => {
    stopRouteRefresh();
    disposeTrackingMap();
    window.FS?.disposeOutletMap?.();
    clearTimeout(trackingFilterTimer);
    trackingFilterTimer = null;
    if (renderFrame) {
      cancelAnimationFrame(renderFrame);
      renderFrame = 0;
    }
  }, { once:true });
  render();
}

init();
