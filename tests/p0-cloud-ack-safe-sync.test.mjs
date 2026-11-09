import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCloudRebaseTools } from '../src/lib/cloud-rebase.js';
import { listMutations } from '../src/lib/offline-store.js';
import { persistPendingOperationalIntent } from '../src/lib/offline-engine.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('visit UI cannot claim success without a durable local intent and cloud GPS receipt', async () => {
  const app = await read('src/app.js');
  const start = app.indexOf('async function finalizeVisitCloudStatus');
  const end = app.indexOf('window.FT.deleteVisit', start);
  const flow = app.slice(start,end);
  assert.ok(start >= 0 && end > start);
  assert.match(flow, /await persistPendingOperationalIntent\(getDB\(\)\)/);
  assert.match(flow, /await confirmVisitCloudPersistence\(visit\)/);
  assert.match(flow, /if \(cloud\.confirmed\)/);
  assert.match(flow, /belum dikonfirmasi Cloud/);
  assert.match(flow, /menunggu sinkronisasi saat online/);
  assert.match(flow, /window\.FT\.checkOutVisit/);
});

test('rejected sync keeps the mutation queued rather than reclassifying it as success', async () => {
  const cloud = await read('src/lib/cloud-data.js');
  const start = cloud.indexOf('async function syncTargetWithAutomaticRebase');
  const end = cloud.indexOf('async function flush',start);
  const sync = cloud.slice(start,end);
  assert.match(sync,/SYNC_REFERENCE_BLOCKED/);
  assert.match(sync,/sync_reference_blocked_preserved/);
  assert.doesNotMatch(sync,/cloudWinTargetForChange\(target, baseline, invalidChange\)/);
  assert.match(sync,/deviceCreates\.length/);
  const flush = cloud.slice(end, cloud.indexOf('export async function commitOperationalChanges',end));
  assert.match(flush,/if \(!queuedSnapshot\) queuedSnapshot = target/);
  assert.match(flush,/emitStatus\('pending'/);
  assert.match(flush,/generation !== bridgeGeneration/);
});

test('cloud first for existing rows, device new rows survive revision rebase', () => {
  const tools = createCloudRebaseTools(['outlets','visits']);
  const base = {
    outlets:[{id:'OUT-1',name:'Toko Awal'}],
    visits:[],
  };
  const local = {
    outlets:[{id:'OUT-1',name:'Nama dari HP'}],
    visits:[{id:'VIS-NEW',outletId:'OUT-1',status:'planned'}],
  };
  const remote = {
    outlets:[{id:'OUT-1',name:'Nama Cloud'}],
    visits:[],
  };
  const result = tools.rebaseSnapshotIntent(base,local,remote);
  assert.equal(result.mergedSnapshot.outlets[0].name,'Nama Cloud');
  assert.equal(result.mergedSnapshot.visits[0].id,'VIS-NEW');
  assert.equal(result.conflictFields,1);
  assert.equal(result.changes.length,1);
});

test('pending offline intent remains actor-scoped on a shared tenant device', async () => {
  const saved = ['window','navigator','localStorage'].map(name => [name,
    Object.getOwnPropertyDescriptor(globalThis,name)]);
  const values = new Map();
  const org='ORG-P0-SHARED-DEVICE';
  const cache = {
    getItem(k){return values.has(k)?values.get(k):null;},
    setItem(k,v){values.set(k,String(v));},
    removeItem(k){values.delete(k);},
  };
  function set(name,value) {
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  try {
    set('window',{ FT:{state:{account:{id:'U1',organizationId:org,role:'employee'}}} });
    set('navigator',{ onLine:false });
    set('localStorage',cache);
    cache.setItem('proqtrack_cloud_cutover_'+org,'cloud');
    const base={currentOrganizationId:org,visits:[{id:'V1',status:'planned'}]};
    await persistPendingOperationalIntent(base);
    await persistPendingOperationalIntent({
      ...base,visits:[{id:'V1',status:'checked-in'}],
    });
    globalThis.window.FT.state.account={id:'U2',organizationId:org,role:'employee'};
    await persistPendingOperationalIntent({
      ...base,visits:[{id:'V1',status:'planned'},{id:'V2',status:'planned'}],
    });
    const queued=await listMutations(org);
    assert.equal(queued.length,2);
    assert.deepEqual(queued.map(x=>x.actorUserId).sort(),['U1','U2']);
    assert.notEqual(queued[0].id,queued[1].id);
  } finally {
    for(const [name,descriptor] of saved) {
      if(descriptor) Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
  }
});

test('outbox is cleared only after convergence, not on rejected change or conflict bootstrap', async () => {
  const off = await read('src/lib/offline-engine.js');
  const start=off.indexOf('async function clearSyncedSnapshot');
  const end=off.indexOf('export async function discardHeldSnapshot',start);
  const block=off.slice(start,end);
  assert.match(block,/pendingOperationalIntentStatus/);
  assert.match(block,/status\.syncing \|\| status\.queued/);
  assert.match(block,/if \(pending\)/);
  assert.doesNotMatch(block,/if \(pending\) await deleteMutation/);
  assert.match(block,/replayOperationalIntent\(db, pending\.changes/);
});
