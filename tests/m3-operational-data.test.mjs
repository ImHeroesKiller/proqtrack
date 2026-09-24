import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  authorizeOperationalChange,
  canonicalizeLegacySnapshot,
  validateImportSnapshot,
} from '../worker/operations.js';
import { __test as gateway } from '../worker/operations-gateway.js';

const migration = readFileSync(new URL('../migrations/0007_operational_api_cutover.sql', import.meta.url), 'utf8');
const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../worker/main.js', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/lib/cloud-data.js', import.meta.url), 'utf8');
const cutover = readFileSync(new URL('../src/cloud-cutover.js', import.meta.url), 'utf8');
const runtimeBootstrap = readFileSync(new URL('../src/bootstrap.js', import.meta.url), 'utf8');

function legacyFixture() {
  return {
    employees: [{ id: 'EMP-1', name: 'Sales One', email: 'sales@x.test', status: 'active' }],
    outlets: [{ id: 'OUT-1', name: 'Outlet One', status: 'active' }],
    products: [{ id: 'PRD-1', name: 'Product One', sku: 'SKU-1', status: 'active' }],
    visits: [{ id: 'VIS-1', employeeId: 'EMP-1', outletId: 'OUT-1', status: 'completed' }],
    attendance: [{ id: 'ATT-1', employeeId: 'EMP-1', date: '2026-09-15', status: 'present' }],
    productSales: [{ id: 'SAL-1', employeeId: 'EMP-1', outletId: 'OUT-1', productId: 'PRD-1', quantity: 2, amount: 10000 }],
    accounts: [{ id: 'ACC-1', employeeId: 'EMP-1', email: 'sales@x.test', role: 'employee', password: 'sha256$abc' }],
  };
}

test('legacy snapshot is canonicalized into a tenant-scoped client/project graph', () => {
  const result = canonicalizeLegacySnapshot(legacyFixture(), 'ORG-TEST');
  assert.equal(result.clients.length, 1);
  assert.match(result.clients[0].id, /^CL-LEGACY-ORG-TEST$/);
  assert.equal(result.projects.length, 1);
  assert.match(result.projects[0].id, /^PRJ-LEGACY-ORG-TEST$/);
  assert.equal(result.projectAssignments.length, 1);
  assert.equal(result.projectAssignments[0].employeeId, 'EMP-1');
  assert.equal(result.outlets[0].projectIds[0], result.projects[0].id);
  assert.equal(result.products[0].projectIds[0], result.projects[0].id);
  assert.equal(result.visits[0].projectId, result.projects[0].id);
  assert.equal(result.attendance[0].projectId, result.projects[0].id);
  assert.equal(result.productSales[0].projectId, result.projects[0].id);
  assert.equal(result.projectProducts[0].productId, 'PRD-1');
});

test('import validation rejects duplicate operational ids', () => {
  const snapshot = canonicalizeLegacySnapshot(legacyFixture(), 'ORG-TEST');
  snapshot.clients.push({ ...snapshot.clients[0] });
  const validation = validateImportSnapshot(snapshot);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(issue => /duplicate id/i.test(issue)));
});

test('manager and field roles cannot escape normalized project and employee scope', () => {
  const manager = { role: 'manager', projectIds: ['PRJ-1'], clientIds: ['CL-1'] };
  const context = { accessibleEmployeeIds: new Set(['EMP-1']), batchAssignments: [] };
  assert.equal(authorizeOperationalChange(manager, 'clients', { row: { id: 'CL-1' } }, context), false);
  assert.equal(authorizeOperationalChange(manager, 'projects', { row: { id: 'PRJ-2' } }, context), false);
  assert.equal(authorizeOperationalChange(manager, 'outlets', { row: { id: 'OUT-1', projectIds: ['PRJ-1'] } }, context), true);
  assert.equal(authorizeOperationalChange(manager, 'visits', { row: { id: 'V-1', projectId: 'PRJ-1', employeeId: 'EMP-1' } }, context), true);
  assert.equal(authorizeOperationalChange(manager, 'visits', { row: { id: 'V-2', projectId: 'PRJ-2', employeeId: 'EMP-1' } }, context), false);

  const employee = { role: 'employee', projectIds: ['PRJ-1'], clientIds: ['CL-1'] };
  assert.equal(authorizeOperationalChange(employee, 'visits', { row: { id: 'V-1', projectId: 'PRJ-1', employeeId: 'EMP-1' } }, context), true);
  assert.equal(authorizeOperationalChange(employee, 'visits', { row: { id: 'V-2', projectId: 'PRJ-1', employeeId: 'EMP-2' } }, context), false);
  assert.equal(authorizeOperationalChange(employee, 'products', { row: { id: 'P-1', projectIds: ['PRJ-1'] } }, context), false);
});

