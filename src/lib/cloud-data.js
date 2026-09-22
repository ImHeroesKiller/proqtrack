import { authHeaders, clearApiToken, getApiToken, issueUploadSession, revokeApiSession, switchApiOrganization } from './uploads.js';
import { hashPassword } from './utils.js';

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
  'competitors',
  'competitorProducts',
  'attendancePoints',
  'leaves',
  'stocks',
  'priceObservations',
  'competitorIntel',
  'outletProposals',
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

const LEGACY_DEMO_COMPETITOR_IDS = new Set([
  'CMP001','CMP002','CMP003','CMP004','CMP005','CMP006','CMP007','CMP008',
]);
const LEGACY_DEMO_COMPETITOR_PRODUCT_IDS = new Set([
  'CPD001','CPD002','CPD003','CPD004','CPD005','CPD006','CPD007',
  'CPD008','CPD009','CPD010','CPD011','CPD012','CPD013','CPD014',
]);

function sameOrganization(row, organizationId) {
  return !!organizationId && String(row?.organizationId || '') === String(organizationId);
}

function legacyRefMap(rows = [], fields = []) {
  const map = new Map();
  for (const row of rows) {
    for (const field of fields) {
      const value = String(row?.[field] || '').trim().toLowerCase();
      if (value && !map.has(value)) map.set(value, row);
    }
  }
  return map;
}

export function legacyMasterMigrationChanges(localDb = {}, remoteData = {}, organizationId = '') {
  if (!organizationId) return [];
  const changes = [];
  const remoteCompetitors = Array.isArray(remoteData.competitors) ? remoteData.competitors : [];
  const remoteProducts = Array.isArray(remoteData.competitorProducts) ? remoteData.competitorProducts : [];
  const remotePoints = Array.isArray(remoteData.attendancePoints) ? remoteData.attendancePoints : [];
  const remoteOutlets = new Set((remoteData.outlets || []).map(row => String(row?.id || '')));
  const competitorRefs = legacyRefMap(remoteCompetitors, ['id','code','name']);
  const competitorIdMap = new Map();

  for (const row of Array.isArray(localDb.competitors) ? localDb.competitors : []) {
    if (!sameOrganization(row, organizationId) || LEGACY_DEMO_COMPETITOR_IDS.has(String(row.id || ''))) continue;
    const existing = competitorRefs.get(String(row.id || '').toLowerCase())
      || competitorRefs.get(String(row.code || '').toLowerCase())
      || competitorRefs.get(String(row.name || '').toLowerCase());
    if (existing) {
      competitorIdMap.set(String(row.id), String(existing.id));
      continue;
    }
    const canonical = {
      ...clone(row),
      id: String(row.id || ('CMP-' + crypto.randomUUID())),
      code: String(row.code || row.id || '').trim() || ('CMP-' + crypto.randomUUID().slice(0,8)),
      organizationId,
      status: row.status || 'active',
    };
    competitorIdMap.set(String(row.id), canonical.id);
    changes.push({ entity:'competitors', op:'upsert', row:canonical });
    competitorRefs.set(canonical.id.toLowerCase(), canonical);
    competitorRefs.set(String(canonical.code).toLowerCase(), canonical);
  }

  const remoteProductKeys = new Set(remoteProducts.map(row =>
    String(row.competitorId || '').toLowerCase() + '::' + String(row.sku || '').toLowerCase()
  ));
  for (const row of Array.isArray(localDb.competitorProducts) ? localDb.competitorProducts : []) {
    if (!sameOrganization(row, organizationId) || LEGACY_DEMO_COMPETITOR_PRODUCT_IDS.has(String(row.id || ''))) continue;
    const competitorId = competitorIdMap.get(String(row.competitorId))
      || competitorRefs.get(String(row.competitorId || '').toLowerCase())?.id
      || '';
    if (!competitorId) continue;
    const key = String(competitorId).toLowerCase() + '::' + String(row.sku || '').toLowerCase();
    if (remoteProductKeys.has(key)) continue;
    changes.push({
      entity:'competitorProducts',
      op:'upsert',
      row:{ ...clone(row), competitorId, organizationId },
    });
    remoteProductKeys.add(key);
  }

  const pointRefs = legacyRefMap(remotePoints, ['id','code','name']);
  for (const row of Array.isArray(localDb.attendancePoints) ? localDb.attendancePoints : []) {
    if (!sameOrganization(row, organizationId) || row?.builtIn || String(row?.id || '') === 'APT-OFFICE') continue;
    const existing = pointRefs.get(String(row.id || '').toLowerCase())
      || pointRefs.get(String(row.code || '').toLowerCase())
      || pointRefs.get(String(row.name || '').toLowerCase());
    if (existing) continue;
    const outletId = row.outletId && remoteOutlets.has(String(row.outletId)) ? String(row.outletId) : null;
    changes.push({
      entity:'attendancePoints',
      op:'upsert',
      row:{
        ...clone(row),
        id:String(row.id || ('APT-' + crypto.randomUUID())),
        code:String(row.code || row.id || '').trim() || ('APT-' + crypto.randomUUID().slice(0,8)),
        organizationId,
        outletId,
        ...(row.outletId && !outletId ? { legacyOutletId:String(row.outletId) } : {}),
        status:row.status || 'active',
      },
    });
  }
  return changes;
}

