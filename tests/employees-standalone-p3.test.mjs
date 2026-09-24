import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  employeeProjectOptions,
  employeeListModel,
  employeeFilterSnapshot,
  employeeDeactivationImpact,
} from '../src/lib/team-employee-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employees standalone P3 project options are derived without DOM', () => {
  const employees=[{id:'E1'},{id:'E2'}];
  const assignments=[
    {employeeId:'E1',projectId:'P1',status:'active'},
    {employeeId:'E1',projectId:'P2',status:'ended'},
    {employeeId:'E2',projectId:'P1',status:'active'},
    {employeeId:'E2',projectId:'P3',status:'active'},
  ];
  const projects=[{id:'P1',code:'A'},{id:'P2',code:'B'},{id:'P3',code:'C'}];
  assert.deepEqual(employeeProjectOptions(employees,assignments,projects).map(row=>row.id),['P1','P3']);
});

test('Employees standalone P3 list model centralizes project and operational state', () => {
  const employee={id:'E1',employeeCode:'EMP-1',name:'Budi',email:'budi@example.com',role:'Field Sales',status:'active'};
  const assignments=[{employeeId:'E1',projectId:'P1',status:'active'}];
  const accounts=[{id:'U1',employeeId:'E1',status:'active'}];
  const row=employeeListModel(employee,{assignments,accounts,projectMap:{P1:{id:'P1',code:'PRJ-1',name:'Alpha'}}});
  assert.deepEqual(row.projectIds,['P1']);
  assert.equal(row.assignmentLabel,'1 assignment');
  assert.equal(row.loginLabel,'Login aktif');
  assert.match(row.search,/emp-1/);
  assert.match(row.search,/alpha/);
});

test('Employees standalone P3 filter snapshot is reusable and normalized', () => {
  const values={search:'Budi',role:'Field Sales',status:'active',projectId:'P1',assignment:'assigned',login:'linked'};
  assert.deepEqual(employeeFilterSnapshot(key=>values[key]),values);
  assert.deepEqual(employeeFilterSnapshot({search:'Budi'}),{
    search:'Budi',role:'',status:'',projectId:'',assignment:'',login:'',
  });
});

test('Employees standalone P3 deactivation impact is deterministic', () => {
  const assignments=[
    {employeeId:'E1',status:'active'},
    {employeeId:'E1',status:'ended'},
    {employeeId:'E1',status:'active'},
  ];
  assert.deepEqual(employeeDeactivationImpact('E1',assignments),{
    activeAssignmentCount:2,
    message:' Karyawan memiliki 2 assignment aktif yang akan ditutup.',
  });
  assert.deepEqual(employeeDeactivationImpact('E2',assignments),{activeAssignmentCount:0,message:''});
});

test('Employees standalone P3 runtime delegates logic to helper module', async () => {
  const app=await read('src/app.js');
  const helper=await read('src/lib/team-employee-ui.js');
  const sw=await read('sw.js');
  assert.match(app,/employeeProjectOptions\(employees, assignments/);
  assert.match(app,/employeeListModel\(e, \{ assignments, accounts, projectMap \}\)/);
  assert.match(app,/employeeFilterSnapshot\(key =>/);
  assert.match(app,/employeeDeactivationImpact\(id, getDB\(\)\.projectAssignments/);
  assert.doesNotMatch(app,/function employeeActiveAssignments/);
  assert.match(helper,/export function employeeProjectOptions/);
  assert.match(helper,/export function employeeListModel/);
  assert.match(helper,/export function employeeFilterSnapshot/);
  assert.match(helper,/export function employeeDeactivationImpact/);
  assert.match(sw,/Employees P3 maintainability refresh/);
});
