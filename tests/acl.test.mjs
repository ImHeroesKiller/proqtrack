import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB,
  resetDB,
  __resetForTests,
  authenticate,
  resumeSession,
  getActor,
  getEmployees,
  getVisits,
  getVisitsByEmployee,
  getEmployee,
  createEmployee,
  createStock,
  updateStock,
  deleteStock,
  updateAppSettings,
  registerTestDevice,
  updateLeave,
  getLeaves,
  getAccounts,
  deleteVisit,
  deleteLeave,
  deleteFieldPhoto,
  getProduct,
  getStocks,
  getStocksByOutlet,
  updateCompetitorIntel,
} = await import('../src/lib/db.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email, dev = device('DEV-TEST-1')) {
  const acc = authenticate(email, TEST_PASSWORD, dev);
  assert.ok(acc, `login failed for ${email}`);
  setSession(acc);
  return acc;
}

test('fresh DB is version 15 and keeps eight seed employees', () => {
  prepare();
  const db = getDB();
  assert.equal(db._version, 15);
  assert.equal(db.employees.length, 8);
});

test('legacy manager@ is Head and pm@ is a one-project Manager', () => {
  prepare();
  login('manager@proqtrack.id');
  assert.equal(getActor().role, 'head');
  login('pm@proqtrack.id');
  assert.equal(getActor().role, 'manager');
  assert.equal(getActor().projectId, 'PRJ001');
});

test('getActor re-reads role from the database, not from mutated state', () => {
  prepare();
  const sales = login('budi.santoso@proqtrack.id');
  assert.equal(getActor().role, 'employee');
  assert.equal(sales.password, undefined);
  window.FT.state.account = { ...sales, role: 'superadmin' };
  assert.equal(getActor().role, 'employee');
  assert.throws(() => createEmployee({
    name: 'Hacker',
    email: 'hacker@proqtrack.id',
    phone: '0812',
    area: 'Jakarta',
    password: 'password12',
  }), /Akses ditolak/);
});

test('sales only see their own visits and cannot read another employee record', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const mine = getVisits();
  assert.ok(mine.length > 0);
  assert.ok(mine.every(v => v.employeeId === 'EMP001'));
  assert.equal(getVisitsByEmployee('EMP002').length, 0);
  assert.equal(getEmployee('EMP002'), null);
  assert.deepEqual(getEmployees().map(e => e.id), ['EMP001']);
});

test('supervisor sees team members, not the whole org', () => {
  prepare();
  login('rizki.pratama@proqtrack.id');
  const ids = getEmployees().map(e => e.id).sort();
  assert.ok(ids.includes('EMP001'));
  assert.ok(ids.includes('EMP005'));
  assert.equal(ids.includes('EMP006'), false);
});

test('sales cannot write org settings, test devices, or delete stock', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  assert.throws(() => updateAppSettings({ companyName: 'Hacked' }), /Akses ditolak/);
  assert.throws(() => updateAppSettings({ testDevices: [{ id: 'x' }] }), /Akses ditolak/);
  assert.throws(() => registerTestDevice(device('DEV-X')), /Akses ditolak/);
  const stockId = getDB().stocks[0]?.id;
  if (stockId) assert.throws(() => deleteStock(stockId), /Akses ditolak/);
});

test('stock mutations require a logged-in actor', () => {
  prepare();
  setSession(null);
  assert.throws(() => createStock({ outletId: 'OUT001', productId: 'PRD001', quantity: 1, minStock: 0 }), /Akses ditolak/);
  assert.throws(() => updateStock('missing', { quantity: 2 }), /Akses ditolak/);
});

test('superadmin can approve leave', () => {
  prepare();
  login('superadmin@proqtrack.id');
  const pending = getLeaves().find(l => l.status === 'pending') || getDB().leaves.find(l => l.status === 'pending');
  assert.ok(pending);
  const updated = updateLeave(pending.id, { status: 'approved' });
  assert.equal(updated.status, 'approved');
});

