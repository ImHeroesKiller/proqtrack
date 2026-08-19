// ProQTrack — Local Database Layer (localStorage-backed)
// Simulates SQLite with full CRUD operations

import {
  seedEmployees, seedOutlets, seedVisits, seedAttendance, seedAccounts,
  seedProducts, seedLeaveTypes, seedLeaves, seedStocks, seedPriceObservations,
  seedCompetitors, seedCompetitorProducts, seedCompetitorIntel,
  seedPromoTypes, seedFieldPhotos,
} from '../data/seed.js';
import {
  uid, sanitizePlainText, todayISO, normalizeAttendanceStatus,
  hashPassword, passwordMatches, publicAccount,
} from './utils.js';
import { defaultPortrait } from './avatars.js';

const DB_KEY = 'proqtrack_db_v6';
const LEGACY_KEYS = ['proqtrack_db_v5', 'proqtrack_db_v4', 'proqtrack_db_v3', 'proqtrack_db_v2', 'proqtrack_db_v1'];
const DB_VERSION = 15;
const ORG_KEY = 'proqtrack_current_org';
export const DEFAULT_ORG_ID = 'ORG-DEFAULT';

/**
 * Client document catalog (localStorage).
 * Canonical key is proqtrack_db_v6; proqtrack_db_v7 is an automatic mirror.
 * D1 is a Worker sidecar (auth/files/snapshots) and is not this schema.
 *
 * tenant   — rows get organizationId; scoped() hides unstamped rows
 * global   — catalogs or project-keyed rows, not org-filtered
 * document — top-level object or scalar
 */
export const SCHEMA = {
  version: DB_VERSION,
  key: DB_KEY,
  mirrorKey: 'proqtrack_db_v7',
  tenantCollections: [
    'employees', 'outlets', 'visits', 'attendance', 'accounts', 'products',
    'leaves', 'stocks', 'priceObservations', 'competitors', 'competitorProducts',
    'competitorIntel', 'fieldPhotos', 'productSales', 'clients', 'projects',
    'projectAssignments', 'outletProposals', 'attendancePoints',
    'overtimes', 'wfhRequests', 'dailyReports',
  ],
  globalCollections: [
    'leaveTypes', 'promoTypes', 'organizations', 'projectSettings',
    'projectProducts', 'reportTemplates', 'reportJobs', 'reportExports',
    'reportFilters', 'reportApprovals', 'reportSchedules', 'auditLogs',
    'newsItems', 'hrContacts',
  ],
  documentKeys: ['_version', 'appSettings', 'reportSettings', 'currentOrganizationId'],
};

const SEEDED_EMPTY_ARRAYS = [
  'productSales', 'clients', 'projects', 'projectAssignments', 'projectSettings',
  'outletProposals', 'attendancePoints', 'projectProducts',
  'reportTemplates', 'reportJobs', 'reportExports', 'reportFilters',
  'reportApprovals', 'reportSchedules', 'auditLogs',
  'overtimes', 'wfhRequests', 'dailyReports',
];

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const accountRoleForEmployee = employee =>
  String(employee?.role || '').toLowerCase().includes('supervisor') ? 'supervisor' : 'employee';

/** HR status can deactivate login, but never lift a manager suspension. */
function getActor() {
  const session = (typeof window !== 'undefined' && window.FT?.state?.account) || null;
  const id = session?.id;
  if (!id) return null;
  if (!_cache) return publicAccount(session);
  const acc = (_cache.accounts || []).find(a => a.id === id);
  if (!acc || acc.status === 'inactive' || acc.status === 'suspended') return null;
  return publicAccount(acc);
}

export { getActor };

function assertLoggedIn() {
  const actor = getActor();
  if (!actor) throw new Error('Akses ditolak');
  return actor;
}

function assertSuperadmin() {
  const actor = assertLoggedIn();
  if (actor.role !== 'superadmin') throw new Error('Akses ditolak');
  return actor;
}

export function isOrgAdminRole(role) {
  return role === 'head' || role === 'superadmin';
}

export function isProjectAdminRole(role) {
  return isOrgAdminRole(role) || role === 'manager';
}

function assertOrgAdmin() {
  const actor = assertLoggedIn();
  if (!isOrgAdminRole(actor.role)) throw new Error('Akses ditolak');
  return actor;
}

function assertProjectAdmin() {
  const actor = assertLoggedIn();
  if (!isProjectAdminRole(actor.role)) throw new Error('Akses ditolak');
  return actor;
}

function visibleEmployeeIds(actor = getActor(), db = getDB()) {
  const orgId = getCurrentOrgId();
  const inOrg = (db.employees || []).filter(e => !e.organizationId || e.organizationId === orgId);
  if (!actor || isOrgAdminRole(actor.role)) return new Set(inOrg.map(e => e.id));
  if (actor.role === 'manager') {
    const pid = actor.projectId;
    const ids = new Set(
      (db.projectAssignments || [])
        .filter(a => a.projectId === pid && a.status === 'active')
        .map(a => a.employeeId),
    );
    return new Set(inOrg.filter(e => ids.has(e.id)).map(e => e.id));
  }
  if (actor.role === 'supervisor') {
    return new Set(inOrg.filter(e => e.id === actor.employeeId || e.supervisorId === actor.employeeId).map(e => e.id));
  }
  return new Set(actor.employeeId ? [actor.employeeId] : []);
}

function canAccessEmployee(employeeId, actor = getActor()) {
  if (!actor) return false;
  if (isOrgAdminRole(actor.role)) return true;
  return visibleEmployeeIds(actor).has(employeeId);
}

function assertCanAccessEmployee(employeeId) {
  assertLoggedIn();
  if (!canAccessEmployee(employeeId)) throw new Error('Akses ditolak');
}

function applyEmployeeAccountStatus(account, employee) {
  if (!account) return;
  if (employee?.status !== 'active') {
    account.status = 'inactive';
    return;
  }
  if (account.status === 'suspended') return;
  account.status = account.status || 'active';
}

function assertUniqueEmail(db, email, employeeId = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email wajib diisi.');
  const employeeConflict = db.employees.some(e =>
    normalizeEmail(e.email) === normalized && e.id !== employeeId
  );
  const accountConflict = db.accounts.some(a =>
    normalizeEmail(a.email) === normalized && a.employeeId !== employeeId
  );
  if (employeeConflict || accountConflict) throw new Error('Email sudah digunakan oleh user lain.');
  return normalized;
}

function syncEmployeeAccount(db, employee, password) {
  let account = db.accounts.find(a => a.employeeId === employee.id);
  if (!account) {
    if (!password || String(password).length < 8) {
      throw new Error('Password login minimal 8 karakter.');
    }
    account = {
      id: uid('ACC'),
      employeeId: employee.id,
      organizationId: employee.organizationId || DEFAULT_ORG_ID,
    };
    db.accounts.push(account);
  }
  account.email = employee.email;
  account.name = employee.name;
  account.role = accountRoleForEmployee(employee);
  if (!account.organizationId && account.role !== 'superadmin') {
    account.organizationId = employee.organizationId || DEFAULT_ORG_ID;
  }
  applyEmployeeAccountStatus(account, employee);
  if (password) {
    if (String(password).length < 8) throw new Error('Password login minimal 8 karakter.');
    account.password = hashPassword(password);
  }
  return account;
}

function rawDefaultDB() {
  return {
    _version: DB_VERSION,
    employees:  JSON.parse(JSON.stringify(seedEmployees)),
    outlets:    JSON.parse(JSON.stringify(seedOutlets)),
    visits:     JSON.parse(JSON.stringify(seedVisits)),
    attendance: JSON.parse(JSON.stringify(seedAttendance)),
    accounts:   JSON.parse(JSON.stringify(seedAccounts)),
    products:   JSON.parse(JSON.stringify(seedProducts)),
    leaveTypes: JSON.parse(JSON.stringify(seedLeaveTypes)),
    leaves:     JSON.parse(JSON.stringify(seedLeaves)),
    stocks:     JSON.parse(JSON.stringify(seedStocks)),
    priceObservations: JSON.parse(JSON.stringify(seedPriceObservations)),
    competitors: JSON.parse(JSON.stringify(seedCompetitors)),
    competitorProducts: JSON.parse(JSON.stringify(seedCompetitorProducts)),
    competitorIntel: JSON.parse(JSON.stringify(seedCompetitorIntel)),
    promoTypes: JSON.parse(JSON.stringify(seedPromoTypes)),
    fieldPhotos: JSON.parse(JSON.stringify(seedFieldPhotos)),
    productSales: [],
    clients: [],
    projects: [],
    projectAssignments: [],
    projectSettings: [],
    outletProposals: [],
    attendancePoints: [],
    projectProducts: [],
    reportTemplates: [],
    reportJobs: [],
    reportExports: [],
    reportFilters: [],
    reportApprovals: [],
    reportSchedules: [],
    auditLogs: [],
    overtimes: [],
    wfhRequests: [],
    dailyReports: [],
    newsItems: JSON.parse(JSON.stringify(defaultNewsItems())),
    hrContacts: JSON.parse(JSON.stringify(defaultHrContacts())),
    appSettings: defaultAppSettings(),
    organizations: [defaultOrganization()],
    currentOrganizationId: DEFAULT_ORG_ID,
  };
}

function defaultDB() {
  return migrateDB(rawDefaultDB());
}

