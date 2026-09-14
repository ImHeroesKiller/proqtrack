import { enqueueMutation, listMutations, deleteMutation, offlineQueueStats } from './offline-store.js';

const DB_KEY = 'proqtrack_db_v6';
const SNAPSHOT_PREFIX = 'offline-snapshot:';
const OPERATIONAL_KEYS = Object.freeze([
  'clients','projects','employees','projectAssignments','outlets','visits','attendance',
  'products','productSales','surveyTemplates','surveyResponses','projectProducts',
]);
let installed = false;
let recovering = false;
let lastSignature = '';
let observeTimer = null;

function operationalSnapshot(db = {}) {
  return Object.fromEntries(OPERATIONAL_KEYS.map(key => [key, Array.isArray(db[key]) ? db[key] : []]));
}

function signature(snapshot) {
  return JSON.stringify(snapshot);
}

function currentOrganizationId(snapshot = {}) {
  return String(window.FT?.state?.account?.organizationId || snapshot.currentOrganizationId || 'ORG-DEFAULT');
}

function cutoverRemembered(organizationId) {
  try { return localStorage.getItem(`proqtrack_cloud_cutover_${organizationId}`) === 'cloud'; } catch { return false; }
}

function emit(status, organizationId, extra = {}) {
  offlineQueueStats(organizationId).then(queue => {
    window.dispatchEvent(new CustomEvent('proqtrack:offline-status', {
      detail: { status, organizationId, online: navigator.onLine !== false, queue, ...extra },
    }));
  }).catch(() => {});
}

async function persistOperationalSnapshot(db) {
  const organizationId = currentOrganizationId(db);
  if (!organizationId || !cutoverRemembered(organizationId)) return false;
  const snapshot = operationalSnapshot(db);
  const nextSignature = signature(snapshot);
  if (nextSignature === lastSignature) return false;
  lastSignature = nextSignature;
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

function observeLocalCache() {
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
  const orgId = String(organizationId || window.FT?.state?.account?.organizationId || 'ORG-DEFAULT');
  if (!orgId || navigator.onLine === false) return false;
  const item = await snapshotItem(orgId);
  const snapshot = item?.changes?.[0]?.row;
  if (!snapshot) return false;
  const [{ getDB }, cloud] = await Promise.all([import('./db.js'), import('./cloud-data.js')]);
  const db = getDB();
  for (const key of OPERATIONAL_KEYS) if (Array.isArray(snapshot[key])) db[key] = snapshot[key];
  const accepted = cloud.scheduleOperationalSync(db);
  if (accepted) emit('replaying', orgId);
  return accepted;
}

async function clearSyncedSnapshot(organizationId) {
  if (!organizationId) return;
  await deleteMutation(`${SNAPSHOT_PREFIX}${organizationId}`);
  emit('synced', organizationId);
}

export async function recoverCloudConflict(organizationId = '') {
  if (recovering || navigator.onLine === false) return false;
  recovering = true;
  try {
    const orgId = String(organizationId || window.FT?.state?.account?.organizationId || 'ORG-DEFAULT');
    const account = window.FT?.state?.account;
    if (!account) return false;
    const [{ getDB }, cloud] = await Promise.all([import('./db.js'), import('./cloud-data.js')]);
    const db = getDB();
    const bootstrap = await cloud.bootstrapOperationalData(db, account);
    if (bootstrap.mode === 'cloud' && bootstrap.data) cloud.applyRemoteDataToLocal(db, bootstrap.data);
    await replayLatestSnapshot(orgId);
    emit('conflict-rebased', orgId);
    return true;
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
  observeLocalCache();
  observeTimer = setInterval(observeLocalCache, 1000);
  window.addEventListener('proqtrack:db-updated', observeLocalCache);
  window.addEventListener('online', () => replayLatestSnapshot().catch(() => {}));
  document?.addEventListener?.('visibilitychange', () => {
    if (document.visibilityState === 'visible') observeLocalCache();
  });
  window.addEventListener('proqtrack:cloud-status', event => {
    const orgId = event.detail?.organizationId || window.FT?.state?.account?.organizationId || 'ORG-DEFAULT';
    if (event.detail?.status === 'synced') clearSyncedSnapshot(orgId).catch(() => {});
    if (event.detail?.status === 'conflict') recoverCloudConflict(orgId).catch(() => {});
    if (event.detail?.status === 'ready') replayLatestSnapshot(orgId).catch(() => {});
  });
  return true;
}

export function stopOfflineObserver() {
  if (observeTimer) clearInterval(observeTimer);
  observeTimer = null;
}

installOfflineEngine();
if (typeof window !== 'undefined') window.ProQOffline = { replayLatestSnapshot, recoverCloudConflict, offlineQueueStats };
