import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../migrations/0011_m7_mkb_uat_tenant.sql', import.meta.url), 'utf8');
const runbook = fs.readFileSync(new URL('../docs/production/M7_MKB_FULL_PRODUCTION_UAT.md', import.meta.url), 'utf8');

test('M7 seeds isolated MKB tenant and cloud cutover state', () => {
  assert.match(migration, /'ORG-MKB', 'MKB', 'Mitra Kreasi Bersama'/);
  assert.match(migration, /'PRJ-MKB-SALES-UAT'/);
  assert.match(migration, /'CL-MKB-FMCG-UAT'/);
  assert.match(migration, /'ORG-MKB', 1, 'cloud'/);
});

test('M7 MKB master data includes field execution coverage', () => {
  const outletIds = migration.match(/'OUT-MKB-00[1-6]'/g) || [];
  for (let i = 1; i <= 6; i += 1) assert.match(migration, new RegExp(`OUT-MKB-00${i}`));
  for (let i = 1; i <= 5; i += 1) assert.match(migration, new RegExp(`PROD-MKB-00${i}`));
  assert.ok(outletIds.length >= 6);
  assert.match(migration, /SURV-MKB-PERFECT-STORE/);
  assert.match(migration, /Rack Before|Perfect Store/i);
});

test('M7 links existing identities without publishing passwords', () => {
  for (const email of [
    'head@proqtrack.id',
    'manager-re@proqtrack.id',
    'rizky.pratama@proqtrack.id',
    'budi.santoso@proqtrack.id',
    'nadia.permata@proqtrack.id',
  ]) assert.match(migration, new RegExp(email.replaceAll('.', '\\.')));

  assert.doesNotMatch(migration, /INSERT\s+.*auth_users\s*\(/is);
  assert.doesNotMatch(migration, /password_hash\s*[,)]/i);
  assert.match(migration, /FROM auth_users/);
  assert.match(migration, /status='active'/);
});

test('M7 runbook covers every production-critical path', () => {
  for (const phrase of [
    'Tenant and authentication isolation',
    'Merchandiser: real mobile field day',
    'SPG: mobile sales execution',
    'Offline-first recovery',
    'Supervisor operations',
    'Manager desktop control',
    'Head executive approval',
    'Cross-tenant negative tests',
    'Reliability and failure handling',
    'Go-live exit criteria',
  ]) assert.match(runbook, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

test('M7 runbook protects secrets and enforces P0/P1 release criteria', () => {
  assert.match(runbook, /Do not put account passwords, bearer tokens or raw secrets/i);
  assert.match(runbook, /no P0\/P1 open defect/i);
  assert.match(runbook, /offline restart \+ reconnect PASS/i);
  assert.match(runbook, /evidence R2 PASS/i);
  assert.match(runbook, /workflow separation-of-duties PASS/i);
  assert.match(runbook, /report generation\/download PASS/i);
});
