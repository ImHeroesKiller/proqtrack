import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyOutletProposalAuthority } from '../worker/operations.js';

const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');

test('new outlet proposal is bound to authenticated employee and forced pending', async () => {
  const row = {
    id:'OPR-1',
    submittedBy:'EMP-OTHER',
    employeeId:'EMP-OTHER',
    supervisorStatus:'approved',
    managerStatus:'approved',
    status:'approved',
  };
  const result = await applyOutletProposalAuthority(null, { role:'employee' }, 'ORG-1', row, null, 'EMP-SELF');
  assert.equal(result, null);
  assert.equal(row.submittedBy, 'EMP-SELF');
  assert.equal(row.employeeId, 'EMP-SELF');
  assert.equal(row.supervisorStatus, 'pending');
  assert.equal(row.managerStatus, 'pending');
  assert.equal(row.status, 'pending');
});

test('only employee can create an outlet proposal through field workflow', async () => {
  const row = { id:'OPR-NEW' };
  const result = await applyOutletProposalAuthority(null, { role:'supervisor' }, 'ORG-1', row, null, 'EMP-SPV');
  assert.equal(result?.error, 'OUTLET_PROPOSAL_CREATE_FORBIDDEN');
  assert.equal(result?.status, 403);
});

test('supervisor approval cannot forge manager decision', async () => {
  const existing = {
    id:'OPR-1',
    status:'pending',
    supervisor_status:'pending',
    manager_status:'pending',
    submitted_by:'EMP-1',
    project_id:'PRJ-1',
    outlet_id:'OUT-1',
    submitted_at:'2026-09-25T00:00:00.000Z',
  };
  const row = {
    id:'OPR-1',
    supervisorStatus:'approved',
    managerStatus:'approved',
    status:'approved',
    projectId:'PRJ-OTHER',
    submittedBy:'EMP-OTHER',
  };
  const result = await applyOutletProposalAuthority(null, { role:'supervisor' }, 'ORG-1', row, existing, 'EMP-SPV');
  assert.equal(result, null);
  assert.equal(row.supervisorStatus, 'approved');
  assert.equal(row.managerStatus, 'pending');
  assert.equal(row.status, 'pending');
  assert.equal(row.projectId, 'PRJ-1');
  assert.equal(row.submittedBy, 'EMP-1');
});

test('manager approval cannot forge supervisor decision and second approval finalizes', async () => {
  const pending = {
    id:'OPR-1',
    status:'pending',
    supervisor_status:'pending',
    manager_status:'pending',
    submitted_by:'EMP-1',
    project_id:'PRJ-1',
    outlet_id:'OUT-1',
    submitted_at:'2026-09-25T00:00:00.000Z',
  };
  const forged = { id:'OPR-1', supervisorStatus:'approved', managerStatus:'approved' };
  await applyOutletProposalAuthority(null, { role:'manager' }, 'ORG-1', forged, pending, 'EMP-MGR');
  assert.equal(forged.supervisorStatus, 'pending');
  assert.equal(forged.managerStatus, 'approved');
  assert.equal(forged.status, 'pending');

  const second = { ...pending, supervisor_status:'approved' };
  const final = { id:'OPR-1', managerStatus:'approved' };
  await applyOutletProposalAuthority(null, { role:'manager' }, 'ORG-1', final, second, 'EMP-MGR');
  assert.equal(final.supervisorStatus, 'approved');
  assert.equal(final.managerStatus, 'approved');
  assert.equal(final.status, 'approved');
});

test('final proposal creates master outlet inside the same cloud batch', () => {
  assert.match(worker, /if \(entity === 'outletProposals' && existing && str\(row\.status\) === 'approved'\)/);
  assert.match(worker, /approvedProposalOutlet\(env, organizationId, row, existing\)/);
  assert.match(worker, /statements\.push\(\.\.\.finalization\.statements\)/);
  assert.match(worker, /upsertStatements\(env, 'outlets', outletRow, organizationId\)/);
  assert.match(worker, /validateOutletMutation\(env, organizationId, outletRow, null/);
});

test('browser review no longer creates master outlet before cloud authority commits', () => {
  const start = db.indexOf("export function reviewOutletProposal");
  const end = db.indexOf("export function getVisits()", start);
  const block = db.slice(start, end);
  assert.ok(block.includes("Master outlet is created atomically by the cloud authority"));
  assert.equal(block.includes("db.outlets.push"), false);
  assert.equal(block.includes("existing.status = 'inactive'"), false);
});
