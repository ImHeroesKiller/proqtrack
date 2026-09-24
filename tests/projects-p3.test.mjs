import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROJECT_PAGE_SIZE,
  projectStatusLabel,
  projectSyncState,
  managerProjectIds,
  projectManagerNames,
  projectSupervisorNames,
  projectDependencies,
  projectSearchDocument,
  projectMatchesFilters,
  paginateProjects,
  closingProjectAssignments,
} from '../src/lib/project-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Projects P3 helpers normalize status and sync state', () => {
  assert.equal(projectStatusLabel('on_hold'),'Ditahan');
  assert.equal(projectStatusLabel('completed'),'Selesai');
  assert.deepEqual(projectSyncState({cutoverMode:'cloud',ready:true}),{label:'Tersinkron cloud',tone:'ok'});
  assert.equal(projectSyncState({syncing:true}).tone,'progress');
  assert.equal(projectSyncState({error:'REVISION_CONFLICT'}).tone,'error');
});

test('Projects P3 manager scope preserves multi-project access with legacy fallback', () => {
  assert.deepEqual(managerProjectIds({projectIds:['P1','P2','P1'],projectId:'OLD'}),['P1','P2']);
  assert.deepEqual(managerProjectIds({projectId:'OLD'}),['OLD']);
  assert.deepEqual(managerProjectIds({}),[]);
});

test('Projects P3 attribution helpers are project-scoped', () => {
  const db={
    accounts:[
      {id:'M1',role:'manager',status:'active',name:'Manager One',projectIds:['P1','P2']},
      {id:'M2',role:'manager',status:'inactive',name:'Inactive',projectId:'P1'},
    ],
    employees:[{id:'E1',name:'Supervisor One'}],
    projectAssignments:[{id:'A1',projectId:'P1',employeeId:'E1',status:'active',roleOnProject:'supervisor'}],
  };
  assert.deepEqual(projectManagerNames(db,'P1'),['Manager One']);
  assert.deepEqual(projectSupervisorNames(db,'P1'),['Supervisor One']);
});

test('Projects P3 dependency and finalization helpers are deterministic', () => {
  const db={
    projectAssignments:[{id:'A1',projectId:'P1',status:'active'}],
    visits:[{id:'V1',projectId:'P1',status:'planned'},{id:'V2',projectId:'P1',status:'completed'}],
    surveyResponses:[{id:'S1',projectId:'P1',status:'draft'}],
  };
  assert.deepEqual(projectDependencies(db,'P1'),{assignments:1,openVisits:1,draftSurveys:1,total:3});
  const closed=closingProjectAssignments(db.projectAssignments,'P1','completed','U1','2026-09-24T10:00:00.000Z');
  assert.deepEqual(closed,[{id:'A1',projectId:'P1',status:'ended',endedAt:'2026-09-24T10:00:00.000Z',endedBy:'U1',updatedAt:'2026-09-24T10:00:00.000Z'}]);
  assert.deepEqual(closingProjectAssignments(db.projectAssignments,'P1','active','U1','2026-09-24T10:00:00.000Z'),[]);
});

test('Projects P3 search filtering and pagination are DOM-independent', () => {
  const search=projectSearchDocument({name:'Alpha Launch',code:'PRJ-01'},{clientName:'Client A',managerNames:['Rina'],supervisorNames:['Budi']});
  assert.equal(search,'alpha launch prj-01 client a rina budi');
  assert.equal(projectMatchesFilters({search,status:'active',clientId:'C1'},{search:'rina',status:'active',clientId:'C1'}),true);
  assert.equal(projectMatchesFilters({search,status:'active',clientId:'C1'},{search:'beta'}),false);
  const page=paginateProjects(Array.from({length:31},(_,i)=>i),3,PROJECT_PAGE_SIZE);
  assert.equal(page.currentPage,3);
  assert.equal(page.pageCount,3);
  assert.equal(page.from,31);
  assert.equal(page.to,31);
  assert.deepEqual(page.items,[30]);
});

test('Projects P3 helper module is wired into page and PWA runtime', async () => {
  const src=await read('src/types/index.js');
  const sw=await read('sw.js');
  assert.match(src,/from "\.\.\/lib\/project-ui\.js"/);
  assert.match(src,/paginateProjects\(matched, page, PROJECT_PAGE_SIZE\)/);
  assert.match(src,/closingProjectAssignments/);
  assert.match(sw,/src\/lib\/project-ui\.js/);
  assert.match(sw,/proqtrack-v12\.35/);
});