export function defaultOrganization() {
  return {
    id: DEFAULT_ORG_ID,
    name: 'ProQ Indonesia',
    legalName: 'PT. ProQ Indonesia',
    code: 'PROQ',
    industry: 'Field Services',
    status: 'active',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    website: '',
    notes: 'Organisasi bawaan hasil migrasi data existing.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getCurrentOrgId() {
  const actor = getActor();
  if (actor && actor.role !== 'superadmin' && actor.organizationId) {
    return actor.organizationId;
  }
  try {
    return localStorage.getItem(ORG_KEY) || DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

export function setCurrentOrgId(id) {
  const actor = getActor();
  if (actor && actor.role !== 'superadmin') {
    if (actor.organizationId !== id) throw new Error('Manager hanya dapat mengakses organisasinya sendiri.');
  }
  const org = (getDB().organizations || []).find(o => o.id === id);
  if (!org) throw new Error('Organisasi tidak ditemukan.');
  const db = getDB();
  db.currentOrganizationId = id;
  try { localStorage.setItem(ORG_KEY, id); } catch { /* ignore */ }
  saveDB();
  return org;
}

export function getOrganizations(activeOnly = false) {
  const actor = getActor();
  let rows = getDB().organizations || [];
  if (actor && actor.role !== 'superadmin') {
    rows = rows.filter(o => o.id === (actor.organizationId || getCurrentOrgId()));
  }
  return activeOnly ? rows.filter(o => o.status === 'active') : rows;
}

export function getOrganization(id = getCurrentOrgId()) {
  return getOrganizations().find(o => o.id === id) || null;
}

function scoped(list) {
  const orgId = getCurrentOrgId();
  return (list || []).filter(item => item && item.organizationId === orgId);
}

export function withOrg(data = {}) {
  const actor = getActor();
  const forced = actor && actor.role !== 'superadmin' ? actor.organizationId : null;
  const organizationId = forced || data.organizationId || getCurrentOrgId();
  return { ...data, organizationId };
}

export function defaultAppSettings() {
  return {
    companyName: 'PT. ProQ Indonesia',
    companyLogo: './assets/logo-light.svg',
    timezone: 'Asia/Jakarta',
    compactTables: false,
    notifyLeave: true,
    notifyLowStock: true,
    attendanceMode: 'office',
    attendanceRadiusM: 150,
    officeLat: null,
    officeLng: null,
    officeName: 'Kantor',
    testDevices: [],
    updatedAt: null,
  };
}

function defaultNewsItems() {
  return [
    {
      id: 'NWS001',
      title: 'Jam operasional Ramadan',
      body: 'Selama Ramadan, jam kerja menjadi 08.00–16.00 WIB. Absen pulang lebih awal tetap dihitung penuh bila sudah 7 jam efektif.',
      publishedAt: '2026-08-12',
      pinned: true,
    },
    {
      id: 'NWS002',
      title: 'Pengajuan lembur lewat aplikasi',
      body: 'Mulai bulan ini pengajuan lembur hanya diterima di ProQTrack. Lampiran foto atau nota tidak wajib, tetapi alasan harus jelas.',
      publishedAt: '2026-08-05',
      pinned: false,
    },
    {
      id: 'NWS003',
      title: 'Kontak HRD darurat',
      body: 'Untuk keperluan surat keterangan kerja atau BPJS, hubungi HRD di menu Hubungi HRD. Respon di hari kerja pukul 09.00–17.00.',
      publishedAt: '2026-07-28',
      pinned: false,
    },
  ];
}

function defaultHrContacts() {
  return [
    {
      id: 'HRC001',
      name: 'Dewi HRD',
      role: 'Human Resources',
      phone: '021-5794-0101',
      whatsapp: '6281210000101',
      email: 'hrd@proqtrack.id',
      hours: 'Senin–Jumat, 09.00–17.00 WIB',
    },
  ];
}

export function defaultStoreCatalog() {
  return {
    allowNewOutlet: true,
    notesMode: 'freetext',
    notesOptions: [
      'High potential, high volume',
      'Strategic location / heavy traffic',
      'Client request',
      'No coverage in this area yet',
      'Competitor is active here',
    ],
    segments: ['GT', 'MT', 'Other'],
    types: ['Grocery', 'Minimarket', 'Pharmacy', 'Building Store', 'Other'],
    ownerships: ['Independent', 'Own Store', 'Franchise', 'Modern Chain', 'Third Party'],
  };
}

export function formatOutletLabel(outlet) {
  if (!outlet) return '—';
  const num = outlet.outletNumber || outlet.code || outlet.id || '';
  return `${num} — ${outlet.name || 'Toko'}`;
}

function nextOutletNumber(db) {
  const nums = (db.outlets || []).map(o => {
    const m = String(o.outletNumber || o.code || '').match(/(\d+)/);
    return m ? Number(m[1]) : 0;
  });
  const n = Math.max(0, ...nums) + 1;
  return `OUT-${String(n).padStart(4, '0')}`;
}

export function getProjectStoreSettings(projectId) {
  const db = getDB();
  const row = (db.projectSettings || []).find(s => s.projectId === projectId) || {};
  const catalog = { ...defaultStoreCatalog(), ...(row.storeCatalog || {}) };
  const allow = row.modules?.newOutlet !== false && catalog.allowNewOutlet !== false;
  return { ...catalog, allowNewOutlet: allow, projectId };
}

export function saveProjectStoreSettings(projectId, data) {
  const actor = assertProjectAdmin();
  if (actor.role === 'manager' && actor.projectId !== projectId) throw new Error('Akses ditolak');
  const db = getDB();
  db.projectSettings = db.projectSettings || [];
  let row = db.projectSettings.find(s => s.projectId === projectId);
  if (!row) {
    row = { projectId, organizationId: withOrg({}).organizationId, modules: { newOutlet: true } };
    db.projectSettings.push(row);
  }
  if (!row.organizationId) row.organizationId = withOrg({}).organizationId;
  row.modules = { ...(row.modules || {}), newOutlet: data.allowNewOutlet !== false };
  row.storeCatalog = {
    allowNewOutlet: data.allowNewOutlet !== false,
    notesMode: data.notesMode === 'dropdown' ? 'dropdown' : 'freetext',
    notesOptions: (data.notesOptions || []).map(sanitizePlainText).filter(Boolean),
    segments: (data.segments || []).map(sanitizePlainText).filter(Boolean),
    types: (data.types || []).map(sanitizePlainText).filter(Boolean),
    ownerships: (data.ownerships || []).map(sanitizePlainText).filter(Boolean),
  };
  row.updatedAt = new Date().toISOString();
  row.updatedBy = actor.id;
  saveDB();
  return getProjectStoreSettings(projectId);
}

export function canEmployeeAddStore(employeeId = getActor()?.employeeId) {
  const db = getDB();
  const ids = (db.projectAssignments || [])
    .filter(a => a.employeeId === employeeId && a.status === 'active')
    .map(a => a.projectId);
  if (!ids.length) return false;
  return ids.some(id => getProjectStoreSettings(id).allowNewOutlet);
}

export function storeCatalogForEmployee(employeeId = getActor()?.employeeId) {
  const projectId = defaultProjectIdForEmployee(employeeId);
  return getProjectStoreSettings(projectId);
}

/** Ensure product rows have brand/cost/margin fields without wiping user data */
function migrateProducts(products) {
  if (!Array.isArray(products)) return JSON.parse(JSON.stringify(seedProducts));
  return products.map(p => ({
    brand: p.brand || 'Umum',
    cost: p.cost != null ? p.cost : null,
    margin: p.margin != null ? p.margin : null,
    category: p.category || 'Lainnya',
    unit: p.unit || 'pcs',
    price: p.price != null ? p.price : 0,
    sku: p.sku || '',
    status: p.status || 'active',
    ...p,
  }));
}

function migrateCompetitorIntel(rows) {
  if (!Array.isArray(rows)) return JSON.parse(JSON.stringify(seedCompetitorIntel));
  return rows.map(i => ({
    ...i,
    hasPromo: !!(i.hasPromo || i.promo),
    promoType: i.promoType || '',
    promoNotes: i.promoNotes != null ? i.promoNotes : (i.promoNote || ''),
    notes: i.notes || '',
  }));
}

function hydrateFromBase(out, base) {
  for (const key of Object.keys(base)) {
    if (key === '_version') continue;
    const sample = base[key];
    if (Array.isArray(sample)) {
      if (!Array.isArray(out[key])) out[key] = JSON.parse(JSON.stringify(sample));
      continue;
    }
    if (sample && typeof sample === 'object') {
      if (!out[key] || typeof out[key] !== 'object' || Array.isArray(out[key])) {
        out[key] = JSON.parse(JSON.stringify(sample));
      }
      continue;
    }
    if (out[key] == null || out[key] === '') out[key] = sample;
  }
}

function migrateDB(parsed) {
  const base = rawDefaultDB();
  const out = { ...base, ...parsed, _version: DB_VERSION };

  hydrateFromBase(out, base);

  out.products = migrateProducts(out.products);
  out.competitorIntel = migrateCompetitorIntel(out.competitorIntel);
  out.employees = out.employees.map(employee => {
    const next = {
      photo: '',
      todayVisits: 0,
      targetVisits: 6,
      totalVisits: 0,
      ...employee,
      name: sanitizePlainText(employee.name || employee.fullName || ''),
      email: normalizeEmail(employee.email),
      phone: sanitizePlainText(employee.phone || ''),
      area: sanitizePlainText(employee.area || ''),
      todayVisits: Number(employee.todayVisits) || 0,
      targetVisits: Number(employee.targetVisits) || 6,
      totalVisits: Number(employee.totalVisits) || 0,
    };
    if (!next.photo) next.photo = defaultPortrait(next);
    return next;
  });
  out.accounts = out.accounts.map(account => ({
    status: 'active',
    ...account,
    email: normalizeEmail(account.email),
    password: hashPassword(account.password || ''),
  }));
  out.employees.forEach(employee => {
    const account = out.accounts.find(a => a.employeeId === employee.id);
    if (account) {
      account.email = employee.email;
      account.name = employee.name;
      if (!['superadmin', 'manager'].includes(account.role)) {
        account.role = accountRoleForEmployee(employee);
      }
      applyEmployeeAccountStatus(account, employee);
    }
  });
  out.outlets = out.outlets.map(outlet => ({
    clientId: null,
    projectIds: [],
    owner: '',
    visitFrequency: '',
    ...outlet,
    owner: outlet.owner || '',
    visitFrequency: outlet.visitFrequency || '',
    projectIds: Array.isArray(outlet.projectIds)
      ? [...new Set(outlet.projectIds.filter(Boolean))]
      : (outlet.projectId ? [outlet.projectId] : []),
  }));
  out.products = out.products.map(product => ({
    clientId: null,
    projectIds: [],
    ...product,
    projectIds: Array.isArray(product.projectIds)
      ? [...new Set(product.projectIds.filter(Boolean))]
      : (product.projectId ? [product.projectId] : []),
  }));

  if (!out.competitors.length) {
    out.competitors = JSON.parse(JSON.stringify(seedCompetitors));
  }
  if (!out.competitorProducts.length) {
    out.competitorProducts = JSON.parse(JSON.stringify(seedCompetitorProducts));
  }
  if (!out.competitorIntel.length) {
    out.competitorIntel = JSON.parse(JSON.stringify(seedCompetitorIntel));
  }
  if (!out.promoTypes.length) {
    out.promoTypes = JSON.parse(JSON.stringify(seedPromoTypes));
  }
  if (!out.fieldPhotos.length) {
    out.fieldPhotos = JSON.parse(JSON.stringify(seedFieldPhotos));
  }

  const photoTypeMap = { display: 'shelf', stock: 'product', promo: 'competitor' };
  out.fieldPhotos = out.fieldPhotos.map(photo => {
    const raw = photo.photoType || photo.type || 'location';
    const photoType = photoTypeMap[raw] || raw;
    const recordedBy = photo.recordedBy || photo.employeeId || '';
    const recordedAt = photo.recordedAt || photo.createdAt || '';
    return {
      ...photo,
      photoType,
      type: photoType,
      recordedBy,
      employeeId: photo.employeeId || recordedBy,
      recordedAt,
      dataUrl: photo.dataUrl || photo.photoUrl || '',
      caption: photo.caption || photo.title || photo.note || '',
    };
  });

  out.competitorIntel = out.competitorIntel.map(row => ({
    ...row,
    recordedBy: row.recordedBy || row.employeeId || '',
    employeeId: row.employeeId || row.recordedBy || '',
    recordedAt: row.recordedAt || row.createdAt || '',
    notes: row.notes || row.description || row.title || '',
  }));

  out.attendance = (out.attendance || []).map(row => ({
    ...row,
    status: normalizeAttendanceStatus(row.status || row.attendanceStatus) || row.status,
  }));

  out.accounts = out.accounts.map(account => {
    const employee = account.employeeId
      ? (out.employees || []).find(e => e.id === account.employeeId)
      : null;
    const syncedRole = employee ? accountRoleForEmployee(employee) : account.role;
    return {
      status: 'active',
      lastLoginAt: null,
      mustChangePassword: false,
      ...account,
      role: (() => {
        let role = account.role;
        if (role === 'manager' && !account.projectId) role = 'head';
        if (['superadmin', 'head', 'manager'].includes(role)) return role;
        return syncedRole;
      })(),
      email: normalizeEmail(account.email),
    };
  });
  out.appSettings = { ...defaultAppSettings(), ...(out.appSettings || {}) };
  for (const key of SEEDED_EMPTY_ARRAYS) {
    if (!Array.isArray(out[key])) out[key] = [];
  }
  (out.priceObservations || []).forEach(row => {
    if (row && !row.organizationId) row.organizationId = row.organizationId || DEFAULT_ORG_ID;
  });
  (out.competitorIntel || []).forEach(row => {
    if (row && !row.organizationId) row.organizationId = DEFAULT_ORG_ID;
  });
  if (!Array.isArray(out.organizations) || !out.organizations.length) {
    out.organizations = [defaultOrganization()];
  }
  out.currentOrganizationId = out.currentOrganizationId || DEFAULT_ORG_ID;
  const isDemoId = id => /^(ORG-DEFAULT$|CL-UAT|PRJ-UAT|ASN-UAT|EMP-UAT|OUT-UAT|ACC-UAT|CL00|PRJ00|EMP00|OUT00|ACC00)/.test(String(id || ''));
  const stamp = rows => Array.isArray(rows) ? rows.map(row => ({
    ...row,
    organizationId: isDemoId(row.id) ? DEFAULT_ORG_ID : (row.organizationId || DEFAULT_ORG_ID),
  })) : rows;
  (out.outlets || []).forEach((o, i) => {
    if (o && !o.outletNumber && !o.code) o.outletNumber = `OUT-${String(i + 1).padStart(4, '0')}`;
    else if (o && !o.outletNumber) o.outletNumber = o.code;
  });
  SCHEMA.tenantCollections.forEach(key => {
    if (Array.isArray(out[key])) out[key] = stamp(out[key]);
  });
  if (Array.isArray(out.projectSettings)) {
    const projectOrg = Object.fromEntries(
      (out.projects || []).map(p => [p.id, p.organizationId || DEFAULT_ORG_ID])
    );
    out.projectSettings = out.projectSettings.map(row => ({
      ...row,
      organizationId: row.organizationId || projectOrg[row.projectId] || DEFAULT_ORG_ID,
    }));
  }
  const assignmentRoleMap = { field_sales: 'sales', merchandiser: 'sales' };
  (out.projectAssignments || []).forEach(row => {
    if (assignmentRoleMap[row.roleOnProject]) row.roleOnProject = assignmentRoleMap[row.roleOnProject];
    if (row.status === 'ended') row.status = 'removed';
  });
  (out.outlets || []).forEach(outlet => {
    if (outlet && outlet.projectId && !Array.isArray(outlet.projectIds)) {
      outlet.projectIds = [outlet.projectId];
    }
    if (outlet && 'projectId' in outlet && Array.isArray(outlet.projectIds)) {
      delete outlet.projectId;
    }
  });
  ensurePlatformAccounts(out);

  return out;
}

const RETIRED_SEED_PASSWORD_HASHES = new Set([
  'sha256$53d8df577ff12695fb02c03d92e4e3d119a717e2ed89036a7ffbb053cef924d3',
]);
const LOCAL_SEED_PASSWORD_HASH = 'sha256$899169b9613ef73ec345b82b78242916491ff2535b3743c99e74606125e4375c';

function rotateRetiredSeedPasswords(accounts) {
  (accounts || []).forEach(account => {
    if (RETIRED_SEED_PASSWORD_HASHES.has(String(account.password || ''))) {
      account.password = LOCAL_SEED_PASSWORD_HASH;
    }
  });
}

function ensurePlatformAccounts(db) {
  db.accounts = db.accounts || [];
  rotateRetiredSeedPasswords(db.accounts);
  db.accounts.forEach(account => {
    if (account.role === 'superadmin') {
      account.organizationId = null;
      return;
    }
    if (!account.organizationId) account.organizationId = DEFAULT_ORG_ID;
  });
}

let _cache = null;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('proqtrack:db-updated', (event) => {
    if (event?.detail?.fromCache) return;
    _cache = null;
  });
}

function readRawFromStorage() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return { raw, key: DB_KEY };
    for (const k of LEGACY_KEYS) {
      const legacy = localStorage.getItem(k);
      if (legacy) return { raw: legacy, key: k };
    }
  } catch (e) {
    console.error('Failed to read DB', e);
  }
  return null;
}

