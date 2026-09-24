import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  outletStatusSummary,
  outletSyncPresentation,
  normalizeOutletCatalog,
  outletFormModel,
  outletLifecycleAction,
} from '../src/lib/outlet-ui.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('Outlets P3 status and sync presentation helpers are deterministic', () => {
  assert.deepEqual(
    outletStatusSummary([{status:'active'},{status:'inactive'},{status:'archived'},{status:'active'}]),
    { total:4, active:2, inactive:1, archived:1 },
  );
  assert.deepEqual(outletSyncPresentation({error:'FAIL'}),{state:'error',label:'Sync bermasalah',className:'status-inactive'});
  assert.deepEqual(outletSyncPresentation({syncing:true}),{state:'syncing',label:'Sinkronisasi…',className:'status-pending'});
  assert.deepEqual(outletSyncPresentation({}),{state:'synced',label:'Cloud synced',className:'status-active'});
});

test('Outlets P3 catalog normalization preserves current legacy values', () => {
  const catalog = normalizeOutletCatalog(
    {segments:['Modern'],ownerships:['Owned'],types:['Minimarket'],notesMode:'dropdown',notesOptions:['A']},
    {channel:'General Trade',ownership:'Franchise',type:'Warung',notes:'Legacy note'},
  );
  assert.deepEqual(catalog.segments,['General Trade','Modern']);
  assert.deepEqual(catalog.ownerships,['Franchise','Owned']);
  assert.deepEqual(catalog.types,['Warung','Minimarket']);
  assert.deepEqual(catalog.notesOptions,['Legacy note','A']);
  assert.equal(catalog.notesMode,'dropdown');
});

test('Outlets P3 form model gives create and edit one canonical shape', () => {
  const create = outletFormModel({}, {types:['Toko']});
  assert.equal(create.isEdit,false);
  assert.equal(create.status,'active');
  assert.equal(create.visitFrequency,'Mingguan');

  const edit = outletFormModel(
    {id:'OUT-1',name:'Outlet A',projectIds:['PRJ-1'],type:'Legacy',status:'inactive',lat:-6.2,lng:106.8},
    {types:['Toko']},
  );
  assert.equal(edit.isEdit,true);
  assert.equal(edit.projectId,'PRJ-1');
  assert.equal(edit.type,'Legacy');
  assert.equal(edit.status,'inactive');
  assert.deepEqual(edit.catalog.types,['Legacy','Toko']);
});

test('Outlets P3 lifecycle helper centralizes deactivate versus delete wording', () => {
  assert.deepEqual(outletLifecycleAction({status:'active'},3),{
    action:'deactivate',
    label:'Nonaktifkan',
    confirm:'Outlet memiliki 3 data operasional terkait. Outlet akan dinonaktifkan agar histori tetap utuh. Lanjutkan?',
  });
  assert.equal(outletLifecycleAction({status:'inactive'},0).action,'delete');
  assert.equal(outletLifecycleAction({},0).label,'Hapus');
});

test('Outlets P3 runtime uses shared helpers instead of local duplicate models', () => {
  for (const marker of [
    'outletStatusSummary(outlets)',
    'outletSyncPresentation(cloudDataStatus())',
    'normalizeOutletCatalog(projectId ? getProjectStoreSettings(projectId) : defaultStoreCatalog())',
    'outletFormModel({}, defaultStoreCatalog())',
    'outletFormModel(o,projectId?getProjectStoreSettings(projectId):defaultStoreCatalog())',
    'outletLifecycleAction(outlet,references.total)',
  ]) assert.ok(app.includes(marker), marker);
  assert.equal(app.includes('function outletStatusSummary(outlets = [])'), false);
});

test('Outlets P3 helper is available in offline PWA shell', () => {
  assert.match(sw,/Outlets P3 maintainability refresh/);
  assert.match(sw,/proqtrack-v12\.44/);
  assert.match(sw,/\.\/src\/lib\/outlet-ui\.js/);
});
