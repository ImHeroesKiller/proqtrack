import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB, resetDB, __resetForTests, authenticate, getEmployees, getVisits,
  createProductSale, productSalesAnalytics, saveDB,
} = await import('../src/lib/db.js');
const { buildActivityEvents, exportCsv, PAGE_SIZE } = await import('../src/reports/m3.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email, dev = device('DEV-M3-1')) {
  const acc = authenticate(email, TEST_PASSWORD, dev);
  assert.ok(acc, `login failed ${email}`);
  setSession(acc);
  return acc;
}

test('head cannot read employees from another organization', () => {
  prepare();
  login('manager@proqtrack.id');
  const db = getDB();
  db.employees.push({
    id: 'EMP-XORG', name: 'Foreign', email: 'x@other.id', role: 'Field Sales',
    organizationId: 'ORG-OTHER', status: 'active', supervisorId: null,
  });
  saveDB();
  assert.equal(getEmployees().some(e => e.id === 'EMP-XORG'), false);
});

test('manager visits stay on assigned project', () => {
  prepare();
  login('pm@proqtrack.id');
  const visits = getVisits();
  assert.ok(visits.every(v => !v.projectId || v.projectId === 'PRJ001'));
});

test('activity timeline still renders when rack after is missing', () => {
  const visit = { id: 'V1', employeeId: 'EMP001', outletId: 'O1', date: '2026-08-20', checkInTime: '09:00', projectId: 'PRJ001' };
  const events = buildActivityEvents({
    attendance: [], pairs: [{ visitId: 'V1', beforePhotoId: 'P1', afterPhotoId: null, createdAt: '2026-08-20T09:10:00Z' }],
    photos: [{ id: 'P1', visitId: 'V1', recordedAt: '2026-08-20T09:10:00Z' }],
    stocks: [], prices: [], intel: [], responses: [], sales: [], employees: [], outlets: [],
  }, visit);
  assert.ok(events.some(e => e.kind === 'Rack Before'));
  assert.equal(events.some(e => e.kind === 'Rack After'), false);
});

test('product sales analytics uses actual transactions', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const product = getDB().products.find(p => p.status === 'active');
  createProductSale({ employeeId: 'EMP001', productId: product.id, qty: 3, unitPrice: 1500 });
  const a = productSalesAnalytics();
  assert.equal(a.total >= 4500, true);
  assert.ok(a.byProduct.some(r => r.amount >= 4500));
});

test('csv export helper returns row count without throwing on null cells', () => {
  const result = exportCsv('visits', ['id', 'notes'], [{ id: 'V1', notes: null }, { id: 'V2', notes: { x: 1 } }]);
  assert.equal(result.rows.length, 2);
  assert.equal(PAGE_SIZE, 100);
});