export function getDB() {
  if (_cache) return _cache;
  const found = readRawFromStorage();
  if (found) {
    try {
      const parsed = JSON.parse(found.raw);
      _cache = migrateDB(parsed);
      if (found.key !== DB_KEY || parsed._version !== DB_VERSION) {
        saveDB();
        if (found.key !== DB_KEY) {
          try { localStorage.removeItem(found.key); } catch (_) { /* ignore */ }
        }
      }
      return _cache;
    } catch (e) {
      console.error('Failed to parse DB', e);
    }
  }
  _cache = defaultDB();
  saveDB();
  return _cache;
}

export function saveDB() {
  if (!_cache) return;
  try {
    const text = JSON.stringify(_cache);
    localStorage.setItem(DB_KEY, text);
    try { localStorage.setItem('proqtrack_db_v7', text); } catch { /* legacy mirror */ }
    return true;
  } catch (e) {
    console.error('Failed to save DB', e);
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    if (quota) {
      const err = new Error('STORAGE_QUOTA_EXCEEDED');
      err.code = 'STORAGE_QUOTA_EXCEEDED';
      err.cause = e;
      throw err;
    }
    return false;
  }
}

/** Persist the live cache and notify UI addons without dropping it. */
export function persistDB(reason = 'persist') {
  const ok = saveDB();
  if (
    typeof window !== 'undefined'
    && typeof window.dispatchEvent === 'function'
    && typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(new CustomEvent('proqtrack:db-updated', { detail: { reason, fromCache: true } }));
  }
  return ok;
}

export function resetDB() {
  _cache = defaultDB();
  saveDB();
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch (_) { /* ignore */ }
  }
  return _cache;
}

export function __resetForTests() {
  _cache = null;
}

export function getAccounts() {
  const actor = getActor();
  if (!actor) return [];
  const all = (getDB().accounts || []).map(publicAccount);
  if (actor.role === 'superadmin') {
    const orgId = getCurrentOrgId();
    return all.filter(a => a.role === 'superadmin' || a.organizationId === orgId);
  }
  if (actor.role === 'head') {
    return all.filter(a => a.organizationId === actor.organizationId && a.role !== 'superadmin');
  }
  if (actor.role === 'manager') {
    const ids = visibleEmployeeIds(actor);
    return all.filter(a =>
      a.organizationId === actor.organizationId &&
      a.role !== 'superadmin' &&
      a.role !== 'head' &&
      (a.id === actor.id || (a.role === 'manager' && a.projectId === actor.projectId) || (a.employeeId && ids.has(a.employeeId)))
    );
  }
  return all.filter(a => a.id === actor.id);
}

export function createOrganization(data) {
  assertSuperadmin();
  const db = getDB();
  const org = {
    id: uid('ORG'),
    status: 'active',
    createdAt: new Date().toISOString(),
    ...data,
    name: sanitizePlainText(data.name),
    legalName: sanitizePlainText(data.legalName || data.name),
    code: sanitizePlainText(data.code || data.name || 'ORG').toUpperCase().replace(/\s+/g, '').slice(0, 12),
    updatedAt: new Date().toISOString(),
  };
  if (!org.name) throw new Error('Nama organisasi wajib diisi.');
  if ((db.organizations || []).some(o => o.code === org.code)) throw new Error('Kode organisasi sudah dipakai.');
  db.organizations = db.organizations || [];
  db.organizations.push(org);
  saveDB();
  return org;
}

export function updateOrganization(id, data) {
  const actor = assertOrgAdmin();
  if (actor.role === 'head' && actor.organizationId !== id) throw new Error('Akses ditolak');
  const db = getDB();
  const idx = (db.organizations || []).findIndex(o => o.id === id);
  if (idx === -1) throw new Error('Organisasi tidak ditemukan.');
  db.organizations[idx] = {
    ...db.organizations[idx],
    ...data,
    name: sanitizePlainText(data.name ?? db.organizations[idx].name),
    legalName: sanitizePlainText(data.legalName ?? db.organizations[idx].legalName),
    updatedAt: new Date().toISOString(),
  };
  saveDB();
  return db.organizations[idx];
}

function isRegisteredTestDevice(db, deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return false;
  try {
    const host = JSON.parse(localStorage.getItem('proqtrack_superadmin_host_v1') || 'null');
    return !!(host?.id && host.id === id);
  } catch {
    return false;
  }
}

export function registerTestDevice(device, actor = getActor()) {
  if (!device?.id) return null;
  if (actor?.role !== 'superadmin') throw new Error('Akses ditolak');
  const db = getDB();
  db.appSettings = { ...defaultAppSettings(), ...(db.appSettings || {}) };
  const list = Array.isArray(db.appSettings.testDevices) ? db.appSettings.testDevices : [];
  const next = {
    id: device.id,
    imei: device.imei || '',
    label: sanitizePlainText(device.label || 'Superadmin host'),
    registeredAt: new Date().toISOString(),
    registeredBy: actor?.email || actor?.id || 'superadmin',
  };
  db.appSettings.testDevices = [next, ...list.filter(d => d.id !== device.id)].slice(0, 20);
  db.appSettings.updatedAt = next.registeredAt;
  saveDB();
  return next;
}

export function isTestDevice(deviceId) {
  return isRegisteredTestDevice(getDB(), deviceId);
}

function deviceBindingOf(secret, accountId) {
  return hashPassword(`${String(secret || '')}|${String(accountId || '')}|proqtrack.device.v1`);
}

function assertSalesDevice(db, acc, device) {
  if (String(acc.role || '').toLowerCase() !== 'employee') return;
  const deviceId = String(device?.id || '').trim();
  if (!deviceId) throw new Error('Perangkat tidak dikenali. Buka aplikasi dari perangkat resmi sales.');
  if (isRegisteredTestDevice(db, deviceId)) return;
  const other = db.accounts.find(a =>
    a.role === 'employee' && a.id !== acc.id && a.deviceId && a.deviceId === deviceId
  );
  if (other) {
    throw new Error('Perangkat ini sudah terpasang ke akun sales lain. Satu device hanya untuk satu sales.');
  }
  const binding = deviceBindingOf(device?.secret, acc.id);
  if (!acc.deviceId) {
    acc.deviceId = deviceId;
    acc.deviceBinding = binding;
    acc.deviceImei = device.imei || '';
    acc.deviceLabel = sanitizePlainText(device.label || '');
    acc.deviceUserAgent = sanitizePlainText(device.userAgent || '');
    acc.devicePairedAt = new Date().toISOString();
    return;
  }
  if (acc.deviceId !== deviceId) {
    const hint = acc.deviceLabel ? ` Perangkat terpasang: ${acc.deviceLabel}.` : '';
    const when = acc.devicePairedAt ? ` Dipasang ${String(acc.devicePairedAt).slice(0, 10)}.` : '';
    throw new Error(`Akun sudah terpasang ke perangkat lain.${hint}${when} Minta manager mereset perangkat sebelum ganti HP.`);
  }
  if (acc.deviceBinding && acc.deviceBinding !== binding) {
    throw new Error('Sidik perangkat tidak cocok. Minta manager mereset perangkat jika ini HP resmi Anda.');
  }
  if (!acc.deviceBinding) acc.deviceBinding = binding;
}

export function resetSalesDevice(accountId) {
  const actor = assertProjectAdmin();
  const db = getDB();
  const acc = db.accounts.find(a => a.id === accountId);
  if (!acc) throw new Error('Akun tidak ditemukan.');
  if (acc.role !== 'employee') throw new Error('Reset IMEI hanya untuk akun sales.');
  if (actor.role === 'head' && (acc.organizationId || DEFAULT_ORG_ID) !== actor.organizationId) throw new Error('Akses ditolak');
  if (actor.role === 'manager') {
    const ids = visibleEmployeeIds(actor);
    if (acc.id !== actor.id && !ids.has(acc.employeeId)) throw new Error('Akses ditolak');
  }
  acc.deviceId = null;
  acc.deviceImei = '';
  acc.deviceLabel = '';
  acc.deviceUserAgent = '';
  acc.deviceBinding = null;
  acc.deviceResetAt = new Date().toISOString();
  acc.deviceResetBy = actor.id;
  acc.deviceResetByName = actor.name || actor.email;
  saveDB();
  return publicAccount(acc);
}

