import { enqueueMutation, listMutations, patchMutation, deleteMutation, offlineQueueStats } from './offline-store.js';

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
const lastSignatures = new Map();

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
  // During a conflict rebase the server hydrate must never overwrite the durable
  // local snapshot that is about to be replayed.
  if (recovering) return false;
  const organizationId = currentOrganizationId(db);
  if (!organizationId || !cutoverRemembered(organizationId)) return false;
  const held = await snapshotItem(organizationId);
  if (held?.requiresReview) return false;
  const snapshot = operationalSnapshot(db);
  const nextSignature = signature(snapshot);
  if (nextSignature === lastSignatures.get(organizationId)) return false;
  lastSignatures.set(organizationId, nextSignature);
  const id = `${SNAPSHOT_PREFIX}${organizationId}`;
  await enqueueMutation({
    id,
    mutationId: id,
    organizationId,
    kind: 'snapshot',
    changes: [{ entity: '__operational_snapshot__', op: 'replace', row: snapshot }],
  });
  emit(navigator.onLine === false ? 'queued-offline' : 'queued', organizationId);
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
    if (item?.requiresReview) {
      emit('conflict-held', orgId, { pendingSnapshot: true, resolution: 'manual' });
      return false;
    }
    const snapshot = item?.changes?.[0]?.row;
    if (!snapshot) return false;
    const [{ getDB, persistDB }, cloud] = await Promise.all([import('./db.js'), import('./cloud-data.js')]);
    const db = getDB();
    for (const key of OPERATIONAL_KEYS) {
      if (Array.isArray(snapshot[key])) db[key] = clone(snapshot[key]);
    }
    persistDB('offline-replay');
    const accepted = cloud.scheduleOperationalSync(db);
    if (accepted) emit('replaying', orgId);
    return accepted;
  } finally {
    replaying = false;
  }
}

async function clearSyncedSnapshot(organizationId) {
  if (!organizationId) return false;
  const item = await snapshotItem(organizationId);
  if (item?.requiresReview) return false;
  await deleteMutation(`${SNAPSHOT_PREFIX}${organizationId}`);
  emit('synced', organizationId);
  return true;
}

export async function discardHeldSnapshot(organizationId = '') {
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || '');
  if (!orgId) return false;
  const item = await snapshotItem(orgId);
  if (!item?.requiresReview) return false;
  await deleteMutation(`${SNAPSHOT_PREFIX}${orgId}`);
  try {
    const { getDB } = await import('./db.js');
    lastSignatures.set(orgId, signature(operationalSnapshot(getDB())));
  } catch { /* cache signature is best effort */ }
  emit('conflict-resolved-server', orgId, { resolution: 'server-wins' });
  return true;
}

export async function heldConflictStatus(organizationId = '') {
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || '');
  if (!orgId) return { held: false };
  const item = await snapshotItem(orgId);
  return {
    held: Boolean(item?.requiresReview),
    organizationId: orgId,
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
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
    if (pending) {
      await patchMutation(pending.id, {
        status: 'blocked',
        requiresReview: true,
        conflictHeldAt: Date.now(),
      });
    }
    const bootstrap = await cloud.bootstrapOperationalData(db, account);
    if (bootstrap.mode === 'cloud' && bootstrap.data) cloud.applyRemoteDataToLocal(db, bootstrap.data);
    // Fail closed: never auto-overwrite a newer server revision with a whole
    // device snapshot. Keep the offline snapshot durable for explicit review.
    emit(pending ? 'conflict-held' : 'conflict-no-local-change', orgId, {
      pendingSnapshot: !!pending,
      resolution: pending ? 'manual' : 'server-wins',
    });
    return false;
  } catch (error) {
    emit('conflict-recovery-failed', organizationId, { error: error?.message || String(error) });
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
