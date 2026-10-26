import { enqueueMutation, listMutations, deleteMutation, offlineQueueStats } from './offline-store.js';

const DB_KEY = 'proqtrack_db_v6';
const SNAPSHOT_PREFIX = 'offline-snapshot:';
const OPERATIONAL_KEYS = Object.freeze([
  'clients','projects','employees','projectAssignments','outlets','visits','attendance',
  'products','productSales','surveyTemplates','surveyResponses','projectProducts',
  'competitors','competitorProducts','attendancePoints','leaves','stocks',
  'priceObservations','competitorIntel','outletProposals',
]);
let installed = false;
let runtimeController = null;
let recovering = false;
let replaying = false;
const MAX_SIGNATURE_TENANTS = 20;
const lastSignatures = new Map();

function rememberSignature(organizationId, value) {
  const key = String(organizationId || '');
  if (!key) return;
  lastSignatures.delete(key);
  lastSignatures.set(key, value);
  while (lastSignatures.size > MAX_SIGNATURE_TENANTS) {
    lastSignatures.delete(lastSignatures.keys().next().value);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function operationalSnapshot(db = {}) {
  return Object.fromEntries(OPERATIONAL_KEYS.map(key => [key, Array.isArray(db[key]) ? clone(db[key]) : []]));
}

function signature(snapshot) {
  return JSON.stringify(snapshot);
}

function currentOrganizationId(snapshot = {}) {
  const account = window.FT?.state?.account || null;
  if (account?.role !== 'superadmin' && account?.organizationId) return String(account.organizationId);
  return String(snapshot.currentOrganizationId || account?.organizationId || '');
}

function cutoverRemembered(organizationId) {
  try { return localStorage.getItem(`proqtrack_cloud_cutover_${organizationId}`) === 'cloud'; } catch { return false; }
}

function emit(status, organizationId, extra = {}) {
  if (!organizationId) return;
  offlineQueueStats(organizationId).then(queue => {
    window.dispatchEvent(new CustomEvent('proqtrack:offline-status', {
      detail: { status, organizationId, online: navigator.onLine !== false, queue, ...extra },
    }));
  }).catch(() => {});
}

async function persistOperationalSnapshot(db) {
  if (recovering) return false;
  const organizationId = currentOrganizationId(db);
  if (!organizationId || !cutoverRemembered(organizationId)) return false;

  const snapshot = operationalSnapshot(db);
  const nextSignature = signature(snapshot);
  if (nextSignature === lastSignatures.get(organizationId)) return false;
  rememberSignature(organizationId, nextSignature);

  const cloud = await import('./cloud-data.js');
  const intent = cloud.captureOperationalIntent(db);
  if (!intent?.changes?.length) return false;

  const id = `${SNAPSHOT_PREFIX}${organizationId}`;
  await enqueueMutation({
    id,
    mutationId:id,
    organizationId,
    kind:'intent',
    baseRevision:Number(intent.baseRevision || 0),
    changes:intent.changes,
  });
  emit(navigator.onLine === false ? 'queued-offline' : 'queued', organizationId, {
    changeCount:intent.changes.length,
  });
  return true;
}

function observeLocalCache(dbHint = null) {
  if (dbHint && typeof dbHint === 'object') {
    persistOperationalSnapshot(dbHint).catch(() => {});
    return;
  }
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return;
    const db = JSON.parse(raw);
    persistOperationalSnapshot(db).catch(() => {});
  } catch { /* db.js owns malformed cache handling */ }
}

async function snapshotItem(organizationId) {
  const items = await listMutations(organizationId);
  return items.find(item => item.id === `${SNAPSHOT_PREFIX}${organizationId}`) || null;
}

export async function replayLatestSnapshot(organizationId = '') {
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || '');
  if (!orgId || navigator.onLine === false || replaying) return false;
  replaying = true;
  try {
    const item = await snapshotItem(orgId);
    if (!item) return false;

    // Legacy whole-snapshot outbox entries are unsafe in multi-user mode.
    // Resolve them cloud-first instead of replaying stale device state.
    if (item.kind === 'snapshot' || item?.changes?.[0]?.entity === '__operational_snapshot__' || item?.requiresReview) {
      return recoverCloudConflict(orgId);
    }

    const [{ getDB }, cloud] = await Promise.all([import('./db.js'), import('./cloud-data.js')]);
    const db = getDB();
    const result = cloud.replayOperationalIntent(db, item.changes || []);
    if (result.accepted) {
      emit('replaying', orgId, {
        resolution:'auto-rebase',
        reapplied:Number(result.reapplied || 0),
        conflictFields:Number(result.conflictFields || 0),
        droppedChanges:Number(result.droppedChanges || 0),
      });
    }
    return Boolean(result.accepted);
  } finally {
    replaying = false;
  }
}