export function authenticate(email, password, device = null) {
  const db = getDB();
  const acc = db.accounts.find(a => a.email.toLowerCase() === email.toLowerCase().trim());
  if (!acc || acc.status === 'inactive' || acc.status === 'suspended' || !passwordMatches(acc.password, password)) return null;
  if (acc.employeeId) {
    const employee = findEmployee(acc.employeeId, db);
    if (!employee || employee.status !== 'active') return null;
    if (!['superadmin', 'head', 'manager'].includes(acc.role)) {
      acc.role = accountRoleForEmployee(employee);
    }
  }
  assertSalesDevice(db, acc, device);
  acc.lastLoginAt = new Date().toISOString();
  if (!String(acc.password).startsWith('sha256$')) acc.password = hashPassword(password);
  if (acc.role === 'superadmin') {
    db.currentOrganizationId = db.currentOrganizationId || DEFAULT_ORG_ID;
    if (device?.id) registerTestDevice(device, acc);
  } else if (acc.organizationId) {
    db.currentOrganizationId = acc.organizationId;
    try { localStorage.setItem(ORG_KEY, acc.organizationId); } catch { /* ignore */ }
  }
  saveDB();
  return publicAccount(acc);
}

export function resumeSession(accountId, device = null) {
  const db = getDB();
  const acc = (db.accounts || []).find(a => a.id === accountId);
  if (!acc || acc.status === 'inactive' || acc.status === 'suspended') return null;
  if (acc.employeeId) {
    const employee = findEmployee(acc.employeeId, db);
    if (!employee || employee.status !== 'active') return null;
    if (!['superadmin', 'head', 'manager'].includes(acc.role)) {
      acc.role = accountRoleForEmployee(employee);
    }
  }
  try {
    assertSalesDevice(db, acc, device);
  } catch {
    return null;
  }
  saveDB();
  return publicAccount(acc);
}

function countActiveManagers(db, exceptId = null, orgId = null) {
  return db.accounts.filter(a =>
    a.role === 'head' &&
    a.status === 'active' &&
    a.id !== exceptId &&
    (!orgId || a.organizationId === orgId)
  ).length;
}

function countActiveSuperadmins(db, exceptId = null) {
  return db.accounts.filter(a =>
    a.role === 'superadmin' && a.status === 'active' && a.id !== exceptId
  ).length;
}

function assertAccountEmail(db, email, accountId = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email wajib diisi.');
  const taken = db.accounts.some(a => normalizeEmail(a.email) === normalized && a.id !== accountId);
  const empTaken = db.employees.some(e =>
    normalizeEmail(e.email) === normalized &&
    !db.accounts.some(a => a.id === accountId && a.employeeId === e.id)
  );
  if (taken || empTaken) throw new Error('Email sudah digunakan oleh user lain.');
  return normalized;
}

export function getAppSettings() {
  const db = getDB();
  if (!db.appSettings) db.appSettings = defaultAppSettings();
  return db.appSettings;
}

export function getAttendancePolicy() {
  const s = getAppSettings();
  const mode = ['office', 'outlet', 'point'].includes(s.attendanceMode) ? s.attendanceMode : 'office';
  return {
    mode,
    radiusM: Number(s.attendanceRadiusM) || 150,
    officeLat: s.officeLat == null || s.officeLat === '' ? null : Number(s.officeLat),
    officeLng: s.officeLng == null || s.officeLng === '' ? null : Number(s.officeLng),
    officeName: s.officeName || 'Office',
  };
}

export function updateAppSettings(partial) {
  const actor = assertLoggedIn();
  const privileged = [
    'companyName', 'companyLogo', 'timezone', 'attendanceMode', 'attendanceRadiusM',
    'officeLat', 'officeLng', 'officeName', 'testDevices', 'notifyLeave', 'notifyLowStock',
  ];
  if (privileged.some(key => Object.prototype.hasOwnProperty.call(partial, key))) {
    if (!isOrgAdminRole(actor.role)) {
      throw new Error('Akses ditolak');
    }
  }
  const db = getDB();
  db.appSettings = {
    ...defaultAppSettings(),
    ...db.appSettings,
    ...partial,
    companyName: sanitizePlainText(partial.companyName ?? db.appSettings?.companyName ?? 'ProQTrack'),
    updatedAt: new Date().toISOString(),
  };
  if (db.reportSettings) {
    db.reportSettings.companyName = db.appSettings.companyName;
    db.reportSettings.companyLogo = db.appSettings.companyLogo;
  }
  saveDB();
  return db.appSettings;
}

export function createAccount(data) {
  const actor = assertOrgAdmin();
  const db = getDB();
  const email = assertAccountEmail(db, data.email);
  if (!data.password || String(data.password).length < 8) {
    throw new Error('Password login minimal 8 karakter.');
  }
  const allowed = actor.role === 'superadmin'
    ? ['superadmin', 'head', 'manager', 'supervisor', 'employee']
    : actor.role === 'head'
      ? ['manager', 'supervisor', 'employee']
      : ['supervisor', 'employee'];
  const role = allowed.includes(data.role) ? data.role : (actor.role === 'superadmin' ? 'head' : 'employee');
  if (role === 'superadmin' && actor.role !== 'superadmin') throw new Error('Akses ditolak');
  if (role === 'head' && actor.role !== 'superadmin') throw new Error('Akses ditolak');
  if (role === 'manager' && !data.projectId) throw new Error('Project manager must be assigned to one project.');
  let employeeId = data.employeeId || null;
  if (employeeId) {
    const employee = db.employees.find(e => e.id === employeeId);
    if (!employee) throw new Error('Karyawan tidak ditemukan.');
    if (db.accounts.some(a => a.employeeId === employeeId)) {
      throw new Error('Karyawan ini sudah memiliki akun login.');
    }
  }
  const account = {
    id: uid('ACC'),
    organizationId: role === 'superadmin' ? null : (actor.organizationId || data.organizationId || getCurrentOrgId()),
    projectId: role === 'manager' ? data.projectId : null,
    email,
    name: sanitizePlainText(data.name) || email,
    password: hashPassword(data.password),
    role,
    employeeId,
    status: data.status === 'inactive' ? 'inactive' : 'active',
    mustChangePassword: !!data.mustChangePassword,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
  };
  db.accounts.push(account);
  if (employeeId) {
    const employee = db.employees.find(e => e.id === employeeId);
    employee.email = email;
    if (account.name) employee.name = account.name;
  }
  saveDB();
  return publicAccount(account);
}

export function updateAccount(id, data) {
  assertOrgAdmin();
  const db = getDB();
  const idx = db.accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Akun tidak ditemukan.');
  const actor = getActor();
  const current = db.accounts[idx];
  const allowed = actor?.role === 'superadmin'
    ? ['superadmin', 'head', 'manager', 'supervisor', 'employee']
    : actor?.role === 'head'
      ? ['manager', 'supervisor', 'employee']
      : ['supervisor', 'employee'];
  const nextRole = allowed.includes(data.role) ? data.role : current.role;
  const nextStatus = data.status || current.status;
  if (actor?.role === 'head') {
    if (current.organizationId !== actor.organizationId || current.role === 'superadmin') throw new Error('Akses ditolak');
    if (nextRole === 'superadmin' || nextRole === 'head') throw new Error('Akses ditolak');
  }
  if (current.role === 'superadmin' && (nextRole !== 'superadmin' || nextStatus !== 'active')) {
    if (countActiveSuperadmins(db, id) < 1) throw new Error('Tidak bisa menonaktifkan superadmin terakhir.');
  }
  if (current.role === 'head' && (nextRole !== 'head' || nextStatus !== 'active')) {
    if (countActiveManagers(db, id, current.organizationId) < 1) {
      throw new Error('Tidak bisa menonaktifkan atau menurunkan manager terakhir di organisasi ini.');
    }
  }
  const email = data.email ? assertAccountEmail(db, data.email, id) : current.email;
  if (data.password) {
    if (String(data.password).length < 8) throw new Error('Password login minimal 8 karakter.');
  }
  let employeeId = data.employeeId === undefined ? current.employeeId : (data.employeeId || null);
  if (employeeId) {
    const employee = db.employees.find(e => e.id === employeeId);
    if (!employee) throw new Error('Karyawan tidak ditemukan.');
    if (db.accounts.some(a => a.employeeId === employeeId && a.id !== id)) {
      throw new Error('Karyawan ini sudah memiliki akun login.');
    }
  }
  db.accounts[idx] = {
    ...current,
    email,
    name: sanitizePlainText(data.name ?? current.name),
    role: ['superadmin', 'head', 'manager', 'supervisor', 'employee'].includes(nextRole) ? nextRole : current.role,
    status: ['active', 'inactive', 'suspended'].includes(nextStatus) ? nextStatus : current.status,
    organizationId: nextRole === 'superadmin' ? null : (current.organizationId || actor?.organizationId || getCurrentOrgId()),
    projectId: nextRole === 'manager' ? (data.projectId || current.projectId || null) : null,
    employeeId,
    mustChangePassword: data.mustChangePassword ?? current.mustChangePassword,
    updatedAt: new Date().toISOString(),
  };
  if (data.password) db.accounts[idx].password = hashPassword(data.password);
  if (employeeId) {
    const employee = db.employees.find(e => e.id === employeeId);
    employee.email = email;
    employee.name = db.accounts[idx].name;
  }
  saveDB();
  return publicAccount(db.accounts[idx]);
}

export function changePassword(accountId, currentPassword, nextPassword) {
  const actor = assertLoggedIn();
  if (actor.id !== accountId && !isOrgAdminRole(actor.role)) throw new Error('Akses ditolak');
  const db = getDB();
  const account = db.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  if (!passwordMatches(account.password, currentPassword)) throw new Error('Password saat ini salah.');
  if (!nextPassword || String(nextPassword).length < 8) {
    throw new Error('Password baru minimal 8 karakter.');
  }
  if (passwordMatches(account.password, nextPassword) || nextPassword === currentPassword) {
    throw new Error('Password baru harus berbeda.');
  }
  account.password = hashPassword(nextPassword);
  account.mustChangePassword = false;
  account.passwordChangedAt = new Date().toISOString();
  saveDB();
  return true;
}

export function updateOwnProfile(accountId, data) {
  const actor = assertLoggedIn();
  if (actor.id !== accountId) throw new Error('Akses ditolak');
  const db = getDB();
  const account = db.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  const email = data.email ? assertAccountEmail(db, data.email, accountId) : account.email;
  account.email = email;
  account.name = sanitizePlainText(data.name ?? account.name);
  account.updatedAt = new Date().toISOString();
  if (account.employeeId) {
    const employee = db.employees.find(e => e.id === account.employeeId);
    if (employee) {
      employee.email = email;
      employee.name = account.name;
      if (data.phone != null) employee.phone = sanitizePlainText(data.phone);
      if (data.area != null) employee.area = sanitizePlainText(data.area);
    }
  }
  saveDB();
  return publicAccount(account);
}

export function getEmployees() {
  const rows = scoped(getDB().employees);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(e => ids.has(e.id));
}

function findEmployee(id, db = getDB()) {
  return (db.employees || []).find(e => e.id === id) || null;
}

export function getEmployee(id) {
  const emp = findEmployee(id);
  if (!emp) return null;
  const actor = getActor();
  if (!actor || !canAccessEmployee(emp.id, actor)) return null;
  return emp;
}

