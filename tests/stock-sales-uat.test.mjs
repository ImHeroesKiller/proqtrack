import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0027_inventory_cycle_correction_uat.sql', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../worker/reports.js', import.meta.url), 'utf8');
const analytics = readFileSync(new URL('../worker/analytics.js', import.meta.url), 'utf8');

test('UAT field employee cannot invoke direct stock adjustment from My Stocks', () => {
  assert.match(app,/Update via kunjungan aktif/);
  assert.doesNotMatch(app,/teamView \? '' : `<td><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT\.editStock/);
});

test('UAT supervisor stock submit uses the employee who owns the visit', () => {
  assert.match(app,/const empId = isSupervisor\(\) \? String\(visit\?\.employeeId \|\| ''\)/);
  assert.match(app,/String\(visit\.employeeId\|\|''\) !== empId/);
});

test('UAT My Sales copy is read-only derived-sales language', () => {
  assert.match(app,/Derived sales from finalized outlet stock cycles/);
  assert.doesNotMatch(app,/Record product sales against your monthly target/);
});

test('UAT correction migration permits audited same-day correction cycles', () => {
  assert.match(migration,/DROP TABLE core_inventory_cycles/);
  assert.match(migration,/CREATE UNIQUE INDEX uq_inventory_cycles_daily_base/);
  assert.match(migration,/correctionOfCycleId/);
  assert.match(migration,/uq_inventory_cycles_correction_source/);
});

test('UAT correction UI references finalized source cycle', () => {
  assert.match(app,/correctionOfCycleId:correctionOfCycleId \|\| null/);
  assert.match(app,/memperbarui penjualan otomatis tanpa menghapus riwayat/);
  assert.doesNotMatch(app,/Adjustment kedua pada tanggal yang sama diblokir/);
});

test('UAT server correction voids source derived sale and creates active replacement', () => {
  assert.match(worker,/voidReason','inventory_cycle_correction'/);
  assert.match(worker,/correctedByCycleId/);
  assert.match(worker,/correctionOfCycleId:row\.correctionOfCycleId \|\| null/);
  assert.match(worker,/lifecycleStatus:'active'/);
  assert.match(worker,/corrected source available - corrected closing/);
});

test('UAT reports and analytics still exclude voided corrected source sales', () => {
  assert.match(reports,/lifecycleStatus.*voided/);
  assert.match(analytics,/lifecycleStatus.*voided/);
});