test('createEmployee stamps organizationId on the login account immediately', () => {
  prepare();
  login('manager@proqtrack.id');
  const emp = createEmployee({
    name: 'UAT New Sales',
    email: 'newsales@proqtrack.id',
    phone: '0812-0000-9999',
    area: 'Depok',
    role: 'Field Sales',
    password: 'password12',
  });
  assert.equal(emp.organizationId, 'ORG-DEFAULT');
  const raw = getDB().accounts.find(a => a.employeeId === emp.id);
  assert.ok(raw);
  assert.equal(raw.organizationId, emp.organizationId);
  assert.equal(raw.role, 'employee');
  const listed = getAccounts().find(a => a.employeeId === emp.id);
  assert.ok(listed, 'new login must be visible before remigrate');
  assert.equal(listed.organizationId, emp.organizationId);
});

test('resumeSession never returns a password and rejects a foreign device', () => {
  prepare();
  const first = device('DEV-PHONE-A', 'alpha-secret');
  const acc = authenticate('budi.santoso@proqtrack.id', TEST_PASSWORD, first);
  assert.ok(acc);
  setSession(null);
  const ok = resumeSession(acc.id, first);
  assert.ok(ok);
  assert.equal(ok.password, undefined);
  const other = resumeSession(acc.id, device('DEV-PHONE-B', 'beta-secret'));
  assert.equal(other, null);
});

test('deletes require a logged-in actor and do not save when the row is missing', () => {
  prepare();
  setSession(null);
  const visitId = getDB().visits[0].id;
  const leaveId = getDB().leaves[0].id;
  const photoId = getDB().fieldPhotos[0]?.id || 'PHO-MISSING';
  const visitCount = getDB().visits.length;
  const leaveCount = getDB().leaves.length;
  assert.throws(() => deleteVisit(visitId), /Akses ditolak/);
  assert.throws(() => deleteLeave(leaveId), /Akses ditolak/);
  assert.throws(() => deleteFieldPhoto(photoId), /Akses ditolak/);
  assert.equal(getDB().visits.length, visitCount);
  assert.equal(getDB().leaves.length, leaveCount);
  login('manager@proqtrack.id');
  assert.equal(deleteVisit('VIS-DOES-NOT-EXIST'), undefined);
  assert.equal(getDB().visits.length, visitCount);
});

test('sales cannot update another employee stock or cross-org intel', () => {
  prepare();
  login('manager@proqtrack.id');
  const stock = createStock({
    outletId: 'OUT001',
    productId: 'PRD001',
    quantity: 9,
    minStock: 1,
    updatedBy: 'EMP002',
  });
  const intel = getDB().competitorIntel[0];
  assert.ok(intel);
  intel.organizationId = 'ORG-OTHER';
  intel.recordedBy = 'EMP-OTHER';
  login('budi.santoso@proqtrack.id', device('DEV-SALES-STOCK'));
  assert.throws(() => updateStock(stock.id, { quantity: 1 }), /Akses ditolak/);
  assert.equal(updateCompetitorIntel(intel.id, { notes: 'hacked' }), null);
  assert.notEqual(getStocks().find(s => s.id === stock.id)?.quantity, 1);
});

test('product and stock lookups stay inside the current org', () => {
  prepare();
  login('manager@proqtrack.id');
  const foreign = getDB().products[0];
  foreign.organizationId = 'ORG-OTHER';
  assert.equal(getProduct(foreign.id), undefined);
  const stock = getDB().stocks[0];
  if (stock) {
    stock.organizationId = 'ORG-OTHER';
    assert.equal(getStocksByOutlet(stock.outletId).some(s => s.id === stock.id), false);
  }
});

test('seeded non-superadmin accounts carry organizationId', () => {
  prepare();
  const accounts = getDB().accounts;
  assert.ok(accounts.filter(a => a.role !== 'superadmin').every(a => a.organizationId === 'ORG-DEFAULT'));
  assert.ok(accounts.filter(a => a.role === 'superadmin').every(a => a.organizationId == null));
});
