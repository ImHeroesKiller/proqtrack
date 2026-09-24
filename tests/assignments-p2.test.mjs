import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignment P2 adds combined filters pagination summary and empty state', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(helper, /ASSIGNMENT_PAGE_SIZE = 15/);
  assert.match(src, /assignmentProjectFilter/);
  assert.match(src, /assignmentStatusFilter/);
  assert.match(src, /assignmentRoleFilter/);
  assert.match(src, /assignmentSearch/);
  assert.match(src, /assignmentMatchesFilters/);
  assert.match(helper, /\(!search \|\| searchDocument\.includes\(search\)\)/);
  assert.match(helper, /\(!projectId \|\| String\(assignment\.projectId \|\| ''\) === projectId\)/);
  assert.match(helper, /\(!status \|\| normalizeAssignmentStatus\(assignment\.status\) === status\)/);
  assert.match(helper, /\(!assignmentRole \|\| String\(assignment\.roleOnProject \|\| assignment\.role \|\| ''\) === assignmentRole\)/);
  assert.match(src, /assignmentResultSummary/);
  assert.match(src, /assignmentEmpty/);
  assert.match(src, /assignmentPager/);
});

test('Assignment P2 renders responsive mobile assignment cards', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /pm-assignment-table/);
  assert.match(src, /pm-assignment-table thead\{display:none\}/);
  assert.match(src, /pm-assignment-table td::before/);
  assert.match(src, /data-label="Periode \/ Kapasitas"/);
});

test('Assignment P2 localizes role and status labels', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(src, /assignmentRoleLabel/);
  assert.match(helper, /sales:'Field Sales'/);
  assert.match(src, /assignmentStatusLabel/);
  assert.match(helper, /ended:'Selesai'/);
});

test('Assignment P2 exposes live sync state', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /function assignmentSyncLabel/);
  assert.match(src, /assignmentSyncState/);
  assert.match(src, /assignmentSyncState/);
  assert.match(src, /location\.hash === "#\/assignments"/);
});

test('Assignment P2 provides assignment detail and history metadata', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /viewAssignment\(id\)/);
  for (const label of ['Alokasi Kapasitas','Alasan / Cakupan Kerja','Ditugaskan','Diakhiri','Supervisor']) {
    assert.match(src, new RegExp(label));
  }
  assert.match(src, /assignedBy/);
  assert.match(src, /endedBy/);
});

test('Assignment P2 provides live capacity visibility', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/assignment-ui.js');
  assert.match(helper, /function employeeCapacityUsage/);
  assert.match(src, /refreshAssignmentCapacity\(\)/);
  assert.match(src, /Terpakai \$\{used\}% · Tersedia \$\{available\}%/);
  assert.match(src, /assignmentCapacityHint/);
});

test('Assignment P2 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.37/);
});
