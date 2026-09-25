import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { operationalTransitionAllowed } from '../worker/operations.js';
import { PASSWORD_KDF_ITERATIONS, PASSWORD_KDF_RUNTIME_MAX_ITERATIONS, passwordNeedsUpgrade, verifyPassword } from '../worker/index.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('competitor UI encodes stored user content before HTML rendering', async () => {
  const [app, competitorUi, db] = await Promise.all([
    read('src/app.js'),
    read('src/routes/competitor-pages.js'),
    read('src/lib/db.js'),
  ]);
  assert.match(app, /import\('\.\/routes\/competitor-pages\.js'\)/);
  const section = competitorUi;
  assert.match(section, /esc\(c\.name\)/);
  assert.match(section, /esc\(c\.category/);
  assert.match(section, /esc\(c\.notes/);
  assert.match(section, /esc\(p\.sku/);
  assert.match(section, /esc\(p\.name/);
  assert.match(section, /esc\(p\.unit/);
  assert.match(section, /jsArg\(c\.id\)/);
  assert.match(section, /jsArg\(p\.id\)/);
  assert.match(db, /sanitizeCompetitorInput/);
  assert.match(db, /sanitizePlainText/);
});

test('password policy stays inside the Cloudflare PBKDF2 runtime ceiling', async () => {
  assert.equal(PASSWORD_KDF_RUNTIME_MAX_ITERATIONS, 100000);
  assert.equal(PASSWORD_KDF_ITERATIONS, 100000);
  assert.equal(passwordNeedsUpgrade('sha256$abc'), true);
  assert.equal(passwordNeedsUpgrade('pbkdf2$sha256$100000$salt$hash'), false);
  assert.equal(await verifyPassword('pbkdf2$sha256$600000$c2FsdA$aGFzaA', 'irrelevant'), false);
});

test('repository migrations do not ship reusable recovery password verifiers', async () => {
  const migrations = await Promise.all([
    read('migrations/0015_m7_rizky_identity_provisioning.sql'),
    read('migrations/0019_production_superadmin_bootstrap.sql'),
    read('migrations/0020_correct_superadmin_password_hash.sql'),
    read('migrations/0021_align_superadmin_hash_with_server_verifier.sql'),
  ]);
  for (const migration of migrations) {
    assert.doesNotMatch(migration, /sha256\$[a-f0-9]{64}/i);
    assert.doesNotMatch(migration, /pbkdf2\$sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+/);
  }
  assert.match(migrations[1], /disabled\$operator-provisioning-required/);
  assert.match(migrations[1], /'suspended'/);
});

test('field evidence lifecycle rejects destructive or retroactive mutations', () => {
  const employee = { role: 'employee' };

  assert.equal(operationalTransitionAllowed(employee, 'visits', {
    op: 'upsert',
    row: { id: 'V1', projectId: 'P1', outletId: 'O1', employeeId: 'E1', status: 'completed' },
  }, {
    existing: { id: 'V1', project_id: 'P1', outlet_id: 'O1', employee_id: 'E1', status: 'completed' },
  }), false);

  assert.equal(operationalTransitionAllowed(employee, 'visits', {
    op: 'upsert',
    row: {
      id: 'V1', projectId: 'P1', outletId: 'O1', employeeId: 'E1', status: 'completed',
      completedAt: '2026-09-24T08:30:00.000Z',
      checkOutLat: -6.2, checkOutLng: 106.8,
      checkOutCapturedAt: '2026-09-24T08:30:00.000Z',
    },
  }, {
    existing: {
      id: 'V1', project_id: 'P1', outlet_id: 'O1', employee_id: 'E1', status: 'in_progress',
      started_at: '2026-09-24T08:00:00.000Z', start_latitude: -6.2, start_longitude: 106.8,
    },
  }), true);

  assert.equal(operationalTransitionAllowed(employee, 'attendance', {
    op: 'delete', row: { id: 'A1' },
  }, {
    existing: { id: 'A1', project_id: 'P1', employee_id: 'E1', work_date: '2026-09-22', status: 'present' },
  }), false);

  assert.equal(operationalTransitionAllowed(employee, 'leaves', {
    op: 'upsert', row: { id: 'L1', employeeId: 'E1', status: 'pending', reason: 'changed' },
  }, {
    existing: { id: 'L1', employee_id: 'E1', status: 'approved' },
  }), false);
});

test('operational sync rejects cross-tenant global id collisions before applying revision', async () => {
  const source = await read('worker/operations.js');
  const conflictIndex = source.indexOf('ENTITY_ID_CONFLICT');
  const revisionIndex = source.indexOf('const nextRevision = currentRevision + 1');
  assert.ok(conflictIndex >= 0);
  assert.ok(revisionIndex > conflictIndex);
  assert.match(source, /crossTenantIdConflict/);
  assert.match(source, /organization_id<>\?/);
  const utils = await read('src/lib/utils.js');
  assert.match(utils, /crypto\?\.randomUUID|crypto\.randomUUID|globalThis\.crypto\?\.randomUUID/);
});

test('report approvals and schedules use M6 cloud authority instead of local workflow arrays', async () => {
  const source = await read('src/reports/phase4-fixed.js');
  assert.match(source, /ProQTrackM6/);
  assert.match(source, /workflows\.list/);
  assert.match(source, /workflows\.action/);
  assert.match(source, /schedules\.list/);
  assert.match(source, /schedules\.create/);
  assert.match(source, /schedules\.setStatus/);
  assert.doesNotMatch(source, /reportApprovals\.push/);
  assert.doesNotMatch(source, /reportSchedules\.push/);
});


test('security policy keeps a single canonical structure after password policy edits', async () => {
  const security = await read('SECURITY.md');
  assert.equal((security.match(/^# Security Policy and Boundaries$/gm) || []).length, 1);
  assert.equal((security.match(/^## Password storage dan recovery$/gm) || []).length, 1);
  assert.match(security, /Cloudflare Workers production/);
});
