import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMPLOYEE_PAGE_SIZE,
  employeeSyncState,
  activeAssignmentsForEmployee,
  activeProjectIdsForEmployee,
  employeeSearchDocument,
  employeeMatchesFilters,
  paginateEmployees,
  subordinateEmployeeIds,
  teamMemberSummary,
  teamMatchesFilters,
  supervisorMetrics,
} from '../src/lib/team-employee-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Team Employees P3 sync and employee project helpers are deterministic', () => {
  assert.equal(EMPLOYEE_PAGE_SIZE,15);
  assert.deepEqual(employeeSyncState({cutoverMode:'cloud',ready:true}),{label:'Tersinkron cloud',tone:'ok'});
  const assignments=[
    {id:'A1',employeeId:'E1',projectId:'P1',status:'active'},
    {id:'A2',employeeId:'E1',projectId:'P2',status:'ended'},
    {id:'A3',employeeId:'E1',projectId:'P1',status:'active'},
  ];
  assert.equal(activeAssignmentsForEmployee(assignments,'E1').length,2);
  assert.deepEqual(activeProjectIdsForEmployee(assignments,'E1'),['P1']);
});

test('Team Employees P3 employee search filter and pagination are DOM-independent', () => {
  const search=employeeSearchDocument({name:'Budi',email:'budi@example.com',area:'Jakarta',role:'Field Sales'},[{code:'P1',name:'Alpha'}]);
  assert.equal(search,'budi budi@example.com jakarta  field sales p1 alpha');
  const employee={search,role:'Field Sales',status:'active',projectIds:['P1']};
  assert.equal(employeeMatchesFilters(employee,{search:'alpha',role:'Field Sales',status:'active',projectId:'P1'}),true);
  assert.equal(employeeMatchesFilters(employee,{projectId:'P2'}),false);
  const page=paginateEmployees(Array.from({length:31},(_,i)=>i),3,EMPLOYEE_PAGE_SIZE);
  assert.equal(page.currentPage,3);
  assert.equal(page.from,31);
  assert.deepEqual(page.items,[30]);
});

test('Team Employees P3 derives canonical supervisor subordinates', () => {
  const assignments=[
    {employeeId:'E1',projectId:'P1',status:'active',supervisorId:'S1'},
    {employeeId:'E2',projectId:'P2',status:'active',supervisorUserId:'U1'},
    {employeeId:'E3',projectId:'P3',status:'active',supervisorId:'S1'},
  ];
  assert.deepEqual(subordinateEmployeeIds(assignments,{id:'S1',authUserId:'U1'},new Set(['P1','P2'])),['E1','E2']);
});

test('Team Employees P3 team summaries and filters remain reusable', () => {
  const employee={id:'E1',name:'Budi'};
  const assignments=[
    {employeeId:'E1',projectId:'P1',status:'active',allocationPercent:40},
    {employeeId:'E1',projectId:'P2',status:'active',allocationPercent:25},
  ];
  const visits=[{employeeId:'E1',status:'completed'},{employeeId:'E1',status:'planned'}];
  const summary=teamMemberSummary(employee,assignments,visits,{P1:{code:'A'},P2:{code:'B'}});
  assert.equal(summary.capacity,65);
  assert.equal(summary.completedVisits,1);
  assert.equal(summary.visits,2);
  assert.equal(teamMatchesFilters({search:'budi jakarta',projectIds:['P1']},{search:'budi',projectId:'P1'}),true);
});

test('Team Employees P3 supervisor metrics use canonical team and project scope', () => {
  const db={
    projectAssignments:[
      {employeeId:'E1',projectId:'P1',status:'active',supervisorId:'S1'},
      {employeeId:'E2',projectId:'P2',status:'active',supervisorId:'S1'},
    ],
    visits:[{employeeId:'E1',projectId:'P1'},{employeeId:'E2',projectId:'P2'}],
    competitorIntel:[{recordedBy:'E1',projectId:'P1'}],
    fieldPhotos:[{recordedBy:'E1',projectId:'P1'}],
    priceObservations:[{employeeId:'E1',projectId:'P1'}],
  };
  assert.deepEqual(supervisorMetrics(db,{id:'S1'},['P1']),{team:1,visits:1,intel:1,photos:1,prices:1});
});

test('Team Employees P3 helper is wired into runtime and PWA', async () => {
  const app=await read('src/app.js');
  const types=await read('src/types/index.js');
  const sw=await read('sw.js');
  assert.match(app,/from '.\/lib\/team-employee-ui\.js'/);
  assert.match(types,/from "\.\.\/lib\/team-employee-ui\.js"/);
  assert.match(app,/employeeMatchesFilters/);
  assert.match(app,/paginateEmployees/);
  assert.match(types,/subordinateEmployeeIds/);
  assert.match(types,/supervisorMetrics/);
  assert.match(sw,/RUNTIME_CACHE/);
  assert.match(sw,/proqtrack-v12\.44/);
});
