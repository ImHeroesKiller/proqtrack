import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertVisitGeofence, visitGeofenceEvidence } from '../src/lib/location-evidence.js';
import { authorizeOperationalChange, operationalTransitionAllowed } from '../worker/operations.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('visit scheduling cannot create an already executed or completed visit', () => {
  const claims = { role:'employee', projectIds:['PRJ-1'] };
  assert.equal(operationalTransitionAllowed(claims,'visits',{
    op:'upsert', row:{ id:'VIS-1',projectId:'PRJ-1',outletId:'OUT-1',employeeId:'EMP-1',status:'planned' },
  },{ existing:null }), true);
  assert.equal(operationalTransitionAllowed(claims,'visits',{
    op:'upsert', row:{ id:'VIS-2',projectId:'PRJ-1',outletId:'OUT-1',employeeId:'EMP-1',status:'completed',checkOutTime:'15:00' },
  },{ existing:null }), false);
});

test('visit lifecycle requires owner GPS evidence for execution transitions', () => {
  const claims = { role:'employee', projectIds:['PRJ-1'] };
  const accessibleEmployeeIds = new Set(['EMP-1']);
  const planned = { id:'VIS-1',project_id:'PRJ-1',outlet_id:'OUT-1',employee_id:'EMP-1',status:'planned' };
  const checkIn = {
    op:'upsert',
    row:{
      id:'VIS-1',projectId:'PRJ-1',outletId:'OUT-1',employeeId:'EMP-1',
      status:'checked-in',locationSource:'device_gps',
      checkInLat:-6.2,checkInLng:106.8,checkInCapturedAt:'2026-09-24T08:00:00.000Z',
      startedAt:'2026-09-24T08:00:00.000Z',
    },
  };
  assert.equal(authorizeOperationalChange(claims,'visits',checkIn,{
    existing:planned,accessibleEmployeeIds,actorEmployeeId:'EMP-1',
  }), true);
  assert.equal(authorizeOperationalChange(claims,'visits',checkIn,{
    existing:planned,accessibleEmployeeIds,actorEmployeeId:'EMP-2',
  }), false);

  const inProgress = {
    ...planned,status:'in_progress',started_at:'2026-09-24T08:00:00.000Z',
    start_latitude:-6.2,start_longitude:106.8,
  };
  assert.equal(operationalTransitionAllowed(claims,'visits',{
    op:'upsert',
    row:{
      id:'VIS-1',status:'completed',
      completedAt:'2026-09-24T09:00:00.000Z',
      checkOutLat:-6.2,checkOutLng:106.8,checkOutCapturedAt:'2026-09-24T09:00:00.000Z',
    },
  },{ existing:inProgress }), true);
});

test('visit geofence uses outlet radius with 50 meter production default', () => {
  const outlet = { lat:-6.2,lng:106.8 };
  const valid = visitGeofenceEvidence(outlet,{ lat:-6.2,lng:106.8 });
  assert.equal(valid.radiusM,50);
  assert.equal(valid.status,'valid');
  assert.equal(assertVisitGeofence(outlet,{ lat:-6.2,lng:106.8 }).status,'valid');
  assert.throws(
    () => assertVisitGeofence(outlet,{ lat:-6.1988,lng:106.8 }),
    error => error?.code === 'VISIT_OUTSIDE_GEOFENCE',
  );
});

test('Visits UI schedules only planned work and prevents duplicate create submission', async () => {
  const app = await read('src/app.js');
  const start = app.indexOf('window.FT.openVisitModal = function()');
  const end = app.indexOf('window.FT.viewVisit = function',start);
  const formBlock = app.slice(start,end);
  assert.doesNotMatch(formBlock,/name="status"/);
  assert.doesNotMatch(formBlock,/name="checkInTime"/);
  assert.doesNotMatch(formBlock,/name="checkOutTime"/);
  assert.match(formBlock,/data\.status = 'planned'/);
  assert.match(formBlock,/visitCreateInFlight/);
});

test('check-in enforces geofence and check-out records complete GPS evidence', async () => {
  const app = await read('src/app.js');
  assert.match(app,/assertVisitGeofence\(outlet, gps, 50\)/);
  assert.match(app,/startedAt:gps\.capturedAt/);
  assert.match(app,/geofenceStatus:geofence\.status/);
  assert.match(app,/checkOutLat:gps\.lat/);
  assert.match(app,/checkOutLng:gps\.lng/);
  assert.match(app,/checkOutAccuracyM:gps\.accuracyM/);
  assert.match(app,/checkOutCapturedAt:gps\.capturedAt/);
  assert.match(app,/completedAt:gps\.capturedAt/);
  assert.match(app,/visitCheckOutInFlight/);
});

test('Visits live refresh is guarded on route, visibility and focus', async () => {
  const app = await read('src/app.js');
  assert.match(app,/const VISITS_REFRESH_MS = 30000/);
  assert.match(app,/function isVisitsRoute/);
  assert.match(app,/window\.FT\.refreshVisits/);
  assert.match(app,/configureVisitsRefresh\(route\)/);
  assert.match(app,/if \(isVisitsRoute\(\)\) refreshVisitsData/);
  assert.match(app,/visitsRefreshTimer/);
});

test('visit detail never borrows evidence from another visit at the same outlet/day', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field,/getPriceObservations\(\)\.filter\(p => String\(p\.visitId \|\| ''\) === String\(visitId\)\)/);
  assert.match(field,/getCompetitorIntel\(\)\.filter\(i => String\(i\.visitId \|\| ''\) === String\(visitId\)\)/);
  assert.match(field,/getFieldPhotos\(\)\.filter\(p => String\(p\.visitId \|\| ''\) === String\(visitId\)\)/);
  assert.match(field,/bukan snapshot stok pada kunjungan ini/);
});

test('D1 visit authority stores canonical start/end timestamps and coordinates', async () => {
  const ops = await read('worker/operations.js');
  assert.match(ops,/row\.completedAt \|\| row\.checkOutCapturedAt \|\| row\.checkOutAt/);
  assert.match(ops,/row\.endLatitude \?\? row\.checkOutLat/);
  assert.match(ops,/row\.endLongitude \?\? row\.checkOutLng/);
  assert.match(ops,/VISIT_OUTSIDE_GEOFENCE/);
  assert.match(ops,/geofence_radius_m/);
  assert.match(ops,/actorEmployeeId/);
});
