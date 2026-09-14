const DB_NAME = 'proqtrack-offline-v1';
const DB_VERSION = 1;
const MEMORY = { outbox: new Map(), evidence: new Map(), meta: new Map() };

let dbPromise = null;

export function retryDelayMs(attempt = 0) {
  const n = Math.max(0, Number(attempt) || 0);
  return Math.min(60_000, 1_000 * (2 ** Math.min(n, 6)));
}

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function openDB() {
  if (!hasIndexedDB()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'id' });
        store.createIndex('organization_created', ['organizationId', 'createdAt']);
        store.createIndex('status_next', ['status', 'nextAttemptAt']);
      }
      if (!db.objectStoreNames.contains('evidence')) {
        const store = db.createObjectStore('evidence', { keyPath: 'id' });
        store.createIndex('organization_status', ['organizationId', 'status']);
        store.createIndex('status_next', ['status', 'nextAttemptAt']);
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_OPEN_FAILED'));
    req.onblocked = () => reject(new Error('INDEXEDDB_BLOCKED'));
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let value;
    try { value = fn(store); } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || new Error('INDEXEDDB_TX_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('INDEXEDDB_TX_ABORTED'));
  });
}

async function getAll(storeName) {
  const db = await openDB();
  if (!db) return [...MEMORY[storeName].values()];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const req = transaction.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

export async function enqueueMutation(item) {
  const row = {
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...item,
  };
  if (!row.id || !row.organizationId || !Array.isArray(row.changes) || !row.changes.length) {
    throw new Error('INVALID_OUTBOX_ITEM');
  }
  const db = await openDB();
  if (!db) { MEMORY.outbox.set(row.id, row); return row; }
  await tx('outbox', 'readwrite', store => store.put(row));
  return row;
}

export async function listMutations(organizationId = '') {
  const rows = await getAll('outbox');
  return rows
    .filter(row => !organizationId || row.organizationId === organizationId)
    .filter(row => row.status !== 'done')
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function patchMutation(id, patch = {}) {
  const db = await openDB();
  if (!db) {
    const current = MEMORY.outbox.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    MEMORY.outbox.set(id, next);
    return next;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('outbox', 'readwrite');
    const store = transaction.objectStore('outbox');
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { resolve(null); return; }
      const next = { ...req.result, ...patch, updatedAt: Date.now() };
      store.put(next);
      resolve(next);
    };
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

export async function deleteMutation(id) {
  const db = await openDB();
  if (!db) return MEMORY.outbox.delete(id);
  await tx('outbox', 'readwrite', store => store.delete(id));
  return true;
}

export async function putEvidence(item) {
  const row = {
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...item,
  };
  if (!row.id || !row.organizationId || !row.blob) throw new Error('INVALID_EVIDENCE_ITEM');
  const db = await openDB();
  if (!db) { MEMORY.evidence.set(row.id, row); return row; }
  await tx('evidence', 'readwrite', store => store.put(row));
  return row;
}

export async function listEvidence(organizationId = '') {
  const rows = await getAll('evidence');
  return rows
    .filter(row => !organizationId || row.organizationId === organizationId)
    .filter(row => row.status !== 'done')
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export async function getEvidence(id) {
  const db = await openDB();
  if (!db) return MEMORY.evidence.get(id) || null;
  return new Promise((resolve, reject) => {
    const req = db.transaction('evidence', 'readonly').objectStore('evidence').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

export async function patchEvidence(id, patch = {}) {
  const db = await openDB();
  if (!db) {
    const current = MEMORY.evidence.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    MEMORY.evidence.set(id, next);
    return next;
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('evidence', 'readwrite');
    const store = transaction.objectStore('evidence');
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { resolve(null); return; }
      const next = { ...req.result, ...patch, updatedAt: Date.now() };
      store.put(next);
      resolve(next);
    };
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

export async function markEvidenceDone(id, receipt = {}) {
  return patchEvidence(id, { status: 'done', blob: null, receipt, nextAttemptAt: 0 });
}

export async function setOfflineMeta(key, value) {
  const row = { key, value, updatedAt: Date.now() };
  const db = await openDB();
  if (!db) { MEMORY.meta.set(key, row); return row; }
  await tx('meta', 'readwrite', store => store.put(row));
  return row;
}

export async function getOfflineMeta(key) {
  const db = await openDB();
  if (!db) return MEMORY.meta.get(key)?.value ?? null;
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

export async function offlineQueueStats(organizationId = '') {
  const [mutations, evidence] = await Promise.all([listMutations(organizationId), listEvidence(organizationId)]);
  return {
    mutations: mutations.length,
    evidence: evidence.length,
    total: mutations.length + evidence.length,
  };
}

export const __test = { DB_NAME, DB_VERSION };