const P2_OPERATIONAL_COLLECTIONS = Object.freeze(['priceObservations','competitorIntel','outletProposals']);

function operationalOwnerId(entity, row = {}) {
  if (entity === 'outletProposals') return String(row.submittedBy || row.employeeId || '');
  return String(row.recordedBy || row.employeeId || '');
}

function localActorEmployeeId(localDb = {}, account = {}) {
  const accountId = String(account.sub || account.id || '');
  const email = String(account.email || '').toLowerCase();
  const linked = (localDb.employees || []).find(row =>
    String(row.authUserId || '') === accountId
    || (email && String(row.email || '').toLowerCase() === email)
  );
  if (linked?.id) return String(linked.id);
  const localAccount = (localDb.accounts || []).find(row =>
    String(row.id || '') === accountId || (email && String(row.email || '').toLowerCase() === email)
  );
  return String(localAccount?.employeeId || '');
}

function p2OperationalMigrationChanges(localDb = {}, remoteData = {}, account = {}) {
  const organizationId = String(account.organizationId || account.organization?.id || localDb.currentOrganizationId || '');
  if (!organizationId) return [];
  const broad = ['superadmin','head','admin'].includes(String(account.role || '').toLowerCase());
  const ownEmployeeId = localActorEmployeeId(localDb, account);
  const projects = new Set((remoteData.projects || []).map(row => String(row.id || '')));
  const outlets = new Set((remoteData.outlets || []).map(row => String(row.id || '')));
  const products = new Set((remoteData.products || []).map(row => String(row.id || '')));
  const employees = new Set((remoteData.employees || []).map(row => String(row.id || '')));
  const competitorProducts = new Set((remoteData.competitorProducts || []).map(row => String(row.id || '')));
  const changes = [];

  for (const entity of P2_OPERATIONAL_COLLECTIONS) {
    const remoteIds = new Set((remoteData[entity] || []).map(row => String(row.id || '')));
    for (const source of Array.isArray(localDb[entity]) ? localDb[entity] : []) {
      const row = clone(source);
      const id = String(row.id || '');
      if (!id || remoteIds.has(id) || !sameOrganization(row, organizationId)) continue;
      const owner = operationalOwnerId(entity, row);
      if (!broad && (!ownEmployeeId || owner !== ownEmployeeId)) continue;
      const projectId = String(row.projectId || '');
      if (!projectId || !projects.has(projectId) || !owner || !employees.has(owner)) continue;
      if (entity !== 'outletProposals' && !outlets.has(String(row.outletId || ''))) continue;
      if (entity === 'priceObservations' && !products.has(String(row.productId || ''))) continue;
      if (entity === 'competitorIntel') {
        if (row.productId && !products.has(String(row.productId))) row.productId = null;
        if (row.competitorProductId && !competitorProducts.has(String(row.competitorProductId))) row.competitorProductId = null;
      }
      row.organizationId = organizationId;
      if (!row.employeeId) row.employeeId = owner;
      changes.push({ entity, op: 'upsert', row });
    }
  }
  return changes;
}

async function migrateP2OperationalCollections(localDb, remote, account = {}) {
  const organizationId = String(account.organizationId || account.organization?.id || localDb?.currentOrganizationId || '');
  if (!organizationId) return remote;
  const changes = p2OperationalMigrationChanges(localDb, remote?.data || {}, account);
  if (!changes.length) return remote;
  let baseRevision = Number(remote?.revision || 0);
  for (let offset = 0; offset < changes.length; offset += 100) {
    const chunk = changes.slice(offset, offset + 100);
    const mutationId = 'P2-CLOUD-' + organizationId + '-' + stableMutationSuffix(chunk);
    const send = () => apiJson('/api/core/sync', {
      method: 'POST',
      headers: { 'idempotency-key': mutationId },
      body: JSON.stringify({ mutationId, baseRevision, changes: chunk }),
    });
    let result;
    try {
      result = await send();
    } catch (error) {
      if (error?.code !== 'REVISION_CONFLICT') throw error;
      const latest = await apiJson('/api/core/bootstrap');
      baseRevision = Number(latest?.revision || baseRevision);
      result = await send();
    }
    baseRevision = Number(result?.revision ?? baseRevision);
  }
  return apiJson('/api/core/bootstrap');
}