export function createEmployee(data) {
  assertProjectAdmin();
  const db = getDB();
  const email = assertUniqueEmail(db, data.email);
  const emp = {
    id: uid('EMP'), totalVisits: 0, todayVisits: 0, targetVisits: 0, salesTargetAmount: 0, attendancePointId: data.attendancePointId || null, status: 'active', photo: '',
    ...withOrg(data),
    name: sanitizePlainText(data.name),
    phone: sanitizePlainText(data.phone),
    area: sanitizePlainText(data.area),
    email,
  };
  if (!emp.photo) emp.photo = defaultPortrait(emp);
  delete emp.password;
  db.employees.push(emp);
  try {
    syncEmployeeAccount(db, emp, data.password);
  } catch (error) {
    db.employees.pop();
    throw error;
  }
  const actor = getActor();
  if (actor?.role === 'manager' && actor.projectId) {
    db.projectAssignments = db.projectAssignments || [];
    db.projectAssignments.push({
      id: uid('ASN'),
      employeeId: emp.id,
      projectId: actor.projectId,
      roleOnProject: 'sales',
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
      organizationId: actor.organizationId || getCurrentOrgId(),
    });
  }
  saveDB();
  return emp;
}

export function updateEmployee(id, data) {
  assertProjectAdmin();
  const db = getDB();
  const idx = db.employees.findIndex(e => e.id === id);
  if (idx === -1) return null;
  const email = assertUniqueEmail(db, data.email || db.employees[idx].email, id);
  const next = {
    ...db.employees[idx],
    ...data,
    name: sanitizePlainText(data.name ?? db.employees[idx].name),
    phone: sanitizePlainText(data.phone ?? db.employees[idx].phone),
    area: sanitizePlainText(data.area ?? db.employees[idx].area),
    email,
  };
  if (!next.photo) next.photo = defaultPortrait(next);
  delete next.password;
  syncEmployeeAccount(db, next, data.password);
  db.employees[idx] = next;
  if (next.status !== 'active') {
    (db.projectAssignments || []).forEach(a => {
      if (a.employeeId === id && a.status === 'active') {
        a.status = 'removed';
        a.removedAt = new Date().toISOString();
        a.removalReason = 'Karyawan dinonaktifkan';
      }
    });
  }
  saveDB();
  return db.employees[idx];
}

export function deleteEmployee(id) {
  assertProjectAdmin();
  const db = getDB();
  const referenced = [
    db.visits, db.attendance, db.leaves, db.projectAssignments,
    db.fieldPhotos, db.competitorIntel,
  ].some(rows => (rows || []).some(row =>
    row.employeeId === id || row.recordedBy === id || row.updatedBy === id
  ));
  if (referenced) {
    updateEmployee(id, { status: 'inactive' });
    return { deactivated: true };
  }
  db.employees = db.employees.filter(e => e.id !== id);
  db.accounts = db.accounts.filter(a => a.employeeId !== id);
  saveDB();
  return { deleted: true };
}

export function getOutlets() {
  const rows = scoped(getDB().outlets);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  if (actor.role === 'manager' && actor.projectId) {
    return rows.filter(o =>
      (o.projectIds || []).includes(actor.projectId) ||
      !(o.projectIds || []).length
    );
  }
  return rows;
}

export function getOutlet(id) {
  return getOutlets().find(o => o.id === id) || null;
}

function normalizeEntityScope(db, data) {
  const projectIds = [...new Set(
    (Object.prototype.hasOwnProperty.call(data, 'projectId')
      ? [data.projectId]
      : (Array.isArray(data.projectIds) ? data.projectIds : []))
      .filter(Boolean)
  )];
  const projects = projectIds.map(id => db.projects?.find(p => p.id === id));
  if (projectIds.length && projects.some(project => !project)) {
    throw new Error('Project yang dipilih tidak valid.');
  }
  const clientIds = [...new Set(projects.map(project => project.clientId).filter(Boolean))];
  const clientId = data.clientId || clientIds[0] || null;
  if (clientIds.length > 1 || (clientId && clientIds.some(id => id !== clientId))) {
    throw new Error('Semua project harus berasal dari klien yang sama.');
  }
  if (clientId && db.clients?.length && !db.clients.some(client => client.id === clientId)) {
    throw new Error('Klien yang dipilih tidak valid.');
  }
  return { clientId, projectIds };
}

function linkedProjectIds(entity) {
  if (!entity) return [];
  if (Array.isArray(entity.projectIds) && entity.projectIds.length) return entity.projectIds.filter(Boolean);
  return entity.projectId ? [entity.projectId] : [];
}

export function getLinkedProjectIds(entity) {
  return linkedProjectIds(entity);
}

function inferProjectId(db, data) {
  if (data.projectId) return data.projectId;
  if (data.visitId) {
    const visit = (db.visits || []).find(v => v.id === data.visitId);
    if (visit?.projectId) return visit.projectId;
  }
  if (data.outletId) {
    const outlet = (db.outlets || []).find(o => o.id === data.outletId);
    const ids = linkedProjectIds(outlet);
    if (ids.length) return ids[0];
  }
  return null;
}

function belongsToProject(entity, projectId, project) {
  const ids = linkedProjectIds(entity);
  if (!ids.length) {
    if (entity.clientId && project?.clientId) return entity.clientId === project.clientId;
    return true;
  }
  return ids.includes(projectId);
}

function assertOperationalContext(db, data, { product = false } = {}) {
  const projectId = inferProjectId(db, data);
  if (projectId && !data.projectId) data.projectId = projectId;
  if (!data.projectId) return;
  const project = db.projects?.find(p => p.id === data.projectId);
  if (!project || (project.status && project.status !== 'active' && project.status !== 'planning')) {
    throw new Error('Aktivitas memerlukan project aktif.');
  }
  const employeeId = data.employeeId || data.recordedBy || data.updatedBy;
  if (employeeId && (db.projectAssignments || []).length && !db.projectAssignments.some(a =>
    a.projectId === data.projectId &&
    a.employeeId === employeeId &&
    a.status === 'active'
  )) {
    const hasAny = db.projectAssignments.some(a =>
      a.projectId === data.projectId && a.employeeId === employeeId && a.status === 'active'
    );
    if (!hasAny) throw new Error('Karyawan tidak memiliki assignment aktif pada project ini.');
  }
  if (data.outletId) {
    const outlet = db.outlets.find(o => o.id === data.outletId);
    if (outlet && !belongsToProject(outlet, data.projectId, project)) {
      throw new Error('Outlet tidak terdaftar pada project ini.');
    }
  }
  if (product && data.productId) {
    const item = db.products.find(p => p.id === data.productId);
    if (!item) throw new Error('Produk tidak ditemukan.');
    if (!belongsToProject(item, data.projectId, project)) {
      throw new Error('Produk tidak terdaftar pada project ini.');
    }
  }
}

export function createOutlet(data) {
  assertProjectAdmin();
  const db = getDB();
  const scope = normalizeEntityScope(db, data);
  const outletNumber = data.outletNumber || nextOutletNumber(db);
  const notes = data.notesKind === 'dropdown' ? (data.notesChoice || data.notes || '') : (data.notes || '');
  const outlet = {
    id: uid('OUT'), status: data.status || 'active', ...withOrg(data), ...scope,
    outletNumber,
    code: outletNumber,
    name: sanitizePlainText(data.name),
    address: sanitizePlainText(data.address),
    owner: sanitizePlainText(data.owner),
    phone: sanitizePlainText(data.phone),
    area: sanitizePlainText(data.area),
    type: sanitizePlainText(data.type || 'Toko'),
    channel: sanitizePlainText(data.channel || ''),
    ownership: sanitizePlainText(data.ownership || ''),
    notes: sanitizePlainText(notes),
    lat: data.lat != null && data.lat !== '' ? Number(data.lat) : null,
    lng: data.lng != null && data.lng !== '' ? Number(data.lng) : null,
  };
  delete outlet.projectId;
  delete outlet.notesKind;
  delete outlet.notesChoice;
  delete outlet.logoFile;
  db.outlets.push(outlet);
  saveDB();
  return outlet;
}

export function updateOutlet(id, data) {
  assertProjectAdmin();
  const db = getDB();
  const idx = db.outlets.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const scope = normalizeEntityScope(db, { ...db.outlets[idx], ...data });
  db.outlets[idx] = {
    ...db.outlets[idx], ...data, ...scope,
    name: sanitizePlainText(data.name ?? db.outlets[idx].name),
    address: sanitizePlainText(data.address ?? db.outlets[idx].address),
    owner: sanitizePlainText(data.owner ?? db.outlets[idx].owner),
    phone: sanitizePlainText(data.phone ?? db.outlets[idx].phone),
    area: sanitizePlainText(data.area ?? db.outlets[idx].area),
  };
  delete db.outlets[idx].projectId;
  saveDB();
  return db.outlets[idx];
}

export function deleteOutlet(id) {
  assertProjectAdmin();
  const db = getDB();
  db.outlets = db.outlets.filter(o => o.id !== id);
  saveDB();
}

export function getOutletProposals() {
  const rows = scoped(getDB().outletProposals || []);
  const actor = getActor();
  if (!actor) return [];
  if (isOrgAdminRole(actor.role)) return rows;
  if (actor.role === 'supervisor') {
    const team = visibleEmployeeIds(actor);
    return rows.filter(p => team.has(p.submittedBy) || p.submittedBy === actor.employeeId);
  }
  return rows.filter(p => p.submittedBy === actor.employeeId);
}

export function createOutletProposal(data) {
  const actor = assertLoggedIn();
  if (!actor.employeeId && actor.role === 'employee') throw new Error('Akun sales belum tertaut karyawan.');
  const projectId = data.projectId || defaultProjectIdForEmployee(actor.employeeId);
  if (actor.role === 'employee' && !getProjectStoreSettings(projectId).allowNewOutlet) {
    throw new Error('Pengajuan toko baru tidak aktif pada project ini.');
  }
  const db = getDB();
  const org = withOrg(data);
  const outletNumber = nextOutletNumber(db);
  const outlet = {
    id: uid('OUT'),
    outletNumber,
    code: outletNumber,
    status: 'pending',
    name: sanitizePlainText(data.name),
    address: sanitizePlainText(data.address || ''),
    type: sanitizePlainText(data.type || 'Toko'),
    channel: sanitizePlainText(data.channel || ''),
    ownership: sanitizePlainText(data.ownership || ''),
    area: sanitizePlainText(data.area || ''),
    phone: sanitizePlainText(data.phone || ''),
    owner: sanitizePlainText(data.owner || ''),
    lat: data.lat !== '' && data.lat != null ? Number(data.lat) : null,
    lng: data.lng !== '' && data.lng != null ? Number(data.lng) : null,
    projectIds: projectId ? [projectId] : [],
    clientId: (db.projects || []).find(p => p.id === projectId)?.clientId || null,
    createdBy: actor.employeeId || actor.id,
    submittedBy: actor.employeeId || actor.id,
    ...org,
  };
  if (!outlet.name) throw new Error('Nama toko wajib diisi.');
  if (outlet.lat == null || outlet.lng == null || Number.isNaN(outlet.lat) || Number.isNaN(outlet.lng)) {
    throw new Error('Ambil lokasi toko dari perangkat dulu.');
  }
  const proposal = {
    id: uid('OPR'),
    name: outlet.name,
    address: outlet.address,
    type: outlet.type,
    channel: outlet.channel,
    ownership: outlet.ownership,
    notesKind: sanitizePlainText(data.notesKind || 'freetext'),
    area: outlet.area,
    city: sanitizePlainText(data.city || ''),
    phone: outlet.phone,
    owner: outlet.owner,
    lat: outlet.lat,
    lng: outlet.lng,
    mapLabel: sanitizePlainText(data.mapLabel || ''),
    projectId,
    notes: sanitizePlainText(data.notes || ''),
    submittedBy: actor.employeeId || actor.id,
    submittedByName: actor.name,
    submittedAt: new Date().toISOString(),
    supervisorStatus: 'pending',
    managerStatus: 'pending',
    status: 'pending',
    outletId: outlet.id,
    outletNumber,
    ...org,
  };
  db.outlets = db.outlets || [];
  db.outlets.push(outlet);
  db.outletProposals = db.outletProposals || [];
  db.outletProposals.push(proposal);
  saveDB();
  return proposal;
}

