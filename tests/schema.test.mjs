import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowserShim } from './helpers/memory-storage.mjs';
import { buildUatDatabase } from '../src/data/uat-seed-v1.js';

installBrowserShim();

const { getDB, persistDB, __resetForTests, SCHEMA, DEFAULT_ORG_ID } = await import('../src/lib/db.js');
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

test('fresh document contains every catalog collection as an array', () => {
  __resetForTests();
  localStorage.removeItem('proqtrack_db_v6');
  const db = getDB();
  assert.equal(db._version, SCHEMA.version);
  for (const key of [...SCHEMA.tenantCollections, ...SCHEMA.globalCollections]) {
    assert.ok(Array.isArray(db[key]), `${key} should be an array`);
  }
  assert.equal(typeof db.appSettings, 'object');
  assert.ok(db.appSettings);
  assert.equal(db.currentOrganizationId, DEFAULT_ORG_ID);
});

test('migrateDB keeps user appSettings and currentOrganizationId', () => {
  __resetForTests();
  localStorage.setItem('proqtrack_db_v6', JSON.stringify({
    _version: 7,
    appSettings: { companyName: 'Acme Field', attendanceRadiusM: 80 },
    currentOrganizationId: 'ORG-DEFAULT',
  }));
  const db = getDB();
  assert.equal(db.appSettings.companyName, 'Acme Field');
  assert.equal(db.appSettings.attendanceRadiusM, 80);
  assert.equal(db.appSettings.timezone, 'Asia/Jakarta');
  assert.equal(db.currentOrganizationId, 'ORG-DEFAULT');
  __resetForTests();
  const again = getDB();
  assert.equal(again.appSettings.companyName, 'Acme Field');
  assert.equal(again.appSettings.attendanceRadiusM, 80);
});

test('migrateDB stamps organizationId on productSales and attendancePoints', () => {
  __resetForTests();
  localStorage.setItem('proqtrack_db_v6', JSON.stringify({
    _version: 11,
    productSales: [{ id: 'SAL-OLD', employeeId: 'EMP001', productId: 'PRD001', qty: 2, unitPrice: 1000, amount: 2000 }],
    attendancePoints: [{ id: 'APT-OLD', name: 'Gudang', type: 'point' }],
    projects: [{ id: 'PRJ-KEEP', name: 'Keep', clientId: 'CL-KEEP' }],
    projectSettings: [{ projectId: 'PRJ-KEEP', modules: { visits: true } }],
  }));
  const db = getDB();
  const sale = db.productSales.find(s => s.id === 'SAL-OLD');
  const point = db.attendancePoints.find(p => p.id === 'APT-OLD');
  const setting = db.projectSettings.find(s => s.projectId === 'PRJ-KEEP');
  assert.equal(sale.organizationId, DEFAULT_ORG_ID);
  assert.equal(point.organizationId, DEFAULT_ORG_ID);
  assert.equal(setting.organizationId, DEFAULT_ORG_ID);
});

test('UAT seed migrates to v14 without dropping rows or rehashing passwords', () => {
  __resetForTests();
  const seed = buildUatDatabase();
  const uatEmployeeCount = seed.employees.length;
  const uatOutletCount = seed.outlets.length;
  const uatVisitCount = seed.visits.length;
  localStorage.setItem('proqtrack_db_v6', JSON.stringify(seed));
  const db = getDB();
  assert.equal(db._version, 14);
  assert.equal(db.employees.length, uatEmployeeCount);
  assert.equal(db.outlets.length, uatOutletCount);
  assert.equal(db.visits.length, uatVisitCount);
  assert.ok(db.accounts.every(a => String(a.password).startsWith('sha256$')));
  assert.ok(db.accounts.filter(a => a.role === 'superadmin').every(a => a.organizationId == null));
  assert.ok(db.employees.filter(e => String(e.id).startsWith('EMP-UAT')).every(e => e.organizationId === DEFAULT_ORG_ID));
  assert.ok(db.outlets.every(o => Array.isArray(o.projectIds) && o.projectId === undefined));
  const sales = db.projectAssignments.find(a => a.id === 'ASN-UAT-004');
  const merch = db.projectAssignments.find(a => a.id === 'ASN-UAT-007');
  const ended = db.projectAssignments.find(a => a.id === 'ASN-UAT-008');
  assert.equal(sales.roleOnProject, 'sales');
  assert.equal(merch.roleOnProject, 'sales');
  assert.equal(ended.status, 'removed');
  assert.equal(db.attendance.find(a => a.id === 'ATT-UAT-001').status, 'hadir');
  assert.equal(db.attendance.find(a => a.id === 'ATT-UAT-002').status, 'terlambat');
  assert.equal(db.attendance.find(a => a.id === 'ATT-UAT-004').status, 'tidak hadir');
  assert.ok(Array.isArray(db.productSales));
  assert.ok(Array.isArray(db.attendancePoints));
  assert.ok(db.projectSettings.every(s => s.organizationId === DEFAULT_ORG_ID));
  assert.ok(db.accounts.filter(a => a.role !== 'superadmin').every(a => a.organizationId === DEFAULT_ORG_ID));
  assert.ok(db.reportTemplates.length >= 3);
  assert.equal(db.reportSettings.companyName, 'ProQTrack UAT');
});

test('persistDB writes the live cache and keeps it after notify', () => {
  __resetForTests();
  localStorage.removeItem('proqtrack_db_v6');
  localStorage.removeItem('proqtrack_db_v7');
  const db = getDB();
  db.reportFilters = db.reportFilters || [];
  db.reportFilters.push({ id: 'RPF-PERSIST', name: 'test-filter' });
  persistDB('schema-test');
  assert.equal(getDB().reportFilters.some(row => row.id === 'RPF-PERSIST'), true);
  const v6 = JSON.parse(localStorage.getItem('proqtrack_db_v6'));
  const v7 = JSON.parse(localStorage.getItem('proqtrack_db_v7'));
  assert.equal(v6.reportFilters.some(row => row.id === 'RPF-PERSIST'), true);
  assert.equal(v7.reportFilters.some(row => row.id === 'RPF-PERSIST'), true);
});

test('report, avatar, and logo addons no longer write localStorage themselves', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = [
    'src/employee-avatars.js',
    'src/client-logo-auto.js',
    'src/project-client-logos.js',
    'src/types/reports-export.js',
    'src/types/reports-export-hotfix.js',
    'src/reports/index.js',
    'src/reports/index-v2.js',
    'src/reports/phase4.js',
    'src/reports/phase4-fixed.js',
    'src/reports/phase4-preview.js',
  ];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    assert.doesNotMatch(text, /localStorage\.(get|set)Item/, `${rel} still touches localStorage`);
    assert.match(text, /from ['"].*lib\/db\.js['"]/, `${rel} should import the shared db layer`);
  }
});
