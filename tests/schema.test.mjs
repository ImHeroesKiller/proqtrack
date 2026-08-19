import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim } from './helpers/memory-storage.mjs';

installBrowserShim();

const { getDB, __resetForTests } = await import('../src/lib/db.js');
const { getLinkedProjectIds } = await import('../src/lib/db.js');

test('migrateDB normalizes assignment roles and outlet projectIds', () => {
  __resetForTests();
  localStorage.setItem('proqtrack_db_v6', JSON.stringify({
    _version: 7,
    accounts: [],
    employees: [],
    outlets: [{ id: 'OUT-X', name: 'Toko', projectId: 'PRJ001' }],
    projectAssignments: [
      { id: 'ASN1', employeeId: 'EMP001', projectId: 'PRJ001', roleOnProject: 'field_sales', status: 'active' },
      { id: 'ASN2', employeeId: 'EMP002', projectId: 'PRJ001', roleOnProject: 'merchandiser', status: 'ended' },
    ],
  }));
  const db = getDB();
  assert.equal(db._version, 14);
  assert.deepEqual(db.outlets.find(o => o.id === 'OUT-X').projectIds, ['PRJ001']);
  assert.equal(db.outlets.find(o => o.id === 'OUT-X').projectId, undefined);
  const sales = db.projectAssignments.find(a => a.id === 'ASN1');
  const ended = db.projectAssignments.find(a => a.id === 'ASN2');
  assert.equal(sales.roleOnProject, 'sales');
  assert.equal(ended.roleOnProject, 'sales');
  assert.equal(ended.status, 'removed');
});

test('getLinkedProjectIds accepts both legacy and array shapes', () => {
  assert.deepEqual(getLinkedProjectIds({ projectId: 'P1' }), ['P1']);
  assert.deepEqual(getLinkedProjectIds({ projectIds: ['P1', 'P2'] }), ['P1', 'P2']);
  assert.deepEqual(getLinkedProjectIds(null), []);
});

test('v7 key is mirrored from v6 after migrate', () => {
  __resetForTests();
  localStorage.removeItem('proqtrack_db_v6');
  localStorage.removeItem('proqtrack_db_v7');
  const db = getDB();
  const v7 = JSON.parse(localStorage.getItem('proqtrack_db_v7'));
  assert.equal(v7._version, db._version);
  assert.equal(v7.employees.length, db.employees.length);
});
