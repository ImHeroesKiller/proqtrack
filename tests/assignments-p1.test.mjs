import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignment P1 scopes Project Manager list and project selector', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /ids = accessibleProjectIds\(\)/);
  assert.match(src, /scopedProjects = \(db\.projects \|\| \[\]\)\.filter\(\(p\) => role\(\) === "manager" \|\| ids\.has\(p\.id\)\)/);
  assert.match(src, /rows = \(db\.projectAssignments \|\| \[\]\)\.filter\(\(a\) => role\(\) === "manager" \|\| ids\.has\(a\.projectId\)\)/);
  assert.match(src, /role\(\) === "project-manager" && !accessibleProjectIds\(\)\.has\(projectId\)/);
});

test('Assignment P1 saves and ends assignments through authoritative cloud commit', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /async saveAssignment\(e, projectId\)/);
  assert.match(src, /await commitOperationalChanges\(\[\{ entity:'projectAssignments', op:'upsert', row \}\]\)/);
  assert.match(src, /async toggleAssignment\(id\)/);
  assert.match(src, /status:"ended"/);
  assert.match(src, /await commitOperationalChanges\(\[\{ entity:'projectAssignments', op:'upsert', row:next \}\]\)/);
});

test('Assignment P1 preserves history and blocks reactivation UX', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /id: uid\("ASN"\)/);
  assert.match(src, /Karyawan sudah memiliki assignment aktif pada project ini/);
  assert.match(src, /assignment\.status !== "active"/);
  assert.match(src, /viewAssignment\('\$\{a\.id\}'\)/);
  assert.doesNotMatch(src, /\? "Unassign" : "Aktifkan"/);
});

test('Assignment P1 stores canonical supervisor employee and user references', async () => {
  const src = await read('src/types/index.js');
  const worker = await read('worker/operations.js');
  assert.match(src, /supervisorId: roleOnProject === "supervisor" \? null : supervisorId/);
  assert.match(src, /supervisorUserId: roleOnProject === "supervisor" \? null : \(supervisorEmployee\?\.authUserId \|\| null\)/);
  assert.match(worker, /row\.supervisorUserId = str\(supervisor\.auth_user_id\)/);
  assert.match(worker, /row\.supervisorId = null/);
});

test('Assignment P1 validates lifecycle and business rules server-side', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /validateProjectAssignmentMutation/);
  for (const code of [
    'ASSIGNMENT_PROJECT_NOT_FOUND',
    'ASSIGNMENT_PROJECT_NOT_ASSIGNABLE',
    'ASSIGNMENT_EMPLOYEE_NOT_FOUND',
    'ASSIGNMENT_EMPLOYEE_INACTIVE',
    'ASSIGNMENT_EMPLOYEE_LOGIN_REQUIRED',
    'ASSIGNMENT_INVALID_ROLE',
    'ASSIGNMENT_INVALID_PERIOD',
    'ASSIGNMENT_INVALID_ALLOCATION',
    'ASSIGNMENT_ACTIVE_DUPLICATE',
    'ASSIGNMENT_CAPACITY_CONFLICT',
    'ASSIGNMENT_SUPERVISOR_REQUIRED',
    'ASSIGNMENT_SELF_SUPERVISION',
    'ASSIGNMENT_SUPERVISOR_INVALID',
    'ASSIGNMENT_SUPERVISOR_NOT_COVERING_PERIOD',
    'ASSIGNMENT_IDENTITY_IMMUTABLE',
    'ASSIGNMENT_FINAL'
  ]) assert.match(worker, new RegExp(code));
  assert.match(worker, /entity === 'projectAssignments'/);
  assert.match(worker, /if \(currentStatus === 'ended'\) return false/);
  assert.match(worker, /op === 'delete'\) return false/);
});

test('Assignment P1 uses canonical ended status and membership refresh remains wired', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /removed:'ended'/);
  assert.match(worker, /membershipRefreshStatement\(env, organizationId/);
  assert.match(worker, /core_project_memberships/);
});

test('Assignment P1 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.41/);
});