function defaultProjectIdForEmployee(employeeId) {
  if (!employeeId) return null;
  const db = getDB();
  const active = (db.projectAssignments || []).filter(a =>
    a.employeeId === employeeId && a.status === 'active'
  );
  return active[0]?.projectId || null;
}

export function reviewOutletProposal(id, decision, note = '', projectId = null) {
  const actor = assertLoggedIn();
  const db = getDB();
  const row = (db.outletProposals || []).find(p => p.id === id);
  if (!row) throw new Error('Pengajuan toko tidak ditemukan.');
  if (row.status !== 'pending') throw new Error('Pengajuan sudah diputuskan.');
  const ok = decision === 'approved' ? 'approved' : 'rejected';
  if (actor.role === 'supervisor') {
    row.supervisorStatus = ok;
    row.supervisorId = actor.id;
    row.supervisorAt = new Date().toISOString();
    row.supervisorNote = sanitizePlainText(note);
  } else if (isProjectAdminRole(actor.role)) {
    row.managerStatus = ok;
    row.managerId = actor.id;
    row.managerAt = new Date().toISOString();
    row.managerNote = sanitizePlainText(note);
  } else {
    throw new Error('Akses ditolak');
  }
  if (projectId) row.projectId = projectId;
  if (row.supervisorStatus === 'rejected' || row.managerStatus === 'rejected') {
    row.status = 'rejected';
    const existing = (db.outlets || []).find(o => o.id === row.outletId);
    if (existing) existing.status = 'inactive';
  } else if (row.supervisorStatus === 'approved' && row.managerStatus === 'approved') {
    row.status = 'approved';
    let outlet = (db.outlets || []).find(o => o.id === row.outletId);
    if (!outlet) {
      outlet = {
        id: uid('OUT'),
        outletNumber: row.outletNumber || nextOutletNumber(db),
        status: 'active',
        name: row.name,
        address: row.address,
        type: row.type,
        channel: row.channel,
        ownership: row.ownership || '',
        area: row.area || row.city,
        phone: row.phone,
        owner: row.owner,
        lat: row.lat,
        lng: row.lng,
        organizationId: row.organizationId,
        projectIds: row.projectId ? [row.projectId] : [],
        clientId: (db.projects || []).find(p => p.id === row.projectId)?.clientId || null,
      };
      db.outlets.push(outlet);
      row.outletId = outlet.id;
    } else {
      outlet.status = 'active';
      outlet.ownership = row.ownership || outlet.ownership;
      outlet.channel = row.channel || outlet.channel;
      outlet.type = row.type || outlet.type;
    }
  }
  saveDB();
  return row;
}

export function getVisits() {
  const rows = scoped(getDB().visits);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(v => ids.has(v.employeeId));
}

export function getVisitsByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getVisits().filter(v => v.employeeId === empId);
}

export function getVisitsByOutlet(outletId) {
  return getVisits().filter(v => v.outletId === outletId);
}

export function getVisitsByDate(date) {
  return getVisits().filter(v => v.date === date);
}

export function createVisit(data) {
  assertCanAccessEmployee(data.employeeId);
  assertOperationalContext(getDB(), data);
  const visit = { id: uid('VIS'), rating: 0, notes: '', checkInTime: null, checkOutTime: null, status: 'planned', ...withOrg(data) };
  getDB().visits.push(visit);
  saveDB();
  return visit;
}

export function updateVisit(id, data) {
  const db = getDB();
  const idx = db.visits.findIndex(v => v.id === id);
  if (idx === -1) return null;
  assertCanAccessEmployee(db.visits[idx].employeeId);
  if (data.employeeId && data.employeeId !== db.visits[idx].employeeId) {
    assertCanAccessEmployee(data.employeeId);
  }
  db.visits[idx] = { ...db.visits[idx], ...data };
  saveDB();
  return db.visits[idx];
}

export function deleteVisit(id) {
  assertLoggedIn();
  const db = getDB();
  const visit = (db.visits || []).find(v => v.id === id);
  if (!visit) return;
  assertCanAccessEmployee(visit.employeeId);
  db.visits = db.visits.filter(v => v.id !== id);
  saveDB();
}

export function visitDay(visit) {
  return String(visit?.date || visit?.visitDate || '').slice(0, 10);
}

export function getVisitsOnDate(date, employeeId = null) {
  return getVisits().filter(v => visitDay(v) === date && (!employeeId || v.employeeId === employeeId));
}

export function getVisitLocations(employeeId) {
  return getVisits()
    .filter(v => v.employeeId === employeeId && v.checkInTime)
    .sort((a, b) => `${b.date || ''} ${b.checkInTime || ''}`.localeCompare(`${a.date || ''} ${a.checkInTime || ''}`));
}

export function getAttendancePoints() {
  const rows = scoped(getDB().attendancePoints || []);
  if (rows.length) return rows;
  const org = getOrganization();
  return [{
    id: 'APT-OFFICE',
    organizationId: getCurrentOrgId(),
    type: 'office',
    name: org?.name ? `Kantor ${org.name}` : 'Kantor',
    address: [org?.city, org?.province].filter(Boolean).join(', '),
    builtIn: true,
  }];
}

export function createAttendancePoint(data) {
  const actor = assertLoggedIn();
  if (!isProjectAdminRole(actor.role) && actor.role !== 'supervisor') throw new Error('Akses ditolak');
  const point = {
    id: uid('APT'),
    type: ['office', 'meeting', 'store', 'point'].includes(data.type) ? data.type : 'point',
    name: sanitizePlainText(data.name),
    address: sanitizePlainText(data.address || ''),
    outletId: data.outletId || null,
    lat: data.lat === '' || data.lat == null ? null : Number(data.lat),
    lng: data.lng === '' || data.lng == null ? null : Number(data.lng),
    radiusM: data.radiusM === '' || data.radiusM == null ? null : Number(data.radiusM),
    ...withOrg(data),
    createdBy: actor.id,
  };
  if (!point.name) throw new Error('Nama titik absensi wajib diisi.');
  const db = getDB();
  db.attendancePoints = db.attendancePoints || [];
  db.attendancePoints.push(point);
  saveDB();
  return point;
}

export function getAttendance() {
  const rows = scoped(getDB().attendance);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(a => ids.has(a.employeeId));
}

export function getAttendanceByDate(date) {
  return getAttendance().filter(a => a.date === date);
}

export function getAttendanceByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getAttendance().filter(a => a.employeeId === empId);
}

export function createAttendance(data) {
  assertCanAccessEmployee(data.employeeId);
  const att = { id: uid('ATT'), ...withOrg(data) };
  getDB().attendance.push(att);
  saveDB();
  return att;
}

export function updateAttendance(id, data) {
  const db = getDB();
  const idx = db.attendance.findIndex(a => a.id === id);
  if (idx === -1) return null;
  assertCanAccessEmployee(db.attendance[idx].employeeId);
  db.attendance[idx] = { ...db.attendance[idx], ...data };
  saveDB();
  return db.attendance[idx];
}

export function clockInAttendance(employeeId) {
  assertCanAccessEmployee(employeeId);
  const actor = getActor();
  if (actor.role === 'employee' && actor.employeeId !== employeeId) throw new Error('Akses ditolak');
  const today = todayISO();
  const existing = getAttendance().find(a => a.employeeId === employeeId && a.date === today);
  if (existing?.checkInTime) throw new Error('Sudah absen masuk hari ini');
  const policy = getAttendancePolicy();
  const now = new Date();
  const time = now.toTimeString().slice(0, 5);
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false,
  }).format(now));
  if (existing) {
    return updateAttendance(existing.id, {
      checkInTime: time,
      status: hour >= 9 ? 'terlambat' : 'hadir',
      checkInLocation: existing.checkInLocation || policy.officeName || 'Kantor',
      locationType: existing.locationType || policy.mode || 'office',
    });
  }
  return createAttendance({
    employeeId,
    date: today,
    checkInTime: time,
    checkOutTime: null,
    status: hour >= 9 ? 'terlambat' : 'hadir',
    checkInLocation: policy.officeName || 'Kantor',
    locationType: policy.mode || 'office',
  });
}

export function clockOutAttendance(employeeId) {
  assertCanAccessEmployee(employeeId);
  const actor = getActor();
  if (actor.role === 'employee' && actor.employeeId !== employeeId) throw new Error('Akses ditolak');
  const today = todayISO();
  const existing = getAttendance().find(a => a.employeeId === employeeId && a.date === today);
  if (!existing?.checkInTime) throw new Error('Belum absen masuk');
  if (existing.checkOutTime) throw new Error('Sudah absen pulang');
  const time = new Date().toTimeString().slice(0, 5);
  return updateAttendance(existing.id, { checkOutTime: time });
}

export function getDashboardStats() {
  const employees = getEmployees();
  const outlets = getOutlets();
  const visits = getVisits();
  const attendance = getAttendance();
  const products = getProducts();
  const stocks = getStocks();
  const leaves = getLeaves();
  const competitors = getCompetitors();
  const intel = getCompetitorIntel();
  const today = todayISO();
  const todayVisits = visits.filter(v => v.date === today);
  const completedVisits = todayVisits.filter(v => v.status === 'completed');
  const activeVisits = todayVisits.filter(v => v.status === 'checked-in');
  const plannedVisits = todayVisits.filter(v => v.status === 'planned');
  const activeEmployees = employees.filter(e => e.status === 'active');
  const todayAttendance = attendance.filter(a => a.date === today);
  const hadir = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'hadir');
  const terlambat = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'terlambat');
  const tidakHadir = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'tidak hadir');

  return {
    totalEmployees: employees.length,
    activeEmployees: activeEmployees.length,
    totalOutlets: outlets.length,
    activeOutlets: outlets.filter(o => o.status === 'active').length,
    todayVisits: todayVisits.length,
    completedVisits: completedVisits.length,
    activeVisits: activeVisits.length,
    plannedVisits: plannedVisits.length,
    totalVisits: visits.length,
    attendanceHadir: hadir.length,
    attendanceTerlambat: terlambat.length,
    attendanceTidakHadir: tidakHadir.length,
    avgRating: (() => {
      const rated = todayVisits.filter(v => v.rating > 0);
      if (rated.length === 0) return 0;
      return (rated.reduce((s, v) => s + v.rating, 0) / rated.length).toFixed(1);
    })(),
    totalProducts: products.length,
    activeProducts: products.filter(p => p.status === 'active').length,
    totalStocks: stocks.length,
    lowStocks: stocks.filter(s => s.quantity <= s.minStock).length,
    pendingLeaves: leaves.filter(l => l.status === 'pending').length,
    approvedLeaves: leaves.filter(l => l.status === 'approved').length,
    rejectedLeaves: leaves.filter(l => l.status === 'rejected').length,
    totalCompetitors: competitors.length,
    totalCompetitorIntel: intel.length,
    intelWithPromo: intel.filter(i => i.hasPromo).length,
  };
}

