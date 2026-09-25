import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('leave and stock collections are cloud authoritative', async () => {
  const [client, worker] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('worker/operations.js'),
  ]);
  for (const entity of ['leaves', 'stocks']) {
    assert.match(client, new RegExp(`'${entity}'`));
    assert.match(worker, new RegExp(`${entity}: 'core_${entity}'`));
    assert.match(worker, new RegExp(`${entity}: decodeRows\\('${entity}'`));
  }
});

test('Demo leave and stock rows reference the current Demo master data', async () => {
  const sql = await read('migrations/0023_cloud_leaves_stocks.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_leaves/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_stocks/);
  assert.match(sql, /'LV-DEMO-001','ORG-DEFAULT','EMP-DEMO-001'/);
  assert.match(sql, /'STK-DEMO-001','ORG-DEFAULT','PRJ-DEMO-SALES','OUT-DEMO-001','PROD-DEMO-001'/);
  assert.match(sql, /demo-leaves-stocks-v1/);
});

test('local selectors reject orphan rows before computing badges', async () => {
  const [db, attendanceDomain] = await Promise.all([read('src/lib/db.js'), read('src/lib/db-attendance-leave.js')]);
  assert.match(attendanceDomain, /db\.leaves\)\.filter\(row => employeeIds\.has\(row\.employeeId\)\)/);
  assert.match(db, /db\.stocks\)\.filter\(row => outletIds\.has\(row\.outletId\) && productIds\.has\(row\.productId\)\)/);
});
