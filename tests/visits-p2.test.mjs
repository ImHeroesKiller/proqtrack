import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Visits P2 adds project outlet date filters and bounded pagination', async () => {
  const app = await read('src/app.js');
  assert.match(app, /id="visitProjectFilter"/);
  assert.match(app, /id="visitOutletFilter"/);
  assert.match(app, /id="visitDateFrom"/);
  assert.match(app, /id="visitDateTo"/);
  assert.match(app, /const pageSize = 20/);
  assert.match(app, /matched\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/);
});

test('Visits P2 keeps historical inactive labels while scheduling only active entities', async () => {
  const app = await read('src/app.js');
  assert.match(app, /employee\.status === 'active'/);
  assert.match(app, /outlet\.status === 'active'/);
  assert.match(app, /Nonaktif/);
});

test('Visits P2 final correction uses the existing approval workflow', async () => {
  const app = await read('src/app.js');
  assert.match(app, /workflowType:'visit_exception'/);
  assert.match(app, /subjectType:'visit'/);
  assert.match(app, /visitCorrectionInFlight/);
  assert.match(app, /approval Supervisor dan Manager/);
});

test('Visits P2 surfaces GPS evidence and mobile card layout', async () => {
  const field = await read('src/field-sales.js');
  const html = await read('index.html');
  assert.match(field, /Bukti GPS Check In/);
  assert.match(field, /Bukti GPS Check Out/);
  assert.match(field, /checkOutAccuracyM/);
  assert.match(html, /visit-responsive-table tbody tr\[data-visit-id\]/);
  assert.match(html, /@media \(max-width: 760px\)/);
});
