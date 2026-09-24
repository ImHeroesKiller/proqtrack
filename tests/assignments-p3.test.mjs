import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ASSIGNMENT_PAGE_SIZE,
  assignmentRoleLabel,
  assignmentStatusLabel,
  normalizeAssignmentStatus,
  assignmentSyncState,
  employeeCapacityUsage,
  assignmentSearchDocument,
  assignmentMatchesFilters,
  paginateAssignments,
  eligibleSupervisors,
  eligibleAssignmentEmployees,
} from '../src/lib/assignment-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Assignment P3 normalizes role status and sync presentation', () => {
  assert.equal(assignmentRoleLabel('sales'),'Field Sales');
  assert.equal(assignmentStatusLabel('ended'),'Selesai');
  assert.equal(normalizeAssignmentStatus('removed'),'ended');
  assert.deepEqual(assignmentSyncState({cutoverMode:'cloud',ready:true}),{label:'Tersinkron cloud',tone:'ok'});
  assert.equal(assignmentSyncState({syncing:true}).tone,'progress');
  assert.equal(assignmentSyncState({error:'x'}).tone,'error');
});

test('Assignment P3 calculates capacity deterministically', () => {
  const rows=[
    {id:'A1',employeeId:'E1',status:'active',startDate:'2026-09-01',endDate:'2026-09-30',allocationPercent:40},
    {id:'A2',employeeId:'E1',status:'active',startDate:'2026-09-15',endDate:'2026-10-15',allocationPercent:25},
    {id:'A3',employeeId:'E2',status:'active',startDate:'2026-09-01',endDate:'2026-09-30',allocationPercent:50},
  ];
  assert.equal(employeeCapacityUsage(rows,'E1','2026-09-20','2026-09-25'),65);
  assert.equal(employeeCapacityUsage(rows,'E1','2026-09-20','2026-09-25','A2'),40);
});

test('Assignment P3 search filtering and pagination are DOM-independent', () => {
  const search=assignmentSearchDocument({roleOnProject:'sales'},{projectName:'Alpha',projectCode:'P1',clientName:'Client A',employeeName:'Budi',supervisorName:'Sari'});
  assert.equal(search,'alpha p1 client a budi sari field sales');
  assert.equal(assignmentMatchesFilters({search,projectId:'P1',status:'active',roleOnProject:'sales'},{search:'sari',projectId:'P1',status:'active',role:'sales'}),true);
  assert.equal(assignmentMatchesFilters({search,projectId:'P1',status:'removed',roleOnProject:'sales'},{status:'ended'}),true);
  const page=paginateAssignments(Array.from({length:31},(_,i)=>i),3,ASSIGNMENT_PAGE_SIZE);
  assert.equal(page.currentPage,3);
  assert.equal(page.pageCount,3);
  assert.equal(page.from,31);
  assert.equal(page.to,31);
  assert.deepEqual(page.items,[30]);
});

test('Assignment P3 supervisor eligibility is period-aware', () => {
  const assignments=[
    {projectId:'P1',employeeId:'S1',status:'active',roleOnProject:'supervisor',startDate:'2026-09-01',endDate:'2026-09-30'},
    {projectId:'P1',employeeId:'S2',status:'active',roleOnProject:'supervisor',startDate:'2026-09-15',endDate:'2026-09-20'},
  ];
  const employees=[{id:'S1',name:'One',status:'active'},{id:'S2',name:'Two',status:'active'}];
  assert.deepEqual(eligibleSupervisors(assignments,employees,'P1','2026-09-10','2026-09-25').map(x=>x.id),['S1']);
});

test('Assignment P3 employee eligibility applies account and optional staffing scope', () => {
  const employees=[{id:'E1',status:'active'},{id:'E2',status:'active'},{id:'E3',status:'inactive'}];
  const accounts=[{employeeId:'E1',status:'active'},{employeeId:'E2',status:'active'},{employeeId:'E3',status:'active'}];
  assert.deepEqual(eligibleAssignmentEmployees(employees,accounts,new Set(['E2'])).map(x=>x.id),['E2']);
  assert.deepEqual(eligibleAssignmentEmployees(employees,accounts,null).map(x=>x.id),['E1','E2']);
});

test('Assignment P3 helper is wired into runtime and PWA', async () => {
  const src=await read('src/types/index.js');
  const sw=await read('sw.js');
  assert.match(src,/from "\.\.\/lib\/assignment-ui\.js"/);
  assert.match(src,/assignmentMatchesFilters/);
  assert.match(src,/paginateAssignments\(matched, page, ASSIGNMENT_PAGE_SIZE\)/);
  assert.match(src,/eligibleSupervisors/);
  assert.match(src,/eligibleAssignmentEmployees/);
  assert.match(sw,/src\/lib\/assignment-ui\.js/);
  assert.match(sw,/proqtrack-v12\.43/);
});