export function getProductSales() {
  const rows = scoped(getDB().productSales || []);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(s => ids.has(s.employeeId));
}

export function createProductSale(data) {
  assertCanAccessEmployee(data.employeeId);
  const qty = Number(data.qty);
  const unitPrice = Number(data.unitPrice);
  if (!data.productId) throw new Error('Product is required');
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than 0');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Unit price is required');
  const sale = {
    id: uid('SAL'),
    employeeId: data.employeeId,
    productId: data.productId,
    outletId: data.outletId || null,
    qty,
    unitPrice,
    amount: Math.round(qty * unitPrice),
    date: data.date || todayISO(),
    notes: sanitizePlainText(data.notes || ''),
    ...withOrg(data),
    createdAt: new Date().toISOString(),
  };
  const db = getDB();
  db.productSales = db.productSales || [];
  db.productSales.push(sale);
  saveDB();
  return sale;
}

export function deleteProductSale(id) {
  const db = getDB();
  const idx = (db.productSales || []).findIndex(s => s.id === id);
  if (idx === -1) return null;
  assertCanAccessEmployee(db.productSales[idx].employeeId);
  const [removed] = db.productSales.splice(idx, 1);
  saveDB();
  return removed;
}

export function monthSalesAmount(employeeId, month = todayISO().slice(0, 7)) {
  return getProductSales()
    .filter(s => s.employeeId === employeeId && String(s.date || '').startsWith(month))
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
}

export function getProducts() {
  return scoped(getDB().products);
}

export function getProduct(id) {
  return getProducts().find(p => p.id === id);
}

export function createProduct(data) {
  assertProjectAdmin();
  const db = getDB();
  const scope = normalizeEntityScope(db, data);
  const product = {
    id: uid('PRD'),
    status: 'active',
    brand: '',
    cost: null,
    margin: null,
    ...withOrg(data),
    ...scope,
  };
  delete product.projectId;
  if (product.price != null) product.price = Number(product.price);
  if (product.cost === '' || product.cost == null) product.cost = null;
  else product.cost = Number(product.cost);
  if (product.margin === '' || product.margin == null) product.margin = null;
  else product.margin = Number(product.margin);
  db.products.push(product);
  saveDB();
  return product;
}

export function updateProduct(id, data) {
  assertProjectAdmin();
  const db = getDB();
  const idx = db.products.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const next = {
    ...db.products[idx],
    ...data,
    ...normalizeEntityScope(db, { ...db.products[idx], ...data }),
  };
  delete next.projectId;
  if (next.price != null) next.price = Number(next.price);
  if (next.cost === '' || next.cost == null) next.cost = null;
  else next.cost = Number(next.cost);
  if (next.margin === '' || next.margin == null) next.margin = null;
  else next.margin = Number(next.margin);
  db.products[idx] = next;
  saveDB();
  return db.products[idx];
}

export function deleteProduct(id) {
  assertProjectAdmin();
  const db = getDB();
  db.products = db.products.filter(p => p.id !== id);
  saveDB();
}

export function getLeaves() {
  const rows = scoped(getDB().leaves);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(l => ids.has(l.employeeId));
}

export function getLeavesByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getLeaves().filter(l => l.employeeId === empId);
}

export function getLeaveTypes() {
  return getDB().leaveTypes;
}

export function createLeave(data) {
  assertCanAccessEmployee(data.employeeId);
  const actor = getActor();
  if (actor.role === 'employee' && data.employeeId !== actor.employeeId) throw new Error('Akses ditolak');
  const leave = { id: uid('LV'), status: 'pending', submittedAt: new Date().toISOString().slice(0,10), approverId: null, approvedAt: null, ...withOrg(data) };
  getDB().leaves.push(leave);
  saveDB();
  return leave;
}

export function updateLeave(id, data) {
  const db = getDB();
  const idx = db.leaves.findIndex(l => l.id === id);
  if (idx === -1) return null;
  const actor = assertLoggedIn();
  const current = db.leaves[idx];
  assertCanAccessEmployee(current.employeeId);
  const nextStatus = data.status || current.status;
  if (nextStatus !== current.status && !isProjectAdminRole(actor.role) && actor.role !== 'supervisor') {
    throw new Error('Akses ditolak');
  }
  db.leaves[idx] = { ...current, ...data };
  saveDB();
  return db.leaves[idx];
}

export function deleteLeave(id) {
  assertLoggedIn();
  const db = getDB();
  const leave = (db.leaves || []).find(l => l.id === id);
  if (!leave) return;
  const actor = assertLoggedIn();
  if (!isProjectAdminRole(actor.role) && leave.employeeId !== actor.employeeId) {
    throw new Error('Akses ditolak');
  }
  db.leaves = db.leaves.filter(l => l.id !== id);
  saveDB();
}

function scopedEmployeeRows(key) {
  const rows = scoped(getDB()[key] || []);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(row => ids.has(row.employeeId));
}

function createEmployeeRequest(key, prefix, data, extra = {}) {
  assertCanAccessEmployee(data.employeeId);
  const actor = getActor();
  if (actor.role === 'employee' && data.employeeId !== actor.employeeId) throw new Error('Akses ditolak');
  const row = {
    id: uid(prefix),
    status: extra.status || 'pending',
    submittedAt: new Date().toISOString().slice(0, 10),
    approverId: null,
    approvedAt: null,
    reason: sanitizePlainText(data.reason || ''),
    employeeId: data.employeeId,
    ...extra,
    ...withOrg({ employeeId: data.employeeId }),
  };
  const db = getDB();
  db[key] = db[key] || [];
  db[key].push(row);
  saveDB();
  return row;
}

function updateEmployeeRequest(key, id, data) {
  const db = getDB();
  const list = db[key] || [];
  const idx = list.findIndex(row => row.id === id);
  if (idx === -1) return null;
  const actor = assertLoggedIn();
  const current = list[idx];
  assertCanAccessEmployee(current.employeeId);
  const nextStatus = data.status || current.status;
  if (nextStatus !== current.status && !['manager', 'supervisor', 'superadmin'].includes(actor.role)) {
    throw new Error('Akses ditolak');
  }
  list[idx] = { ...current, ...data };
  saveDB();
  return list[idx];
}

export function getOvertimes() {
  return scopedEmployeeRows('overtimes');
}

export function getOvertimesByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getOvertimes().filter(row => row.employeeId === empId);
}

export function createOvertime(data) {
  const hours = Number(data.hours);
  if (!data.date) throw new Error('Tanggal lembur wajib diisi');
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Jam lembur harus lebih dari 0');
  return createEmployeeRequest('overtimes', 'OT', data, {
    date: data.date,
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    hours,
  });
}

export function updateOvertime(id, data) {
  return updateEmployeeRequest('overtimes', id, data);
}

export function getWfhRequests() {
  return scopedEmployeeRows('wfhRequests');
}

export function getWfhRequestsByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getWfhRequests().filter(row => row.employeeId === empId);
}

export function createWfhRequest(data) {
  if (!data.date) throw new Error('Tanggal WFH wajib diisi');
  return createEmployeeRequest('wfhRequests', 'WFH', data, { date: data.date });
}

export function updateWfhRequest(id, data) {
  return updateEmployeeRequest('wfhRequests', id, data);
}

export function getDailyReports() {
  return scopedEmployeeRows('dailyReports');
}

export function getDailyReportsByEmployee(empId) {
  if (!canAccessEmployee(empId)) return [];
  return getDailyReports().filter(row => row.employeeId === empId);
}

export function createDailyReport(data) {
  if (!data.summary) throw new Error('Isi laporan harian');
  return createEmployeeRequest('dailyReports', 'DR', data, {
    date: data.date || todayISO(),
    summary: sanitizePlainText(data.summary || ''),
    blockers: sanitizePlainText(data.blockers || ''),
    planTomorrow: sanitizePlainText(data.planTomorrow || ''),
    status: 'submitted',
  });
}

export function getNewsItems() {
  return [...(getDB().newsItems || [])].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
  });
}

export function getHrContacts() {
  return getDB().hrContacts || [];
}

export function getStocks() {
  return scoped(getDB().stocks);
}

export function getStocksByOutlet(outletId) {
  return getStocks().filter(s => s.outletId === outletId);
}

export function getStocksByProduct(productId) {
  return getStocks().filter(s => s.productId === productId);
}

export function createStock(data) {
  assertLoggedIn();
  assertOperationalContext(getDB(), data, { product: true });
  const stock = { id: uid('STK'), lastUpdated: new Date().toISOString().slice(0,10), ...withOrg(data) };
  getDB().stocks.push(stock);
  saveDB();
  return stock;
}

export function updateStock(id, data) {
  const actor = assertLoggedIn();
  const db = getDB();
  const current = getStocks().find(s => s.id === id);
  if (!current) return null;
  const idx = db.stocks.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const owner = current.updatedBy || current.employeeId || current.recordedBy;
  if (owner) assertCanAccessEmployee(owner);
  else if (!isProjectAdminRole(actor.role)) throw new Error('Akses ditolak');
  db.stocks[idx] = {
    ...db.stocks[idx],
    ...data,
    lastUpdated: new Date().toISOString().slice(0, 10),
    updatedBy: actor.employeeId || actor.id,
  };
  saveDB();
  return db.stocks[idx];
}

export function deleteStock(id) {
  assertProjectAdmin();
  const db = getDB();
  db.stocks = db.stocks.filter(s => s.id !== id);
  saveDB();
}

export function getPriceObservations() {
  return scoped(getDB().priceObservations || []);
}

export function getPriceObservationsByOutlet(outletId) {
  return getPriceObservations().filter(p => p.outletId === outletId);
}

export function getPriceObservationsByVisit(visitId) {
  return getPriceObservations().filter(p => p.visitId === visitId);
}

export function getPriceObservationsByEmployee(empId) {
  return getPriceObservations().filter(p => p.recordedBy === empId);
}

export function createPriceObservation(data) {
  assertLoggedIn();
  assertOperationalContext(getDB(), data, { product: true });
  const obs = {
    id: uid('PRC'),
    observedPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    notes: '',
    recordedAt: new Date().toISOString().slice(0,10),
    ...withOrg(data),
  };
  getDB().priceObservations.push(obs);
  saveDB();
  return obs;
}

export function updatePriceObservation(id, data) {
  assertLoggedIn();
  const db = getDB();
  const idx = db.priceObservations.findIndex(p => p.id === id);
  if (idx === -1) return null;
  db.priceObservations[idx] = { ...db.priceObservations[idx], ...data };
  saveDB();
  return db.priceObservations[idx];
}

export function deletePriceObservation(id) {
  assertProjectAdmin();
  const db = getDB();
  db.priceObservations = db.priceObservations.filter(p => p.id !== id);
  saveDB();
}

export function getCompetitors() {
  return scoped(getDB().competitors || []);
}

export function getCompetitor(id) {
  return getCompetitors().find(c => c.id === id);
}

export function createCompetitor(data) {
  assertProjectAdmin();
  const c = {
    id: uid('CMP'),
    status: 'active',
    color: '#64748b',
    category: '',
    notes: '',
    ...withOrg(data),
  };
  getDB().competitors.push(c);
  saveDB();
  return c;
}

export function updateCompetitor(id, data) {
  assertProjectAdmin();
  const db = getDB();
  const idx = db.competitors.findIndex(c => c.id === id);
  if (idx === -1) return null;
  db.competitors[idx] = { ...db.competitors[idx], ...data };
  saveDB();
  return db.competitors[idx];
}

