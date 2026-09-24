import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Projects P2 adds pagination, result summary and empty state', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /PROJECT_PAGE_SIZE = 15/);
  assert.match(src, /projectResultSummary/);
  assert.match(src, /projectEmpty/);
  assert.match(src, /projectPager/);
  assert.match(src, /projectPage\(delta\)/);
});

test('Projects P2 renders responsive project cards on mobile', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /pm-project-table/);
  assert.match(src, /pm-project-table thead\{display:none\}/);
  assert.match(src, /pm-project-table td::before/);
  assert.match(src, /data-label="Project"/);
});

test('Projects P2 localizes statuses and exposes live sync state', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /function projectStatusLabel/);
  assert.match(src, /on_hold:'Ditahan'/);
  assert.match(src, /completed:'Selesai'/);
  assert.match(src, /projectSyncState/);
  assert.match(src, /projectSyncLabel/);
  assert.match(src, /#\/my-projects/);
});

test('Projects P2 uses project-scoped manager and supervisor attribution', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /function projectManagerNames/);
  assert.match(src, /a\.projectId === projectId/);
  assert.match(src, /function projectSupervisorNames/);
  assert.match(src, /a\.roleOnProject === 'supervisor'/);
  assert.doesNotMatch(src, /find\(\(a\) => a\.role === "manager" && a\.status === "active"\)\?\.name/);
});

test('Projects P2 warns before final status when operational dependencies remain', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /function projectDependencies/);
  assert.match(src, /\['completed','cancelled'\]\.includes\(nextStatus\)/);
  assert.match(src, /assignment aktif/);
  assert.match(src, /visit belum final/);
  assert.match(src, /survey draft/);
  assert.match(src, /window\.confirm/);
});

test('Projects P2 enriches detail with operational context', async () => {
  const src = await read('src/types/index.js');
  for (const label of ['Coverage Area','Dependency Aktif','Catatan','Dibuat','Terakhir diperbarui','Manager','Supervisor']) {
    assert.match(src, new RegExp(label));
  }
});

test('Projects P2 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.31/);
});
