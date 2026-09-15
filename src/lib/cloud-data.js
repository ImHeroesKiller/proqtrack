import { authHeaders, getApiToken, issueUploadSession, revokeApiSession } from './uploads.js';

export const CLOUD_COLLECTIONS = Object.freeze([
  'clients',
  'projects',
  'employees',
  'projectAssignments',
  'outlets',
  'visits',
  'attendance',
  'products',
  'productSales',
  'surveyTemplates',
  'surveyResponses',
  'projectProducts',
]);

const DB_KEY = 'proqtrack_db_v6';
const MIRROR_KEY = 'proqtrack_db_v7';
let ready = false;
let syncing = false;
let timer = null;
let revision = 0;
let cutoverMode = 'pending';
let baseline = {};
let queuedSnapshot = null;
let lastError = null;
let suppressStorageHook = false;
let storageHookInstalled = false;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotCollections(db, includeAccounts = false) {
  const out = {};
  for (const key of CLOUD_COLLECTIONS) out[key] = clone(Array.isArray(db?.[key]) ? db[key] : []);
  if (includeAccounts) out.accounts = clone(Array.isArray(db?.accounts) ? db.accounts : []);
  return out;
}

function asMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = row?.id || (row?.projectId && row?.productId ? `${row.projectId}:${row.productId}` : '');
    if (key) map.set(String(key), row);
  }
  return map;
}

function diffSnapshots(previous = {}, current = {}) {
  const changes = [];
  for (const entity of CLOUD_COLLECTIONS) {
    const before = asMap(previous[entity]);
    const after = asMap(current[entity]);
    for (const [id, row] of after.entries()) {
      const old = before.get(id);
      if (!old || stable(old) !== stable(row)) changes.push({ entity, op: 'upsert', row });
    }
    for (const [id, row] of before.entries()) {
      if (!after.has(id)) changes.push({ entity, op: 'delete', row });
    }
  }
  return changes;
}

function applyChanges(target, changes) {
  const next = clone(target);
  for (const change of changes) {
    if (!Array.isArray(next[change.entity])) next[change.entity] = [];
    const rows = next[change.entity];
    const keyOf = row => String(row?.id || (row?.projectId && row?.productId ? `${row.projectId}:${row.productId}` : ''));
    const key = keyOf(change.row);
    const index = rows.findIndex(row => keyOf(row) === key);
    if (change.op === 'delete') {
      if (index >= 0) rows.splice(index, 1);
    } else if (index >= 0) rows[index] = clone(change.row);
    else rows.push(clone(change.row));
  }
  return next;
}

function emitStatus(status, detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('proqtrack:cloud-status', {
    detail: { status, ready, syncing, revision, cutoverMode, error: lastError, ...detail },
  }));
}

function rememberCutover(organizationId) {
  try {
    if (organizationId && cutoverMode === 'cloud') localStorage.setItem(`proqtrack_cloud_cutover_${organizationId}`, 'cloud');
  } catch { /* ignore */ }
}

export function isCloudCutoverRemembered(organizationId) {
  try { return localStorage.getItem(`proqtrack_cloud_cutover_${organizationId}`) === 'cloud'; } catch { return false; }
}

function persistLocalCache(db) {
  if (typeof localStorage === 'undefined') return;
  suppressStorageHook = true;
  try {
    const text = JSON.stringify(db);
    localStorage.setItem(DB_KEY, text);
    try { localStorage.setItem(MIRROR_KEY, text); } catch { /* mirror best effort */ }
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('proqtrack:db-updated', { detail: { reason: 'cloud-hydrate', fromCache: true } }));
    }
  } finally {
    suppressStorageHook = false;
  }
}

export function applyRemoteDataToLocal(localDb, remoteData = {}) {
  if (!localDb || typeof localDb !== 'object') return localDb;
  for (const key of CLOUD_COLLECTIONS) {
    if (Array.isArray(remoteData[key])) localDb[key] = clone(remoteData[key]);
  }
  persistLocalCache(localDb);
  return localDb;
}

export function ensureCloudIdentity(localDb, cloudAccount = {}, localAccount = null) {
  if (!localDb || !cloudAccount?.sub && !cloudAccount?.id) return localAccount;
  const id = String(cloudAccount.sub || cloudAccount.id);
  const email = String(cloudAccount.email || '').toLowerCase();
  const accounts = Array.isArray(localDb.accounts) ? localDb.accounts : (localDb.accounts = []);
  const employee = (localDb.employees || []).find(row => row?.authUserId === id || (email && String(row?.email || '').toLowerCase() === email));
  const existingIndex = accounts.findIndex(row => row?.id === id || (email && String(row?.email || '').toLowerCase() === email));
  const existing = existingIndex >= 0 ? accounts[existingIndex] : (localAccount || {});
  const next = {
    ...existing,
    id,
    email: cloudAccount.email || existing.email || '',
    name: existing.name || employee?.name || cloudAccount.email || id,
    role: cloudAccount.role || existing.role || 'employee',
    organizationId: cloudAccount.organizationId || existing.organizationId || null,
    projectId: cloudAccount.role === 'manager' ? (cloudAccount.projectIds?.[0] || existing.projectId || null) : (existing.projectId || null),
    employeeId: employee?.id || existing.employeeId || null,
    status: 'active',
    cloudIdentity: true,
    cloudSyncedAt: new Date().toISOString(),
  };
  if (!next.password && existing.password) next.password = existing.password;
  if (existingIndex >= 0) accounts[existingIndex] = next;
  else accounts.push(next);
  persistLocalCache(localDb);
  return next;
}

