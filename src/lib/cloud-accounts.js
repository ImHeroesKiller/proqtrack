import { authHeaders, getApiToken } from './uploads.js';
import { getCurrentOrgId, getDB, persistDB } from './db.js';
import { hashPassword } from './utils.js';

async function apiJson(path, options = {}) {
  const headers = authHeaders({
    accept: 'application/json',
    ...(options.body ? { 'content-type':'application/json' } : {}),
    ...(options.headers || {}),
  });
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || data.error || `HTTP ${res.status}`);
    error.code = data.error;
    error.status = res.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function activeOrgId() {
  return String(window.FT?.state?.account?.organizationId || getCurrentOrgId() || '');
}

function mergeServerAccounts(serverAccounts = [], passwordById = new Map()) {
  const db = getDB();
  const orgId = activeOrgId();
  const activeId = String(window.FT?.state?.account?.id || '');
  const existing = Array.isArray(db.accounts) ? db.accounts : (db.accounts = []);
  const serverIds = new Set(serverAccounts.map(row => String(row.id)));

  db.accounts = existing.filter(row =>
    row.role === 'superadmin'
    || String(row.organizationId || '') !== orgId
    || String(row.id) === activeId
    || serverIds.has(String(row.id))
  );

  for (const row of serverAccounts) {
    const index = db.accounts.findIndex(candidate =>
      String(candidate.id) === String(row.id)
      || (row.email && String(candidate.email || '').toLowerCase() === String(row.email).toLowerCase())
    );
    const previous = index >= 0 ? db.accounts[index] : {};
    const next = {
      ...previous,
      ...row,
      organizationId: row.organizationId || orgId,
      cloudIdentity: true,
      cloudSyncedAt: new Date().toISOString(),
    };
    if (passwordById.has(String(row.id))) next.password = hashPassword(passwordById.get(String(row.id)));
    if (row.deviceBound === false) {
      next.deviceId = null;
      next.deviceBinding = null;
      next.deviceImei = '';
      next.deviceLabel = row.deviceLabel || '';
      next.deviceUserAgent = '';
      next.devicePairedAt = null;
    } else if (row.deviceLabel) {
      next.deviceLabel = row.deviceLabel;
      next.devicePairedAt = row.devicePairedAt || next.devicePairedAt || null;
    }
    if (index >= 0) db.accounts[index] = next;
    else db.accounts.push(next);
  }
  persistDB('cloud-accounts');
  return serverAccounts;
}

export async function syncCloudAccounts() {
  if (!getApiToken()) throw new Error('AUTH_REQUIRED');
  const data = await apiJson('/api/admin/accounts');
  mergeServerAccounts(data.accounts || []);
  return data.accounts || [];
}

export async function createCloudAccount(payload) {
  const data = await apiJson('/api/admin/accounts', {
    method:'POST',
    body:JSON.stringify({ ...payload, attachExisting:true }),
  });
  const passwords = new Map();
  if (data.account?.id && payload.password && data.passwordUnchanged !== true) {
    passwords.set(String(data.account.id),String(payload.password));
  }
  mergeServerAccounts([data.account],passwords);
  return {
    ...data.account,
    attachedExisting:data.attachedExisting === true,
    passwordUnchanged:data.passwordUnchanged === true,
  };
}

export async function updateCloudAccount(id, payload) {
  const data = await apiJson(`/api/admin/accounts/${encodeURIComponent(id)}`, {
    method:'PATCH',
    body:JSON.stringify(payload),
  });
  const passwords = new Map();
  if (data.account?.id && payload.password) passwords.set(String(data.account.id),String(payload.password));
  mergeServerAccounts([data.account],passwords);
  return data.account;
}

export async function resetCloudAccountDevice(id) {
  await apiJson(`/api/admin/accounts/${encodeURIComponent(id)}/reset-device`, { method:'POST' });
  const db = getDB();
  const account = (db.accounts || []).find(row => String(row.id) === String(id));
  if (account) {
    account.deviceId = null;
    account.deviceBinding = null;
    account.deviceImei = '';
    account.deviceBound = false;
    account.deviceLabel = '';
    account.deviceUserAgent = '';
    account.devicePairedAt = null;
    account.deviceLastSeenAt = null;
    account.deviceResetAt = new Date().toISOString();
    persistDB('cloud-device-reset');
  }
  return true;
}

export async function changeCloudPassword(currentPassword, nextPassword) {
  const data = await apiJson('/api/auth/change-password', {
    method:'POST',
    body:JSON.stringify({ currentPassword, nextPassword }),
  });
  const db = getDB();
  const id = String(window.FT?.state?.account?.id || '');
  const account = (db.accounts || []).find(row => String(row.id) === id);
  if (account) {
    account.password = hashPassword(nextPassword);
    account.mustChangePassword = false;
    account.passwordChangedAt = new Date().toISOString();
    persistDB('cloud-password-change');
  }
  return data;
}

export async function updateCloudProfile({ email, name, phone = '', area = '' } = {}) {
  const data = await apiJson('/api/auth/profile', {
    method:'PATCH',
    body:JSON.stringify({ email, name, phone, area }),
  });
  const authoritative = data.account || {};
  const db = getDB();
  const id = String(window.FT?.state?.account?.id || '');
  const account = (db.accounts || []).find(row => String(row.id) === id);
  if (account) {
    Object.assign(account, {
      email:authoritative.email || email || account.email,
      name:authoritative.name || name || account.name,
      employeeId:authoritative.employeeId || account.employeeId || null,
      phone:authoritative.phone ?? phone ?? account.phone ?? '',
      area:authoritative.area ?? area ?? account.area ?? '',
      deviceBound:authoritative.deviceBound === true,
      deviceLabel:authoritative.deviceLabel || '',
      devicePairedAt:authoritative.devicePairedAt || null,
      deviceLastSeenAt:authoritative.deviceLastSeenAt || null,
      updatedAt:new Date().toISOString(),
    });
  }
  const employeeId = authoritative.employeeId || account?.employeeId;
  if (employeeId) {
    const employee = (db.employees || []).find(row => String(row.id) === String(employeeId));
    if (employee) {
      employee.email = authoritative.email || email || employee.email;
      employee.name = authoritative.name || name || employee.name;
      employee.phone = authoritative.phone ?? phone ?? employee.phone ?? '';
      employee.area = authoritative.area ?? area ?? employee.area ?? '';
    }
  }
  persistDB('cloud-profile');
  return authoritative;
}

if (typeof window !== 'undefined') {
  window.ProQAccounts = {
    syncCloudAccounts,
    createCloudAccount,
    updateCloudAccount,
    resetCloudAccountDevice,
    changeCloudPassword,
    updateCloudProfile,
  };
}
