import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Rizky identity is provisioned without an active human credential', async () => {
  const sql = await read('migrations/0015_m7_rizky_identity_provisioning.sql');
  assert.match(sql, /rizky\.pratama@proqtrack\.id/);
  assert.match(sql, /'supervisor','suspended'/);
  assert.match(sql, /'supervisor','inactive'/);
  assert.match(sql, /EMP-MKB-RIZKY/);
  assert.match(sql, /pbkdf2\$sha256\$100000\$/);
  assert.doesNotMatch(sql, /Proqpay2026|correct-horse|temporary-password|12345678/i);
});

test('authenticated production UAT uses ephemeral credentials and guaranteed cleanup', async () => {
  const script = await read('scripts/m7-authenticated-production-uat.sh');
  assert.match(script, /openssl rand -hex 24/);
  assert.match(script, /trap cleanup EXIT/);
  assert.match(script, /DEVICE_ACCESS_DENIED|second device before reset/);
  assert.match(script, /reset-device/);
  assert.match(script, /UAT-M7-ATT-BUDI/);
  assert.match(script, /UAT-M7-SALE-3/);
  assert.match(script, /UAT-M7-SURVEY-NADIA/);
  assert.match(script, /REVISION_CONFLICT/);
  assert.match(script, /api\/analytics\/overview/);
  assert.match(script, /api\/admin\/accounts/);
  assert.match(script, /M7 authenticated production UAT PASS/);
  assert.doesNotMatch(script, /budi\.santoso@proqtrack\.id.*password/i);
});
