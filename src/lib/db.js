// ProQTrack — Local Database Layer (localStorage-backed)
// Simulates SQLite with full CRUD operations

import {
  seedEmployees, seedOutlets, seedVisits, seedAttendance, seedAccounts,
  seedProducts, seedLeaveTypes, seedLeaves, seedStocks, seedPriceObservations,
  seedCompetitors, seedCompetitorProducts, seedCompetitorIntel,
  seedPromoTypes, seedFieldPhotos,
} from '../data/seed.js';
import { uid, sanitizePlainText, todayISO, normalizeAttendanceStatus } from './utils.js';
import { defaultPortrait } from './avatars.js';

const DB_KEY = 'proqtrack_db_v6';
const LEGACY_KEYS = ['proqtrack_db_v5', 'proqtrack_db_v4', 'proqtrack_db_v3', 'proqtrack_db_v2', 'proqtrack_db_v1'];
const DB_VERSION = 10;
const ORG_KEY = 'proqtrack_current_org';
export const DEFAULT_ORG_ID = 'ORG-DEFAULT';

const normalizeEmail = value => String(value || '').trim().toLowerCase();
const accountRoleForEmployee = employee =>
  String(employee?.role || '').toLowerCase().includes('supervisor') ? 'supervisor' : 'employee';

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
    account = { id: uid('ACC'), employeeId: employee.id };
    db.accounts.push(account);
  }
  account.email = employee.email;
  account.name = employee.name;
  account.role = accountRoleForEmployee(employee);
  account.status = employee.status === 'active' ? 'active' : 'inactive';
  if (password) {
    if (String(password).length < 8) throw new Error('Password login minimal 8 karakter.');
    account.password = String(password);
  }
  return account;
}

function defaultDB() {
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
    appSettings: defaultAppSettings(),
    organizations: [defaultOrganization()],
    currentOrganizationId: DEFAULT_ORG_ID,
  };
}