export function deleteCompetitor(id) {
  assertProjectAdmin();
  const db = getDB();
  db.competitors = db.competitors.filter(c => c.id !== id);
  db.competitorProducts = (db.competitorProducts || []).filter(p => p.competitorId !== id);
  saveDB();
}

export function getCompetitorProducts() {
  return scoped(getDB().competitorProducts || []);
}

export function getCompetitorProductsByCompetitor(competitorId) {
  return getCompetitorProducts().filter(p => p.competitorId === competitorId);
}

export function createCompetitorProduct(data) {
  assertProjectAdmin();
  const p = {
    id: uid('CPD'),
    status: 'active',
    unit: 'pcs',
    typicalPrice: 0,
    sku: '',
    ...withOrg(data),
  };
  if (p.typicalPrice != null) p.typicalPrice = Number(p.typicalPrice);
  getDB().competitorProducts.push(p);
  saveDB();
  return p;
}

export function updateCompetitorProduct(id, data) {
  assertProjectAdmin();
  const db = getDB();
  const idx = db.competitorProducts.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const next = { ...db.competitorProducts[idx], ...data };
  if (next.typicalPrice != null) next.typicalPrice = Number(next.typicalPrice);
  db.competitorProducts[idx] = next;
  saveDB();
  return db.competitorProducts[idx];
}

export function deleteCompetitorProduct(id) {
  assertProjectAdmin();
  const db = getDB();
  db.competitorProducts = db.competitorProducts.filter(p => p.id !== id);
  saveDB();
}

export function getCompetitorIntel() {
  const rows = scoped(getDB().competitorIntel || []);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(i => ids.has(i.recordedBy) || ids.has(i.employeeId));
}

export function getCompetitorIntelByOutlet(outletId) {
  return getCompetitorIntel().filter(i => i.outletId === outletId);
}

export function getCompetitorIntelByVisit(visitId) {
  return getCompetitorIntel().filter(i => i.visitId === visitId);
}

export function getCompetitorIntelByEmployee(empId) {
  return getCompetitorIntel().filter(i => i.recordedBy === empId);
}

export function createCompetitorIntel(data) {
  const actor = assertLoggedIn();
  const owner = data.recordedBy || data.employeeId || actor.employeeId;
  if (actor.role === 'employee') {
    if (owner !== actor.employeeId) throw new Error('Akses ditolak');
  } else {
    assertCanAccessEmployee(owner);
  }
  assertOperationalContext(getDB(), data, { product: true });
  const intel = {
    id: uid('INT'),
    ourPrice: 0,
    competitorPrice: 0,
    shelfShare: 0,
    visibility: 'medium',
    hasPromo: false,
    promoType: '',
    promoNotes: '',
    notes: '',
    recordedAt: new Date().toISOString().slice(0, 10),
    ...withOrg(data),
  };
  intel.ourPrice = Number(intel.ourPrice) || 0;
  intel.competitorPrice = Number(intel.competitorPrice) || 0;
  intel.shelfShare = Number(intel.shelfShare) || 0;
  intel.hasPromo = !!(intel.hasPromo || intel.promo) && intel.hasPromo !== 'false';
  if (!intel.hasPromo) {
    intel.promoType = '';
  } else {
    intel.promoType = intel.promoType || '';
  }
  intel.promoNotes = intel.promoNotes != null ? intel.promoNotes : (intel.promoNote || '');
  getDB().competitorIntel.push(intel);
  saveDB();
  return intel;
}

export function updateCompetitorIntel(id, data) {
  const actor = assertLoggedIn();
  const db = getDB();
  const current = getCompetitorIntel().find(i => i.id === id);
  if (!current) return null;
  const idx = db.competitorIntel.findIndex(i => i.id === id);
  if (idx === -1) return null;
  const owner = current.recordedBy || current.employeeId;
  if (owner) assertCanAccessEmployee(owner);
  else if (!isProjectAdminRole(actor.role)) throw new Error('Akses ditolak');
  const next = { ...db.competitorIntel[idx], ...data };
  if (next.ourPrice != null) next.ourPrice = Number(next.ourPrice);
  if (next.competitorPrice != null) next.competitorPrice = Number(next.competitorPrice);
  if (next.shelfShare != null) next.shelfShare = Number(next.shelfShare);
  if (next.hasPromo != null) next.hasPromo = !!next.hasPromo && next.hasPromo !== 'false';
  if (next.promo != null) next.hasPromo = !!next.promo;
  if (!next.hasPromo) next.promoType = next.promoType || '';
  db.competitorIntel[idx] = next;
  saveDB();
  return db.competitorIntel[idx];
}

export function getPromoTypes() {
  const list = getDB().promoTypes;
  if (!list || !list.length) return JSON.parse(JSON.stringify(seedPromoTypes));
  return list;
}

export function getPromoTypeLabel(code, customNote = '') {
  if (!code) return '';
  const t = getPromoTypes().find(p => p.code === code);
  if (!t) return code;
  if (code === 'custom' && customNote) return customNote;
  return t.label;
}

export const FIELD_PHOTO_TYPES = [
  { code: 'location',   label: 'Lokasi (tampak toko)' },
  { code: 'product',    label: 'Produk' },
  { code: 'shelf',      label: 'Rak / Display' },
  { code: 'competitor', label: 'Kompetitor' },
];

export function getFieldPhotos() {
  const rows = scoped(getDB().fieldPhotos || []);
  const actor = getActor();
  if (!actor || isOrgAdminRole(actor.role)) return rows;
  const ids = visibleEmployeeIds(actor);
  return rows.filter(p => ids.has(p.employeeId) || ids.has(p.recordedBy));
}

export function getFieldPhotosByEmployee(empId) {
  return getFieldPhotos().filter(p => p.recordedBy === empId || p.employeeId === empId);
}

export function getFieldPhotosByOutlet(outletId) {
  return getFieldPhotos().filter(p => p.outletId === outletId);
}

export function getFieldPhotosByVisit(visitId) {
  return getFieldPhotos().filter(p => p.visitId === visitId);
}

export function getAccessibleFieldPhotos(empId, isManagerRole) {
  if (isManagerRole) return getFieldPhotos();
  if (!empId) return [];
  return getFieldPhotosByEmployee(empId);
}

export function createFieldPhoto(data) {
  const actor = assertLoggedIn();
  const owner = data.employeeId || data.recordedBy || actor.employeeId;
  if (actor.role === 'employee') {
    if (owner !== actor.employeeId) throw new Error('Akses ditolak');
  } else if (actor.role !== 'manager') {
    assertCanAccessEmployee(owner);
  }
  assertOperationalContext(getDB(), data, { product: !!data.productId });
  const photo = {
    id: uid('PHO'),
    visitId: null,
    outletId: '',
    type: 'location',
    caption: '',
    productId: null,
    competitorId: null,
    dataUrl: null,
    recordedAt: new Date().toISOString(),
    ...withOrg(data),
  };
  if (!photo.productId) photo.productId = null;
  if (!photo.competitorId) photo.competitorId = null;
  getDB().fieldPhotos.push(photo);
  saveDB();
  return photo;
}

export function updateFieldPhoto(id, data) {
  const db = getDB();
  const idx = db.fieldPhotos.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const owner = db.fieldPhotos[idx].employeeId || db.fieldPhotos[idx].recordedBy;
  if (owner) assertCanAccessEmployee(owner);
  db.fieldPhotos[idx] = { ...db.fieldPhotos[idx], ...data };
  saveDB();
  return db.fieldPhotos[idx];
}

export function deleteFieldPhoto(id) {
  assertLoggedIn();
  const db = getDB();
  const photo = (db.fieldPhotos || []).find(p => p.id === id);
  if (!photo) return;
  const owner = photo.employeeId || photo.recordedBy;
  if (owner) assertCanAccessEmployee(owner);
  db.fieldPhotos = db.fieldPhotos.filter(p => p.id !== id);
  saveDB();
}

export function deleteCompetitorIntel(id) {
  assertLoggedIn();
  const db = getDB();
  const intel = (db.competitorIntel || []).find(i => i.id === id);
  const owner = intel?.recordedBy || intel?.employeeId;
  if (owner) assertCanAccessEmployee(owner);
  db.competitorIntel = db.competitorIntel.filter(i => i.id !== id);
  saveDB();
}

export function getCompetitorAnalysisSummary() {
  const competitors = getCompetitors();
  const products = getCompetitorProducts();
  const intel = getCompetitorIntel();

  return competitors.map(c => {
    const cpdIds = products.filter(p => p.competitorId === c.id).map(p => p.id);
    const rows = intel.filter(i => cpdIds.includes(i.competitorProductId));
    if (rows.length === 0) {
      return {
        competitorId: c.id,
        name: c.name,
        color: c.color,
        category: c.category,
        status: c.status,
        intelCount: 0,
        avgPriceGap: 0,
        avgShelfShare: 0,
        promoCount: 0,
        cheaperCount: 0,
        moreExpensiveCount: 0,
      };
    }
    let gapSum = 0;
    let shareSum = 0;
    let promoCount = 0;
    let cheaperCount = 0;
    let moreExpensiveCount = 0;
    rows.forEach(r => {
      const gap = r.ourPrice - r.competitorPrice;
      gapSum += gap;
      shareSum += r.shelfShare || 0;
      if (r.hasPromo) promoCount++;
      if (r.competitorPrice < r.ourPrice) cheaperCount++;
      if (r.competitorPrice > r.ourPrice) moreExpensiveCount++;
    });
    return {
      competitorId: c.id,
      name: c.name,
      color: c.color,
      category: c.category,
      status: c.status,
      intelCount: rows.length,
      avgPriceGap: Math.round(gapSum / rows.length),
      avgShelfShare: Math.round(shareSum / rows.length),
      promoCount,
      cheaperCount,
      moreExpensiveCount,
    };
  });
}

export function getVisitedOutletIds(empId) {
  const db = getDB();
  const fromVisits = (db.visits || []).filter(v => !empId || v.employeeId === empId).map(v => v.outletId);
  const projectIds = new Set((db.projectAssignments || [])
    .filter(a => a.employeeId === empId && a.status === 'active')
    .map(a => a.projectId));
  const fromProjects = (db.outlets || [])
    .filter(o => o.status !== 'inactive' && ((o.projectIds || []).some(id => projectIds.has(id)) || projectIds.has(o.projectId)))
    .map(o => o.id);
  const fromMine = (db.outlets || [])
    .filter(o => o.status !== 'inactive' && (o.createdBy === empId || o.submittedBy === empId))
    .map(o => o.id);
  return [...new Set([...fromVisits, ...fromProjects, ...fromMine].filter(Boolean))];
}

export function getProductsForVisitedOutlets(empId) {
  const visited = getVisitedOutletIds(empId);
  if (!visited.length) return [];
  const productIds = new Set(
    getDB().stocks.filter(s => visited.includes(s.outletId)).map(s => s.productId)
  );
  getPriceObservations().filter(p => visited.includes(p.outletId)).forEach(p => productIds.add(p.productId));
  getCompetitorIntel().filter(i => visited.includes(i.outletId)).forEach(i => productIds.add(i.productId));
  if (productIds.size === 0) {
    return getProducts().filter(p => p.status === 'active');
  }
  return getProducts().filter(p => productIds.has(p.id));
}

/** Best-effort storage usage for UI warnings */
export function getStorageEstimate() {
  try {
    const raw = localStorage.getItem(DB_KEY) || '';
    const bytes = new Blob([raw]).size;
    return { usedBytes: bytes, usedMB: (bytes / (1024 * 1024)).toFixed(2) };
  } catch (_) {
    return { usedBytes: 0, usedMB: '0' };
  }
}
