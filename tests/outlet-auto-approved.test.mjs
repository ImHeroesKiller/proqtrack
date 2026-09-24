import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyOutletProposalAuthority } from '../worker/operations.js';

const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/operations.js', import.meta.url), 'utf8');
const fieldSales = readFileSync(new URL('../src/field-sales.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const projects = readFileSync(new URL('../src/types/index.js', import.meta.url), 'utf8');

function envForMode(mode = 'auto') {
  return {
    DB:{
      prepare(){
        return {
          bind(){
            return {
              async first(){
                return { id:'PRJ-1', metadata_json:JSON.stringify({ outletApprovalMode:mode }) };
              },
            };
          },
        };
      },
    },
  };
}

test('outlet approval defaults to auto and manual is explicit', () => {
  assert.match(db, /approvalMode: 'auto'/);
  assert.match(db, /project\.outletApprovalMode === 'manual' \? 'manual' : 'auto'/);
  assert.match(projects, /name="outletApprovalMode"/);
  assert.match(projects, />Auto Approved</);
  assert.match(projects, />Manual Approval</);
  assert.match(projects, /outletApprovalMode: formValue\(fd, "outletApprovalMode"\) === "manual" \? "manual" : "auto"/);
});

test('worker auto-approves new proposal for auto project', async () => {
  const row = { id:'OPR-1', projectId:'PRJ-1' };
  const result = await applyOutletProposalAuthority(
    envForMode('auto'),
    { role:'employee', projectIds:['PRJ-1'] },
    'ORG-1',
    row,
    null,
    'EMP-1',
  );
  assert.equal(result,null);
  assert.equal(row.approvalMode,'auto');
  assert.equal(row.status,'approved');
  assert.equal(row.supervisorStatus,'approved');
  assert.equal(row.managerStatus,'approved');
  assert.equal(row.approvedBy,'system:auto');
});

test('worker keeps manual project proposal pending', async () => {
  const row = { id:'OPR-2', projectId:'PRJ-1' };
  const result = await applyOutletProposalAuthority(
    envForMode('manual'),
    { role:'employee', projectIds:['PRJ-1'] },
    'ORG-1',
    row,
    null,
    'EMP-1',
  );
  assert.equal(result,null);
  assert.equal(row.approvalMode,'manual');
  assert.equal(row.status,'pending');
  assert.equal(row.supervisorStatus,'pending');
  assert.equal(row.managerStatus,'pending');
});

test('auto-approved proposal finalizes master outlet in same sync batch', () => {
  assert.match(worker, /if \(entity === 'outletProposals' && str\(row\.status\) === 'approved'\)/);
  assert.match(worker, /approvedProposalOutlet\(env, organizationId, row, existing\)/);
  assert.match(worker, /statements\.push\(\.\.\.finalization\.statements\)/);
});

test('field sales flow waits for cloud and uses simple auto-approved copy', () => {
  assert.match(fieldSales, /Outlet akan aktif otomatis setelah validasi/);
  assert.match(fieldSales, /Tambah Outlet/);
  assert.match(fieldSales, /await waitForOperationalSync\(\)/);
  assert.match(fieldSales, /await refreshOperationalData\(getDB\(\), getActor\(\)\)/);
  assert.match(fieldSales, /Outlet berhasil ditambahkan dan aktif/);
  assert.match(fieldSales, /Project ini menggunakan Manual Approval/);
});

test('approval queue is hidden when no manual project exists', () => {
  assert.match(app, /item\.id === 'outlet-approvals' && !hasManualOutletApprovalProjects\(\)/);
  assert.match(app, /if \(!hasManualOutletApprovalProjects\(\)\)/);
  assert.match(fieldSales, /manualProjectIds/);
  assert.match(fieldSales, /Antrian Manual Approval/);
});