test('manager cannot take over an existing outlet outside current project scope', () => {
  const manager = { role: 'manager', projectIds: ['PRJ-1'], clientIds: ['CL-1'] };
  const baseContext = { accessibleEmployeeIds: new Set(), batchAssignments: [] };

  assert.equal(authorizeOperationalChange(
    manager,
    'outlets',
    { op:'upsert', row:{ id:'OUT-FOREIGN', projectIds:['PRJ-1'] } },
    { ...baseContext, existing:{ id:'OUT-FOREIGN' }, existingProjectIds:['PRJ-2'] },
  ), false);

  assert.equal(authorizeOperationalChange(
    manager,
    'outlets',
    { op:'upsert', row:{ id:'OUT-OWN', projectIds:['PRJ-1'] } },
    { ...baseContext, existing:{ id:'OUT-OWN' }, existingProjectIds:['PRJ-1'] },
  ), true);

  assert.equal(authorizeOperationalChange(
    manager,
    'outlets',
    { op:'upsert', row:{ id:'OUT-UNSCOPED', projectIds:['PRJ-1'] } },
    { ...baseContext, existing:{ id:'OUT-UNSCOPED' }, existingProjectIds:[] },
  ), false);
});

test('import gateway defers manager project membership and unsafe survey creator references', () => {
  const input = {
    snapshot: {
      accounts: [{ email: 'manager@x.test', role: 'manager', projectId: 'PRJ-1' }],
      projects: [{ id: 'PRJ-1', status: 'on_hold' }],
      surveyTemplates: [{ id: 'SUR-1', createdBy: 'EMP-99' }],
    },
  };
  const sanitized = gateway.sanitizeImportBody(input);
  assert.equal(sanitized.snapshot.accounts[0].projectId, null);
  assert.equal(sanitized.snapshot.accounts[0].legacyProjectId, 'PRJ-1');
  assert.equal(sanitized.snapshot.projects[0].status, 'paused');
  assert.equal(sanitized.snapshot.projects[0].legacyStatus, 'on_hold');
  assert.equal(sanitized.snapshot.surveyTemplates[0].createdBy, null);
  assert.equal(sanitized.snapshot.surveyTemplates[0].legacyCreatedBy, 'EMP-99');
});

test('bootstrap compatibility restores UI statuses and project-product relations', () => {
  const output = gateway.compatibilityBootstrap({
    data: {
      clients: [{ id: 'CL-1', status: 'active', legacyStatus: 'prospect' }],
      projects: [{ id: 'PRJ-1', status: 'paused' }, { id: 'PRJ-2', status: 'closed' }],
      projectAssignments: [{ id: 'A-1', status: 'ended' }],
      products: [{ id: 'P-1', organizationId: 'ORG-1', projectIds: ['PRJ-1'] }],
      projectProducts: [],
      surveyTemplates: [{ id: 'S-1', legacyCreatedBy: 'EMP-1', createdBy: null }],
    },
  });
  assert.equal(output.data.clients[0].status, 'prospect');
  assert.equal(output.data.projects[0].status, 'on_hold');
  assert.equal(output.data.projects[1].status, 'completed');
  assert.equal(output.data.projectAssignments[0].status, 'removed');
  assert.deepEqual(output.data.projectProducts[0], {
    id: 'PP-PRJ-1-P-1', organizationId: 'ORG-1', projectId: 'PRJ-1', productId: 'P-1', status: 'active',
  });
  assert.equal(output.data.surveyTemplates[0].createdBy, 'EMP-1');
});

test('M3 migration and runtime expose only the normalized core API', () => {
  assert.match(migration, /ALTER TABLE core_clients ADD COLUMN row_version/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS core_project_products/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS core_sync_state/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS core_sync_mutations/i);
  assert.match(migration, /cutover_mode TEXT NOT NULL DEFAULT 'pending'/i);

  for (const env of [wrangler.vars, wrangler.env.development.vars, wrangler.env.staging.vars]) {
    assert.equal(env.CORE_DATA_API_ENABLED, 'true');
    assert.equal(env.MVP_DATA_API_ENABLED, 'false');
    assert.equal(env.MVP_FILE_API_ENABLED, 'false');
  }
  assert.match(main, /handleOperationalGateway/);
  assert.match(main, /pathname\.startsWith\('\/api\/core\/'\)/);
});

test('browser bridge performs bootstrap/import/write-through sync with revision conflict handling', () => {
  assert.match(bridge, /\/api\/core\/bootstrap/);
  assert.match(bridge, /\/api\/core\/import/);
  assert.match(bridge, /\/api\/core\/sync/);
  assert.match(bridge, /REVISION_CONFLICT/);
  assert.match(bridge, /idempotency-key/);
  assert.match(bridge, /Storage\.prototype/);
  assert.match(bridge, /proqtrack_db_v6/);
  assert.match(cutover, /establishCloudSession/);
  assert.match(cutover, /bootstrapOperationalData/);
  assert.match(cutover, /applyRemoteDataToLocal/);
  assert.match(runtimeBootstrap, /cloud-cutover\.js/);
});