function evidencePhotoType(type = '') {
  return ({
    field_location:'location', product_photo:'product', rack_shelf:'shelf',
    competitor_photo:'competitor', rack_before:'rack_before', rack_after:'rack_after',
    selfie:'selfie',
  })[String(type)] || String(type || 'location');
}

async function fetchCloudFieldPhotos() {
  const rows = [];
  let offset = 0;
  for (let page = 0; page < 40; page += 1) {
    const payload = await apiJson('/api/evidence?limit=250&offset=' + offset);
    for (const item of payload.evidence || []) {
      const type = evidencePhotoType(item.evidenceType);
      rows.push({
        id: String(item.id),
        evidenceId: String(item.id),
        organizationId: item.organizationId,
        projectId: item.projectId,
        outletId: item.outletId || '',
        employeeId: item.employeeId,
        recordedBy: item.employeeId,
        visitId: item.visitId || null,
        type,
        photoType: type,
        photoUrl: '/api/evidence/' + encodeURIComponent(item.id),
        dataUrl: null,
        recordedAt: item.capturedAt || item.createdAt,
        evidenceStatus: item.storageStatus || 'ready',
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
      });
    }
    if (payload.nextOffset == null) break;
    offset = Number(payload.nextOffset);
  }
  return rows;
}
function stableMutationSuffix(changes = []) {
  const input = changes.map(change => change.entity + ':' + (change.row?.id || '')).sort().join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function migrateLegacyMasterCollections(localDb, remote, account = {}) {
  const organizationId = String(account?.organizationId || account?.organization?.id || localDb?.currentOrganizationId || '');
  const pendingKey = `proqtrack_pending_catalog_${organizationId}`;
  const orgAdmin = ['head','admin','superadmin'].includes(String(account.role || '').toLowerCase());
  if (orgAdmin && typeof localStorage !== 'undefined') {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
    localDb = {...localDb};
    for (const entity of ['competitors','competitorProducts']) {
      const rows = new Map((localDb[entity] || []).map(row=>[row.id,row]));
      for (const change of pending.filter(change=>change.entity===entity)) if (!rows.has(change.row.id)) rows.set(change.row.id,change.row);
      localDb[entity] = [...rows.values()];
    }
  }
  let changes = legacyMasterMigrationChanges(localDb, remote?.data || {}, organizationId);
  if (!orgAdmin) {
    const catalog = changes.filter(change=>['competitors','competitorProducts'].includes(change.entity));
    // Preserve unsynced legacy catalog for an administrator; never grant migration-only write access.
    if (catalog.length && typeof localStorage !== 'undefined') {
      const key = `proqtrack_pending_catalog_${organizationId}`;
      const prior = JSON.parse(localStorage.getItem(key) || '[]');
      const rows = new Map([...prior,...catalog].map(change=>[`${change.entity}:${change.row.id}`,change]));
      localStorage.setItem(key,JSON.stringify([...rows.values()]));
    }
    changes = changes.filter(change=>!['competitors','competitorProducts'].includes(change.entity));
  }
  if (!changes.length) return remote;

  let baseRevision = Number(remote?.revision || 0);
  for (let offset = 0; offset < changes.length; offset += 100) {
    const chunk = changes.slice(offset, offset + 100);
    const mutationId = 'LEGACY-MASTER-' + organizationId + '-' + stableMutationSuffix(chunk);
    const send = () => apiJson('/api/core/sync', {
      method:'POST',
      headers:{ 'idempotency-key':mutationId },
      body:JSON.stringify({ mutationId, baseRevision, changes:chunk }),
    });
    let result;
    try {
      result = await send();
    } catch (error) {
      if (error?.code !== 'REVISION_CONFLICT') throw error;
      const latest = await apiJson('/api/core/bootstrap');
      baseRevision = Number(latest?.revision || baseRevision);
      result = await send();
    }
    baseRevision = Number(result?.revision ?? baseRevision);
  }
  const refreshed = await apiJson('/api/core/bootstrap');
  if (orgAdmin && typeof localStorage !== 'undefined') localStorage.removeItem(pendingKey);
  return refreshed;
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
  if (Array.isArray(remoteData.fieldPhotos)) {
    const remote = new Map(remoteData.fieldPhotos.map(row => [String(row.id || row.evidenceId || ''), clone(row)]));
    for (const row of Array.isArray(localDb.fieldPhotos) ? localDb.fieldPhotos : []) {
      const id = String(row.id || row.evidenceId || '');
      if (id && !remote.has(id) && row.evidenceStatus === 'queued') remote.set(id, clone(row));
    }
    localDb.fieldPhotos = [...remote.values()];
  }
  persistLocalCache(localDb);
  return localDb;
}

export function ensureCloudIdentity(localDb, cloudAccount = {}, localAccount = null, verifiedPassword = '') {
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
  if (verifiedPassword) next.password = hashPassword(verifiedPassword);
  else if (!next.password && existing.password) next.password = existing.password;
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

export async function restoreCloudSession(localDb) {
  if (!getApiToken()) return null;
  try {
    const session = await apiJson('/api/auth/session');
    const bootstrap = await bootstrapOperationalData(localDb, session);
    if (bootstrap.mode !== 'cloud' || !bootstrap.data) {
      const error = new Error('ORGANIZATION_NOT_CUT_OVER');
      error.code = 'ORGANIZATION_NOT_CUT_OVER';
      throw error;
    }
    applyRemoteDataToLocal(localDb, bootstrap.data);
    const account = ensureCloudIdentity(localDb, session, null, '');
    if (!account) throw new Error('SESSION_ACCOUNT_UNAVAILABLE');
    return { account, session, bootstrap };
  } catch (error) {
    if ([401, 403].includes(Number(error?.status || 0))
      || ['AUTH_REQUIRED','INVALID_TOKEN','TOKEN_EXPIRED','SESSION_REVOKED','USER_ACCESS_DISABLED','ORGANIZATION_ACCESS_DENIED'].includes(error?.code)) {
      clearApiToken();
    }
    throw error;
  }
}

export async function establishCloudSession({ email, password, organizationId = '' } = {}) {
  const token = await issueUploadSession(null, { email, password, organizationId });
  if (!token) return null;
  try {
    return await apiJson('/api/auth/session');
  } catch (error) {
    await revokeApiSession().catch(() => {});
    throw error;
  }
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
  let remote = await apiJson('/api/core/bootstrap');
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

  try {
    remote = await migrateLegacyMasterCollections(localDb, remote, account);
    revision = Number(remote.revision || revision);
    remote = await migrateP2OperationalCollections(localDb, remote, account);
    revision = Number(remote.revision || revision);
    remote.data = remote.data || {};
    remote.data.fieldPhotos = await fetchCloudFieldPhotos();
  } catch (error) {
    ready = false;
    lastError = error.code || error.message || String(error);
    emitStatus('legacy-master-migration-error');
    throw error;
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
  return { ready, syncing, queued:!!queuedSnapshot, revision, cutoverMode, error: lastError };
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

export async function switchCloudOrganization(localDb, organizationId) {
  const target = String(organizationId || '').trim();
  if (!target) throw new Error('ORGANIZATION_REQUIRED');
  const previous = String(window.FT?.state?.account?.organizationId || localDb?.currentOrganizationId || '');
  let switched = null;
  try {
    switched = await switchApiOrganization(target);
    resetCloudDataBridge();
    const session = await apiJson('/api/auth/session');
    const bootstrap = await bootstrapOperationalData(localDb, session);
    if (bootstrap.mode !== 'cloud' || !bootstrap.data) throw new Error('ORGANIZATION_NOT_CUT_OVER');
    applyRemoteDataToLocal(localDb, bootstrap.data);
    const account = ensureCloudIdentity(localDb, session, null, '');
    return { account: account || switched, session, bootstrap };
  } catch (error) {
    if (previous && previous !== target && switched) {
      try {
        await switchApiOrganization(previous);
        resetCloudDataBridge();
        const priorSession = await apiJson('/api/auth/session');
        const priorBootstrap = await bootstrapOperationalData(localDb, priorSession);
        if (priorBootstrap.mode === 'cloud' && priorBootstrap.data) {
          applyRemoteDataToLocal(localDb, priorBootstrap.data);
          ensureCloudIdentity(localDb, priorSession, null, '');
        }
      } catch (rollbackError) {
        console.warn('organization_switch_rollback_failed', rollbackError?.message || rollbackError);
        await revokeApiSession().catch(() => {});
      }
    }
    throw error;
  }
}

export async function logoutCloudSession() {
  resetCloudDataBridge();
  return revokeApiSession();
}
