import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('../src/lib/cloud-data.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');

test('Outlets P1 escapes stored outlet and visit output', () => {
  assert.match(app, /esc\(displayValue\(o\.type\)\)/);
  assert.match(app, /esc\(displayValue\(o\.(?:id|outletNumber\|\|o\.code\|\|o\.id)\)\)|esc\(o\.outletNumber\|\|o\.code\|\|o\.id\)/);
  assert.match(app, /esc\(displayValue\(o\.owner\)\)/);
  assert.match(app, /esc\(displayValue\(o\.phone\)\)/);
  assert.match(app, /esc\(displayValue\(o\.area\)\)/);
  assert.match(app, /esc\(displayValue\(o\.visitFrequency\)\)/);
  assert.match(app, /esc\(emp \? emp\.name : '-'\)/);
  assert.match(app, /esc\(v\.checkInTime \|\| '-'\)/);
  assert.match(app, /FT\.deleteOutlet\(\$\{jsArg\(o\.id\)\}\)/);
  assert.match(app, /FT\.editOutlet\(\$\{jsArg\(o\.id\)\}\)/);
});

test('Outlets P1 validates coordinates and project/client scope locally', () => {
  assert.match(db, /function normalizeOutletCoordinates/);
  assert.match(db, /Latitude outlet tidak valid/);
  assert.match(db, /Longitude outlet tidak valid/);
  assert.match(db, /Outlet wajib terhubung ke project/);
  assert.match(db, /Project dan klien outlet tidak konsisten/);
  assert.match(db, /\['active','inactive','archived'\]/);
});

test('Outlets P1 preserves referenced outlet history through deactivation', () => {
  assert.match(db, /export function outletReferenceSummary/);
  assert.match(db, /references\.total > 0/);
  assert.match(db, /status:'inactive'/);
  assert.match(app, /histori tetap dipertahankan/);
  assert.match(worker, /OUTLET_REFERENCED_USE_INACTIVE/);
});

test('Outlets P1 enforces canonical outlet validation in Worker', () => {
  assert.match(worker, /async function validateOutletMutation/);
  for (const code of [
    'OUTLET_NAME_REQUIRED',
    'OUTLET_CLIENT_REQUIRED',
    'OUTLET_PROJECT_REQUIRED',
    'OUTLET_INVALID_STATUS',
    'OUTLET_INVALID_LATITUDE',
    'OUTLET_INVALID_LONGITUDE',
    'OUTLET_PROJECT_NOT_FOUND',
    'OUTLET_PROJECT_CLIENT_MISMATCH',
    'OUTLET_CLIENT_NOT_FOUND',
    'OUTLET_CODE_CONFLICT',
  ]) assert.match(worker, new RegExp(code));
  assert.match(worker, /validateOutletMutation\(env, organizationId, row, existing, \{ op, existingProjectIds \}\)/);
});

test('Outlets P1 waits for cloud authority before success and rolls back rejection', () => {
  assert.match(cloud, /export async function waitForOperationalSync/);
  assert.match(cloud, /export function restoreOperationalBaseline/);
  assert.match(app, /await confirmOutletCloudSync\(\)/);
  assert.match(app, /restoreOperationalBaseline\(getDB\(\)\)/);
  assert.match(app, /tersinkron ke cloud/);
});
