import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validCoordinatePair, visitLocationEvidence, locationFreshness, locationSourceLabel, captureDevicePosition,
} from '../src/lib/location-evidence.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Last Location accepts only complete valid coordinate pairs', () => {
  assert.deepEqual(validCoordinatePair(-6.2,106.8), { lat:-6.2, lng:106.8 });
  assert.equal(validCoordinatePair(-91,106.8), null);
  assert.equal(validCoordinatePair(-6.2,181), null);
  assert.equal(validCoordinatePair(-6.2,null), null);
  assert.equal(validCoordinatePair('',106.8), null);
});

test('visit GPS evidence takes precedence and outlet coordinates remain reference-only', () => {
  const outlet = { lat:-6.3, lng:106.9 };
  const gps = visitLocationEvidence({
    checkInLat:-6.21, checkInLng:106.81, checkInAccuracyM:12,
    checkInCapturedAt:'2026-09-24T02:00:00.000Z', locationSource:'device_gps',
  }, outlet);
  assert.equal(gps.actual, true);
  assert.equal(gps.source, 'device_gps');
  assert.equal(gps.accuracyM, 12);
  assert.deepEqual([gps.lat,gps.lng],[-6.21,106.81]);

  const reference = visitLocationEvidence({}, outlet);
  assert.equal(reference.actual, false);
  assert.equal(reference.source, 'outlet_reference');
  assert.equal(locationSourceLabel(reference), 'Referensi outlet');

  const administrative = visitLocationEvidence({
    checkInLat:-6.21, checkInLng:106.81, checkInAccuracyM:null,
    locationSource:'administrative_checkin',
  }, outlet);
  assert.equal(administrative.actual, false);
  assert.equal(administrative.accuracyM, null);
});

test('location freshness never calls outlet reference a current employee position', () => {
  const reference = visitLocationEvidence({}, { lat:-6.3, lng:106.9 });
  const refFreshness = locationFreshness(reference,{ date:'2026-09-24' },Date.parse('2026-09-24T03:00:00Z'),'2026-09-24');
  assert.equal(refFreshness.key, 'reference');
  assert.match(refFreshness.label, /bukan posisi perangkat/);

  const gps = visitLocationEvidence({
    checkInLat:-6.21, checkInLng:106.81, locationSource:'device_gps',
    checkInCapturedAt:'2026-09-24T02:55:00.000Z',
  }, null);
  const fresh = locationFreshness(gps,{ date:'2026-09-24' },Date.parse('2026-09-24T03:00:00Z'),'2026-09-24');
  assert.equal(fresh.key, 'fresh');
  assert.match(fresh.label, /5 menit/);
});

test('self check-in captures immutable GPS evidence and requires the assigned employee', async () => {
  const [app, db] = await Promise.all([read('src/app.js'),read('src/lib/db.js')]);
  assert.match(app, /const ownsVisit = !!actor\?\.employeeId/);
  assert.match(app, /if \(!ownsVisit\) throw new Error\('Check-in hanya dapat dilakukan oleh karyawan yang ditugaskan\.'/);
  assert.match(app, /await captureDevicePosition\(\)/);
  assert.match(app, /assertVisitGeofence\(outlet, gps, 50\)/);
  assert.match(app, /checkInLat:gps\.lat/);
  assert.match(app, /checkInLng:gps\.lng/);
  assert.match(app, /checkInAccuracyM:gps\.accuracyM/);
  assert.match(app, /checkInCapturedAt:gps\.capturedAt/);
  assert.match(app, /locationSource:'device_gps'/);
  assert.match(db, /Evidence check-in tidak dapat diubah setelah tercatat/);
  assert.match(db, /Check-in wajib menggunakan GPS perangkat yang valid/);
});

test('Last Location UI distinguishes evidence source and never says still at location', async () => {
  const [app, field] = await Promise.all([read('src/app.js'),read('src/field-sales.js')]);
  assert.match(app, /Referensi outlet — bukan posisi aktual perangkat/);
  assert.match(app, /locationSourceLabel\(loc\.evidence\)/);
  assert.match(app, /belum check-out/);
  assert.doesNotMatch(app, /masih di lokasi/);
  assert.match(field, /Referensi outlet bukan posisi aktual perangkat/);
  assert.match(field, /locationSourceLabel\(evidence\)/);
  assert.match(field, /belum check-out/);
  assert.doesNotMatch(field, /masih di lokasi/);
});

test('Last Location refresh is guarded and active on route focus', async () => {
  const app = await read('src/app.js');
  assert.match(app, /const TRACKING_REFRESH_MS = 30000/);
  assert.match(app, /refreshOperationalData\(getDB\(\), actor\)/);
  assert.match(app, /window\.FT\.refreshTracking/);
  assert.match(app, /function configureRouteRefresh/);
  assert.match(app, /if \(isTrackingRoute\(route\)\)/);
  assert.match(app, /run:refreshTrackingData/);
  assert.match(app, /refreshActiveRoute\(\{ reason:'focus' \}\)/);
  assert.match(app, /routeRefreshTimer/);
});

test('cloud visit authority maps UI checked-in to D1 in_progress and preserves GPS columns', async () => {
  const ops = await read('worker/operations.js');
  assert.match(ops, /uiStatus === 'checked-in'\s*\? 'in_progress'/);
  assert.match(ops, /dbRow\.status === 'in_progress' \? 'checked-in'/);
  assert.match(ops, /row\.startLatitude \?\? row\.checkInLat \?\? row\.lat/);
  assert.match(ops, /row\.startLongitude \?\? row\.checkInLng \?\? row\.lng/);
  assert.match(ops, /row\.startedAt \|\| row\.checkInCapturedAt \|\| row\.checkInAt/);
});


test('shared visit GPS capture falls back from high accuracy without weakening permission denial', async () => {
  const calls = [];
  const geolocation = {
    getCurrentPosition(success, failure, options) {
      calls.push(options);
      if (calls.length === 1) {
        failure({ code:3, message:'timeout' });
        return;
      }
      success({
        coords:{ latitude:-6.2, longitude:106.8, accuracy:42 },
        timestamp:Date.parse('2026-09-26T03:00:00.000Z'),
      });
    },
  };
  const result = await captureDevicePosition(geolocation);
  assert.deepEqual([result.lat,result.lng],[-6.2,106.8]);
  assert.equal(result.accuracyM,42);
  assert.equal(calls.length,2);
  assert.equal(calls[0].enableHighAccuracy,true);
  assert.equal(calls[1].enableHighAccuracy,false);
  assert.equal(calls[1].maximumAge,30000);

  let deniedCalls = 0;
  const denied = {
    getCurrentPosition(success, failure) {
      deniedCalls += 1;
      failure({ code:1, message:'denied' });
    },
  };
  await assert.rejects(
    captureDevicePosition(denied),
    error => error?.code === 'GPS_PERMISSION_REQUIRED',
  );
  assert.equal(deniedCalls,1);
});
