import { authHeaders, getApiToken } from './uploads.js';
import { getDB, persistDB } from './db.js';

async function apiJson(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: authHeaders({
      accept:'application/json',
      ...(options.body ? { 'content-type':'application/json' } : {}),
      ...(options.headers || {}),
    }),
  });
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

function upsertOrganization(row) {
  if (!row?.id) return null;
  const db = getDB();
  db.organizations = Array.isArray(db.organizations) ? db.organizations : [];
  const index = db.organizations.findIndex(candidate => String(candidate.id) === String(row.id));
  const next = {
    ...(index >= 0 ? db.organizations[index] : {}),
    ...row,
    cloudIdentity:true,
    cloudSyncedAt:new Date().toISOString(),
  };
  if (index >= 0) db.organizations[index] = next;
  else db.organizations.push(next);
  persistDB('cloud-organization-profile');
  return next;
}

function mergeOrganizations(rows = []) {
  const db = getDB();
  db.organizations = Array.isArray(db.organizations) ? db.organizations : [];
  const serverIds = new Set(rows.map(row => String(row.id)));
  db.organizations = db.organizations.filter(row =>
    serverIds.has(String(row.id)) || String(row.id) === String(db.currentOrganizationId || '')
  );
  for (const row of rows) upsertOrganization(row);
  persistDB('cloud-organizations');
  return rows;
}

export async function syncCloudOrganizations() {
  if (!getApiToken()) throw new Error('AUTH_REQUIRED');
  const data = await apiJson('/api/admin/organizations');
  return mergeOrganizations(data.organizations || []);
}

export async function syncCurrentOrganizationProfile(sessionToken = '') {
  const token = sessionToken || getApiToken();
  if (!token) return null;
  if (sessionToken && getApiToken() !== sessionToken) return null;
  const data = await apiJson('/api/organization/profile', {
    headers:{ authorization:`Bearer ${token}` },
  });
  if (sessionToken && getApiToken() !== sessionToken) return null;
  return upsertOrganization(data.organization);
}

export async function updateCurrentOrganizationProfile(payload) {
  if (!getApiToken()) throw new Error('AUTH_REQUIRED');
  const data = await apiJson('/api/organization/profile', {
    method:'PATCH',
    body:JSON.stringify(payload),
  });
  return upsertOrganization(data.organization);
}

export async function createCloudOrganization(payload) {
  const data = await apiJson('/api/admin/organizations', {
    method:'POST',
    body:JSON.stringify(payload),
  });
  mergeOrganizations([...(getDB().organizations || []).filter(row => row.id !== data.organization.id), data.organization]);
  return data.organization;
}

export async function updateCloudOrganization(id, payload) {
  const data = await apiJson(`/api/admin/organizations/${encodeURIComponent(id)}`, {
    method:'PATCH',
    body:JSON.stringify(payload),
  });
  const db = getDB();
  const rows = (db.organizations || []).map(row => row.id === data.organization.id ? data.organization : row);
  if (!rows.some(row => row.id === data.organization.id)) rows.push(data.organization);
  mergeOrganizations(rows);
  return data.organization;
}

if (typeof window !== 'undefined') {
  window.ProQOrganizations = {
    syncCloudOrganizations,
    syncCurrentOrganizationProfile,
    updateCurrentOrganizationProfile,
    createCloudOrganization,
    updateCloudOrganization,
  };
}