async function clearSyncedSnapshot(organizationId) {
  if (!organizationId) return false;
  await deleteMutation(`${SNAPSHOT_PREFIX}${organizationId}`);
  emit('synced', organizationId);
  return true;
}

export async function discardHeldSnapshot(organizationId = '') {
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || '');
  if (!orgId) return false;
  const item = await snapshotItem(orgId);
  if (!item) return false;
  await deleteMutation(`${SNAPSHOT_PREFIX}${orgId}`);
  emit('conflict-auto-resolved', orgId, { resolution:'server-wins' });
  return true;
}

export async function heldConflictStatus(organizationId = '') {
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || '');
  if (!orgId) return { held:false };
  const item = await snapshotItem(orgId);
  return {
    held:false,
    pending:Boolean(item),
    organizationId:orgId,
    createdAt:item?.createdAt || null,
    updatedAt:item?.updatedAt || null,
  };
}

export async function recoverCloudConflict(organizationId = '') {
  if (recovering || navigator.onLine === false) return false;
  recovering = true;
  try {
    const account = window.FT?.state?.account;
    const orgId = String(organizationId || account?.organizationId || '');
    if (!account || !orgId) return false;
    if (account.role !== 'superadmin' && account.organizationId && String(account.organizationId) !== orgId) return false;

    const [{ getDB }, cloud] = await Promise.all([import('./db.js'), import('./cloud-data.js')]);
    const db = getDB();
    const pending = await snapshotItem(orgId);

    const bootstrap = await cloud.bootstrapOperationalData(db, account);
    if (bootstrap.mode === 'cloud' && bootstrap.data) {
      cloud.applyRemoteDataToLocal(db, bootstrap.data);
    }

    if (pending) await deleteMutation(`${SNAPSHOT_PREFIX}${orgId}`);
    rememberSignature(orgId, signature(operationalSnapshot(db)));
    emit('conflict-auto-resolved', orgId, {
      pendingSnapshot:Boolean(pending),
      resolution:'server-wins',
      automatic:true,
    });
    return true;
  } catch (error) {
    emit('conflict-recovery-failed', organizationId, { error:error?.message || String(error) });
    return false;
  } finally {
    recovering = false;
  }
}

export function installOfflineEngine() {
  if (installed || typeof window === 'undefined') return false;
  installed = true;
  runtimeController = new AbortController();
  const { signal } = runtimeController;
  observeLocalCache();
  window.addEventListener('proqtrack:db-persisted', event => observeLocalCache(event.detail?.db || null), { signal });
  window.addEventListener('online', () => {
    observeLocalCache();
    replayLatestSnapshot().catch(() => {});
  }, { signal });
  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') observeLocalCache();
  }, { signal });
  window.addEventListener('proqtrack:cloud-status', event => {
    const orgId = String(event.detail?.organizationId || window.FT?.state?.account?.organizationId || '');
    if (!orgId) return;
    if (event.detail?.status === 'synced') clearSyncedSnapshot(orgId).catch(() => {});
    if (event.detail?.status === 'conflict') recoverCloudConflict(orgId).catch(() => {});
    if (event.detail?.status === 'ready' && !recovering) replayLatestSnapshot(orgId).catch(() => {});
  }, { signal });
  return true;
}

export function stopOfflineObserver() {
  runtimeController?.abort();
  runtimeController = null;
  installed = false;
  lastSignatures.clear();
  return true;
}

installOfflineEngine();
if (typeof window !== 'undefined') window.ProQOffline = { replayLatestSnapshot, recoverCloudConflict, discardHeldSnapshot, heldConflictStatus, offlineQueueStats };
