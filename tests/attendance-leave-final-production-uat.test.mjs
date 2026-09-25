import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptUrl=new URL('../scripts/attendance-leave-production-uat.mjs',import.meta.url);
const script=readFileSync(scriptUrl,'utf8');
const workflow=readFileSync(new URL('../.github/workflows/cloudflare-mvp.yml',import.meta.url),'utf8');

test('final Attendance Leave production UAT script is syntax-valid',()=>{
  execFileSync(process.execPath,['--check',fileURLToPath(scriptUrl)],{stdio:'pipe'});
});

test('final UAT covers roles and both attendance sources',()=>{
  assert.match(script,/await session\('manager'/);
  assert.match(script,/await session\('supervisor'/);
  assert.match(script,/await session\('manual'/);
  assert.match(script,/await session\('visit'/);
  assert.match(script,/attendanceSourceMode":"manual"/);
  assert.match(script,/attendanceSourceMode":"visit"/);
});

test('final UAT covers Attendance lifecycle and source governance',()=>{
  assert.match(script,/manual-checkin/);
  assert.match(script,/manual-checkout/);
  assert.match(script,/employee-correction-denied/);
  assert.match(script,/supervisor-correction/);
  assert.match(script,/manager-correction/);
  assert.match(script,/visit-direct-attendance-denied/);
  assert.match(script,/visit-checkin/);
  assert.match(script,/visit-checkout/);
  assert.match(script,/ATTENDANCE_VISIT_DERIVED_IMMUTABLE/);
});

test('final UAT covers Leave lifecycle governance and conflicts',()=>{
  assert.match(script,/leave-edit/);
  assert.match(script,/leave-withdraw/);
  assert.match(script,/leave-supervisor-approve/);
  assert.match(script,/LEAVE_ATTENDANCE_CONFLICT/);
  assert.match(script,/LEAVE_REJECTION_NOTE_REQUIRED/);
  assert.match(script,/LEAVE_DECISION_FORBIDDEN/);
});

test('final UAT is isolated, self-cleaning, and a production release gate',()=>{
  assert.match(script,/ORG-UAT-AL-/);
  assert.match(script,/function cleanup\(\)/);
  assert.match(script,/cleanup residual/);
  assert.match(workflow,/Run Attendance Leave final production UAT/);
  assert.match(workflow,/node scripts\/attendance-leave-production-uat\.mjs/);
});