export function defaultOrganization() {
  return {
    id: DEFAULT_ORG_ID,
    name: 'Organisasi Demo',
    legalName: 'ProQTrack Demo Tenant',
    code: 'DEMO',
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
  try {
    return localStorage.getItem(ORG_KEY) || DEFAULT_ORG_ID;
  } catch {
    return DEFAULT_ORG_ID;
  }
}

export function setCurrentOrgId(id) {
  const org = getOrganizations(false).find(o => o.id === id);
  if (!org) throw new Error('Organisasi tidak ditemukan.');
  const db = getDB();
  db.currentOrganizationId = id;
  try { localStorage.setItem(ORG_KEY, id); } catch { /* ignore */ }
  saveDB();
  return org;
}

export function getOrganizations(activeOnly = false) {
  const rows = getDB().organizations || [];
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
  return { organizationId: data.organizationId || getCurrentOrgId(), ...data, organizationId: data.organizationId || getCurrentOrgId() };
}

export function defaultAppSettings() {
  return {
    companyName: 'ProQTrack',
    companyLogo: './assets/logo-light.svg',
    timezone: 'Asia/Jakarta',
    compactTables: false,
    notifyLeave: true,
    notifyLowStock: true,
    updatedAt: null,
  };
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

function migrateDB(parsed) {
  const base = defaultDB();
  const out = { ...base, ...parsed, _version: DB_VERSION };

  for (const key of Object.keys(base)) {
    if (key === '_version') continue;
    if (!out[key] || !Array.isArray(out[key])) {
      out[key] = JSON.parse(JSON.stringify(base[key]));
    }
  }

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
  }));
  out.employees.forEach(employee => {
    const account = out.accounts.find(a => a.employeeId === employee.id);
    if (account) {
      account.email = employee.email;
      account.name = employee.name;
      account.role = accountRoleForEmployee(employee);
      account.status = employee.status === 'active' ? 'active' : 'inactive';
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

  out.accounts = out.accounts.map(account => ({
    status: 'active',
    lastLoginAt: null,
    mustChangePassword: false,
    ...account,
    email: normalizeEmail(account.email),
  }));
  out.appSettings = { ...defaultAppSettings(), ...(out.appSettings || {}) };
  if (!Array.isArray(out.organizations) || !out.organizations.length) {
    out.organizations = [defaultOrganization()];
  }
  out.currentOrganizationId = out.currentOrganizationId || DEFAULT_ORG_ID;
  const isDemoId = id => /^(ORG-DEFAULT$|CL-UAT|PRJ-UAT|ASN-UAT|EMP-UAT|OUT-UAT|ACC-UAT|CL00|PRJ00|EMP00|OUT00|ACC00)/.test(String(id || ''));
  const stamp = rows => Array.isArray(rows) ? rows.map(row => ({
    ...row,
    organizationId: isDemoId(row.id) ? DEFAULT_ORG_ID : (row.organizationId || DEFAULT_ORG_ID),
  })) : rows;
  ['employees','outlets','visits','attendance','accounts','products','leaves','stocks','priceObservations','competitors','competitorProducts','competitorIntel','fieldPhotos','clients','projects','projectAssignments'].forEach(key => {
    if (Array.isArray(out[key])) out[key] = stamp(out[key]);
  });

  return out;
}

let _cache = null;
if (typeof window !== 'undefined') {
  window.addEventListener('proqtrack:db-updated', () => { _cache = null; });
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
    localStorage.setItem(DB_KEY, JSON.stringify(_cache));
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

export function resetDB() {
  _cache = defaultDB();
  saveDB();
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch (_) { /* ignore */ }
  }
  return _cache;
}

export function getAccounts() {
  return scoped(getDB().accounts);
}

export function createOrganization(data) {
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

export function authenticate(email, password) {
  const db = getDB();
  const acc = db.accounts.find(a => a.email.toLowerCase() === email.toLowerCase().trim());
  if (!acc || acc.status === 'inactive' || acc.status === 'suspended' || acc.password !== password) return null;
  if (acc.employeeId) {
    const employee = getEmployee(acc.employeeId);
    if (!employee || employee.status !== 'active') return null;
  }
  acc.lastLoginAt = new Date().toISOString();
  if (acc.organizationId) {
    db.currentOrganizationId = acc.organizationId;
    try { localStorage.setItem(ORG_KEY, acc.organizationId); } catch { /* ignore */ }
  }
  saveDB();
  return acc;
}

function countActiveManagers(db, exceptId = null) {
  return db.accounts.filter(a =>
    a.role === 'manager' && a.status === 'active' && a.id !== exceptId
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

export function updateAppSettings(partial) {
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
  const db = getDB();
  const email = assertAccountEmail(db, data.email);
  if (!data.password || String(data.password).length < 8) {
    throw new Error('Password login minimal 8 karakter.');
  }
  const role = ['manager', 'supervisor', 'employee'].includes(data.role) ? data.role : 'employee';
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
    organizationId: getCurrentOrgId(),
    email,
    name: sanitizePlainText(data.name) || email,
    password: String(data.password),
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
  return account;
}

export function updateAccount(id, data) {
  const db = getDB();
  const idx = db.accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Akun tidak ditemukan.');
  const current = db.accounts[idx];
  const nextRole = data.role || current.role;
  const nextStatus = data.status || current.status;
  if (current.role === 'manager' && (nextRole !== 'manager' || nextStatus !== 'active')) {
    if (countActiveManagers(db, id) < 1) {
      throw new Error('Tidak bisa menonaktifkan atau menurunkan manager terakhir.');
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
    role: ['manager', 'supervisor', 'employee'].includes(nextRole) ? nextRole : current.role,
    status: ['active', 'inactive', 'suspended'].includes(nextStatus) ? nextStatus : current.status,
    employeeId,
    mustChangePassword: data.mustChangePassword ?? current.mustChangePassword,
    updatedAt: new Date().toISOString(),
  };
  if (data.password) db.accounts[idx].password = String(data.password);
  if (employeeId) {
    const employee = db.employees.find(e => e.id === employeeId);
    employee.email = email;
    employee.name = db.accounts[idx].name;
  }
  saveDB();
  return db.accounts[idx];
}

export function changePassword(accountId, currentPassword, nextPassword) {
  const db = getDB();
  const account = db.accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  if (account.password !== currentPassword) throw new Error('Password saat ini salah.');
  if (!nextPassword || String(nextPassword).length < 8) {
    throw new Error('Password baru minimal 8 karakter.');
  }
  if (nextPassword === currentPassword) throw new Error('Password baru harus berbeda.');
  account.password = String(nextPassword);
  account.mustChangePassword = false;
  account.passwordChangedAt = new Date().toISOString();
  saveDB();
  return true;
}

export function updateOwnProfile(accountId, data) {
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
  return account;
}

export function getEmployees() {
  return scoped(getDB().employees);
}

export function getEmployee(id) {
  return getDB().employees.find(e => e.id === id);
}

export function createEmployee(data) {
  const db = getDB();
  const email = assertUniqueEmail(db, data.email);
  const emp = {
    id: uid('EMP'), totalVisits: 0, todayVisits: 0, targetVisits: 6, status: 'active', photo: '',
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
  saveDB();
  return emp;
}

export function updateEmployee(id, data) {
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
  return scoped(getDB().outlets);
}

export function getOutlet(id) {
  return getDB().outlets.find(o => o.id === id);
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

function assertOperationalContext(db, data, { product = false } = {}) {
  if (!data.projectId) return;
  const project = db.projects?.find(p => p.id === data.projectId);
  if (!project || project.status !== 'active') throw new Error('Aktivitas memerlukan project aktif.');
  const employeeId = data.employeeId || data.recordedBy || data.updatedBy;
  if (employeeId && !db.projectAssignments?.some(a =>
    a.projectId === data.projectId &&
    a.employeeId === employeeId &&
    a.status === 'active'
  )) throw new Error('Karyawan tidak memiliki assignment aktif pada project ini.');
  if (data.outletId) {
    const outlet = db.outlets.find(o => o.id === data.outletId);
    if (!outlet?.projectIds?.includes(data.projectId)) {
      throw new Error('Outlet tidak terdaftar pada project ini.');
    }
  }
  if (product && data.productId) {
    const item = db.products.find(p => p.id === data.productId);
    if (!item?.projectIds?.includes(data.projectId)) {
      throw new Error('Produk tidak terdaftar pada project ini.');
    }
  }
}

export function createOutlet(data) {
  const db = getDB();
  const scope = normalizeEntityScope(db, data);
  const outlet = {
    id: uid('OUT'), status: 'active', ...withOrg(data), ...scope,
    name: sanitizePlainText(data.name),
    address: sanitizePlainText(data.address),
    owner: sanitizePlainText(data.owner),
    phone: sanitizePlainText(data.phone),
    area: sanitizePlainText(data.area),
  };
  delete outlet.projectId;
  db.outlets.push(outlet);
  saveDB();
  return outlet;
}

export function updateOutlet(id, data) {
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
  const db = getDB();
  db.outlets = db.outlets.filter(o => o.id !== id);
  saveDB();
}

export function getVisits() {
  return scoped(getDB().visits);
}

export function getVisitsByEmployee(empId) {
  return getDB().visits.filter(v => v.employeeId === empId);
}

export function getVisitsByOutlet(outletId) {
  return getDB().visits.filter(v => v.outletId === outletId);
}

export function getVisitsByDate(date) {
  return getVisits().filter(v => v.date === date);
}

export function createVisit(data) {
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
  db.visits[idx] = { ...db.visits[idx], ...data };
  saveDB();
  return db.visits[idx];
}

export function deleteVisit(id) {
  const db = getDB();
  db.visits = db.visits.filter(v => v.id !== id);
  saveDB();
}

export function getAttendance() {
  return scoped(getDB().attendance);
}

export function getAttendanceByDate(date) {
  return getDB().attendance.filter(a => a.date === date);
}

export function getAttendanceByEmployee(empId) {
  return getDB().attendance.filter(a => a.employeeId === empId);
}

export function createAttendance(data) {
  const att = { id: uid('ATT'), ...withOrg(data) };
  getDB().attendance.push(att);
  saveDB();
  return att;
}

export function updateAttendance(id, data) {
  const db = getDB();
  const idx = db.attendance.findIndex(a => a.id === id);
  if (idx === -1) return null;
  db.attendance[idx] = { ...db.attendance[idx], ...data };
  saveDB();
  return db.attendance[idx];
}

export function getDashboardStats() {
  const db = getDB();
  const today = todayISO();
  const todayVisits = db.visits.filter(v => v.date === today);
  const completedVisits = todayVisits.filter(v => v.status === 'completed');
  const activeVisits = todayVisits.filter(v => v.status === 'checked-in');
  const plannedVisits = todayVisits.filter(v => v.status === 'planned');
  const activeEmployees = db.employees.filter(e => e.status === 'active');
  const todayAttendance = db.attendance.filter(a => a.date === today);
  const hadir = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'hadir');
  const terlambat = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'terlambat');
  const tidakHadir = todayAttendance.filter(a => normalizeAttendanceStatus(a.status) === 'tidak hadir');
  const intel = db.competitorIntel || [];

  return {
    totalEmployees: db.employees.length,
    activeEmployees: activeEmployees.length,
    totalOutlets: db.outlets.length,
    activeOutlets: db.outlets.filter(o => o.status === 'active').length,
    todayVisits: todayVisits.length,
    completedVisits: completedVisits.length,
    activeVisits: activeVisits.length,
    plannedVisits: plannedVisits.length,
    totalVisits: db.visits.length,
    attendanceHadir: hadir.length,
    attendanceTerlambat: terlambat.length,
    attendanceTidakHadir: tidakHadir.length,
    avgRating: (() => {
      const rated = todayVisits.filter(v => v.rating > 0);
      if (rated.length === 0) return 0;
      return (rated.reduce((s, v) => s + v.rating, 0) / rated.length).toFixed(1);
    })(),
    totalProducts: db.products.length,
    activeProducts: db.products.filter(p => p.status === 'active').length,
    totalStocks: db.stocks.length,
    lowStocks: db.stocks.filter(s => s.quantity <= s.minStock).length,
    pendingLeaves: db.leaves.filter(l => l.status === 'pending').length,
    approvedLeaves: db.leaves.filter(l => l.status === 'approved').length,
    rejectedLeaves: db.leaves.filter(l => l.status === 'rejected').length,
    totalCompetitors: (db.competitors || []).length,
    totalCompetitorIntel: intel.length,
    intelWithPromo: intel.filter(i => i.hasPromo).length,
  };
}

export function getProducts() {
  return scoped(getDB().products);
}

export function getProduct(id) {
  return getDB().products.find(p => p.id === id);
}

export function createProduct(data) {
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
  const db = getDB();
  db.products = db.products.filter(p => p.id !== id);
  saveDB();
}

export function getLeaves() {
  return scoped(getDB().leaves);
}

export function getLeavesByEmployee(empId) {
  return getDB().leaves.filter(l => l.employeeId === empId);
}

export function getLeaveTypes() {
  return getDB().leaveTypes;
}

export function createLeave(data) {
  const leave = { id: uid('LV'), status: 'pending', submittedAt: new Date().toISOString().slice(0,10), approverId: null, approvedAt: null, ...withOrg(data) };
  getDB().leaves.push(leave);
  saveDB();
  return leave;
}

export function updateLeave(id, data) {
  const db = getDB();
  const idx = db.leaves.findIndex(l => l.id === id);
  if (idx === -1) return null;
  db.leaves[idx] = { ...db.leaves[idx], ...data };
  saveDB();
  return db.leaves[idx];
}

export function deleteLeave(id) {
  const db = getDB();
  db.leaves = db.leaves.filter(l => l.id !== id);
  saveDB();
}

export function getStocks() {
  return scoped(getDB().stocks);
}

export function getStocksByOutlet(outletId) {
  return getDB().stocks.filter(s => s.outletId === outletId);
}

export function getStocksByProduct(productId) {
  return getDB().stocks.filter(s => s.productId === productId);
}

export function createStock(data) {
  assertOperationalContext(getDB(), data, { product: true });
  const stock = { id: uid('STK'), lastUpdated: new Date().toISOString().slice(0,10), ...withOrg(data) };
  getDB().stocks.push(stock);
  saveDB();
  return stock;
}

export function updateStock(id, data) {
  const db = getDB();
  const idx = db.stocks.findIndex(s => s.id === id);
  if (idx === -1) return null;
  db.stocks[idx] = { ...db.stocks[idx], ...data, lastUpdated: new Date().toISOString().slice(0,10) };
  saveDB();
  return db.stocks[idx];
}

export function deleteStock(id) {
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
  assertOperationalContext(getDB(), data, { product: true });
  const obs = {
    id: uid('PRC'),
    observedPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    notes: '',
    recordedAt: new Date().toISOString().slice(0,10),
    ...data
  };
  getDB().priceObservations.push(obs);
  saveDB();
  return obs;
}

export function updatePriceObservation(id, data) {
  const db = getDB();
  const idx = db.priceObservations.findIndex(p => p.id === id);
  if (idx === -1) return null;
  db.priceObservations[idx] = { ...db.priceObservations[idx], ...data };
  saveDB();
  return db.priceObservations[idx];
}

export function deletePriceObservation(id) {
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
  const db = getDB();
  const idx = db.competitors.findIndex(c => c.id === id);
  if (idx === -1) return null;
  db.competitors[idx] = { ...db.competitors[idx], ...data };
  saveDB();
  return db.competitors[idx];
}

export function deleteCompetitor(id) {
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
  const p = {
    id: uid('CPD'),
    status: 'active',
    unit: 'pcs',
    typicalPrice: 0,
    sku: '',
    ...data,
  };
  if (p.typicalPrice != null) p.typicalPrice = Number(p.typicalPrice);
  getDB().competitorProducts.push(p);
  saveDB();
  return p;
}

export function updateCompetitorProduct(id, data) {
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
  const db = getDB();
  db.competitorProducts = db.competitorProducts.filter(p => p.id !== id);
  saveDB();
}

export function getCompetitorIntel() {
  return scoped(getDB().competitorIntel || []);
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
    ...data,
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
  const db = getDB();
  const idx = db.competitorIntel.findIndex(i => i.id === id);
  if (idx === -1) return null;
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
  return scoped(getDB().fieldPhotos || []);
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
  db.fieldPhotos[idx] = { ...db.fieldPhotos[idx], ...data };
  saveDB();
  return db.fieldPhotos[idx];
}

export function deleteFieldPhoto(id) {
  const db = getDB();
  db.fieldPhotos = db.fieldPhotos.filter(p => p.id !== id);
  saveDB();
}

export function deleteCompetitorIntel(id) {
  const db = getDB();
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
  const visits = getDB().visits.filter(v => v.employeeId === empId);
  return [...new Set(visits.map(v => v.outletId))];
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
