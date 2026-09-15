import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test } from '../src/lib/field-photo-evidence.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('field photo context prefers visit project and visit employee', () => {
  const db = {
    visits: [{ id: 'V1', projectId: 'P1', employeeId: 'E1', outletId: 'O1' }],
    outlets: [{ id: 'O1', projectIds: ['P1', 'P2'] }],
    projectAssignments: [{ projectId: 'P2', employeeId: 'E1', status: 'active' }],
  };
  assert.deepEqual(
    __test.resolveFieldPhotoContext(db, { employeeId: 'E1' }, 'V1', 'O1').projectId,
    'P1',
  );
});

test('field photo context derives project from outlet plus active assignment', () => {
  const db = {
    visits: [{ id: 'V1', employeeId: 'E1', outletId: 'O1' }],
    outlets: [{ id: 'O1', projectIds: ['P1', 'P2'] }],
    projectAssignments: [
      { projectId: 'P2', employeeId: 'E1', status: 'active' },
      { projectId: 'P3', employeeId: 'E1', status: 'active' },
    ],
  };
  const context = __test.resolveFieldPhotoContext(db, { employeeId: 'E1' }, 'V1', 'O1');
  assert.equal(context.projectId, 'P2');
  assert.equal(context.employeeId, 'E1');
});

test('field photo context never invents general project', () => {
  const context = __test.resolveFieldPhotoContext(
    { visits: [], outlets: [], projectAssignments: [] },
    { employeeId: 'E1' },
    'missing',
    'missing',
  );
  assert.equal(context.projectId, '');
});

test('field photo evidence types preserve rack before/after semantics', () => {
  assert.equal(__test.evidenceTypeFor('shelf'), 'rack_shelf');
  assert.equal(__test.evidenceTypeFor('rack_before'), 'rack_before');
  assert.equal(__test.evidenceTypeFor('rack_after'), 'rack_after');
  assert.equal(__test.evidenceTypeFor('selfie'), 'selfie');
});

test('compressed data URL becomes evidence Blob', () => {
  const blob = __test.dataUrlToBlob('data:image/jpeg;base64,/9j/AA==');
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'image/jpeg');
  assert.ok(blob.size > 0);
});

test('M4 bootstrap overrides field photo submit path through durable evidence queue', async () => {
  const [bridge, bootstrap] = await Promise.all([
    read('src/lib/field-photo-evidence.js'),
    read('src/m4-bootstrap.js'),
  ]);
  assert.match(bootstrap, /field-photo-evidence\.js/);
  assert.match(bridge, /window\.FT\.saveFieldPhoto = saveFieldPhotoM4/);
  assert.match(bridge, /await queueEvidence\(blob/);
  assert.match(bridge, /createFieldPhoto\(/);
  assert.match(bridge, /projectAssignments/);
  assert.doesNotMatch(bridge, /uploadAsset\(/);
  assert.doesNotMatch(bridge, /projectId:\s*['"]general['"]/);
});