export function installStorageWriteThrough() {
  if (storageHookInstalled || typeof Storage === 'undefined' || typeof localStorage === 'undefined') return false;
  const proto = Storage.prototype;
  const original = proto.setItem;
  if (original.__proqtrackCloudWrapped) {
    storageHookInstalled = true;
    return true;
  }
  function wrappedSetItem(key, value) {
    const result = original.call(this, key, value);
    if (!suppressStorageHook && this === localStorage && key === DB_KEY && ready && cutoverMode === 'cloud') {
      try { scheduleOperationalSync(JSON.parse(value)); } catch { /* ignore malformed local writes */ }
    }
    return result;
  }
  Object.defineProperty(wrappedSetItem, '__proqtrackCloudWrapped', { value: true });
  proto.setItem = wrappedSetItem;
  storageHookInstalled = true;
  return true;
}

async function apiJson(path, options = {}) {
  const headers = authHeaders({ accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) });
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.code = data.error;
    error.payload = data;
    throw error;
  }
  return data;
}

export async function establishCloudSession({ email, password, organizationId = '' } = {}) {
  const token = await issueUploadSession(null, { email, password, organizationId });
  if (!token) return null;
  return apiJson('/api/auth/session');
}

// Legacy migration is intentionally explicit from M7 onward. Normal login must
// never auto-post browser localStorage into a new/empty organization. Admin
// migration tooling may call this function deliberately when a legacy cutover
// is actually required.
export async function importLegacySnapshotForAdmin(localDb) {
  const legacy = snapshotCollections(localDb, true);
  try {
    await apiJson('/api/core/import', { method: 'POST', body: JSON.stringify({ dryRun: true, snapshot: legacy }) });
    await apiJson('/api/core/import', { method: 'POST', body: JSON.stringify({ snapshot: legacy }) });
    return apiJson('/api/core/bootstrap');
  } catch (error) {
    const recovered = await apiJson('/api/core/bootstrap').catch(() => null);
    if (recovered && (recovered.cutoverMode === 'cloud' || recovered.empty === false)) return recovered;
    throw error;
  }
}

export async function bootstrapOperationalData(localDb, account = {}) {
  if (!getApiToken()) return { mode: 'local', data: null };
  const remote = await apiJson('/api/core/bootstrap');
  cutoverMode = remote.cutoverMode || 'pending';
  revision = Number(remote.revision || 0);

  if (cutoverMode !== 'cloud') {
    ready = false;
    baseline = {};
    lastError = null;
    emitStatus('pending-cutover', {
      legacyImportRequired: remote.empty === true,
      implicitLegacyImportDisabled: true,
    });
    return { mode: 'pending', data: null, revision, cutoverMode };
  }

  baseline = snapshotCollections(remote.data || {});
  ready = true;
  lastError = null;
  rememberCutover(account.organizationId || account.organization?.id || null);
  emitStatus('ready');
  return { mode: 'cloud', data: clone(remote.data || {}), revision, cutoverMode };
}

async function flush() {
  if (syncing || !ready || !getApiToken() || !queuedSnapshot) return;
  syncing = true;
  emitStatus('syncing');
  try {
    const current = queuedSnapshot;
    queuedSnapshot = null;
    const changes = diffSnapshots(baseline, current);
    if (!changes.length) {
      lastError = null;
      emitStatus('synced');
      return;
    }
    for (let offset = 0; offset < changes.length; offset += 200) {
      const chunk = changes.slice(offset, offset + 200);
      const mutationId = crypto?.randomUUID?.() || `mut-${Date.now()}-${offset}`;
      const result = await apiJson('/api/core/sync', {
        method: 'POST',
        headers: { 'idempotency-key': mutationId },
        body: JSON.stringify({ mutationId, baseRevision: revision, changes: chunk }),
      });
      revision = Number(result.revision);
      baseline = applyChanges(baseline, chunk);
    }
    lastError = null;
    emitStatus('synced');
  } catch (error) {
    lastError = error.code || error.message || String(error);
    if (error.code === 'REVISION_CONFLICT') {
      ready = false;
      revision = Number(error.payload?.revision || revision);
      emitStatus('conflict', { conflict: true });
    } else {
      emitStatus('error');
    }
  } finally {
    syncing = false;
    if (queuedSnapshot && ready) {
      clearTimeout(timer);
      timer = setTimeout(flush, 150);
    }
  }
}

export function scheduleOperationalSync(db) {
  if (!ready || cutoverMode !== 'cloud' || !getApiToken()) return false;
  queuedSnapshot = snapshotCollections(db);
  clearTimeout(timer);
  timer = setTimeout(flush, 180);
  return true;
}

export function cloudDataStatus() {
  return { ready, syncing, revision, cutoverMode, error: lastError };
}

export function resetCloudDataBridge() {
  ready = false;
  syncing = false;
  revision = 0;
  cutoverMode = 'pending';
  baseline = {};
  queuedSnapshot = null;
  lastError = null;
  clearTimeout(timer);
  timer = null;
  emitStatus('reset');
}

export async function logoutCloudSession() {
  resetCloudDataBridge();
  return revokeApiSession();
}
