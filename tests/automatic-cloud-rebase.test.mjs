import test from 'node:test';
import assert from 'node:assert/strict';
import { __test as rebase } from '../src/lib/cloud-data.js';

function snap(employees = []) {
  return { employees };
}

test('three-way rebase preserves independent local and cloud field edits', () => {
  const base = snap([{ id:'E1', name:'Budi', area:'Jakarta', phone:'111' }]);
  const local = snap([{ id:'E1', name:'Budi', area:'Bandung', phone:'111' }]);
  const remote = snap([{ id:'E1', name:'Budi Raharja', area:'Jakarta', phone:'111' }]);

  const result = rebase.rebaseSnapshotIntent(base, local, remote);
  assert.equal(result.changes.length, 1);
  const row = result.mergedSnapshot.employees[0];
  assert.equal(row.name, 'Budi Raharja');
  assert.equal(row.area, 'Bandung');
  assert.equal(result.conflictFields, 0);
});

test('same-field conflict is resolved cloud-first without manual review', () => {
  const base = snap([{ id:'E1', phone:'111' }]);
  const local = snap([{ id:'E1', phone:'222' }]);
  const remote = snap([{ id:'E1', phone:'333' }]);

  const result = rebase.rebaseSnapshotIntent(base, local, remote);
  assert.equal(result.mergedSnapshot.employees[0].phone, '333');
  assert.equal(result.changes.length, 0);
  assert.equal(result.conflictFields, 1);
  assert.equal(result.droppedChanges, 1);
});

test('cloud delete wins over stale device update', () => {
  const base = snap([{ id:'E1', name:'Budi', area:'Jakarta' }]);
  const local = snap([{ id:'E1', name:'Budi', area:'Bandung' }]);
  const remote = snap([]);

  const result = rebase.rebaseSnapshotIntent(base, local, remote);
  assert.equal(result.mergedSnapshot.employees.length, 0);
  assert.equal(result.changes.length, 0);
  assert.equal(result.droppedChanges, 1);
});

test('device delete is not allowed to erase a record changed by another user', () => {
  const base = snap([{ id:'E1', name:'Budi', area:'Jakarta' }]);
  const local = snap([]);
  const remote = snap([{ id:'E1', name:'Budi Raharja', area:'Jakarta' }]);

  const result = rebase.rebaseSnapshotIntent(base, local, remote);
  assert.equal(result.mergedSnapshot.employees.length, 1);
  assert.equal(result.mergedSnapshot.employees[0].name, 'Budi Raharja');
  assert.equal(result.droppedChanges, 1);
});

test('new device record is replayed when cloud has no record with the same id', () => {
  const base = snap([]);
  const local = snap([{ id:'E2', name:'Ayu', area:'Bogor' }]);
  const remote = snap([]);

  const result = rebase.rebaseSnapshotIntent(base, local, remote);
  assert.equal(result.changes.length, 1);
  assert.equal(result.mergedSnapshot.employees[0].id, 'E2');
});

test('offline stored intent rebases against latest cloud instead of replaying whole snapshot', () => {
  const baseRow = { id:'E1', name:'Budi', area:'Jakarta', phone:'111' };
  const stored = [{
    entity:'employees',
    op:'upsert',
    baseRow,
    row:{ ...baseRow, area:'Bandung' },
  }];
  const remote = snap([{ ...baseRow, name:'Budi Raharja' }]);

  const result = rebase.rebaseStoredIntent(stored, remote);
  assert.equal(result.changes.length, 1);
  assert.equal(result.mergedSnapshot.employees[0].name, 'Budi Raharja');
  assert.equal(result.mergedSnapshot.employees[0].area, 'Bandung');
  assert.equal(result.conflictFields, 0);
});
