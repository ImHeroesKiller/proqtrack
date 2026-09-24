import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validCoordinatePair } from '../src/lib/utils.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Last Location validates coordinate pairs atomically', async () => {
  assert.equal(validCoordinatePair(-6.2,106.8), true);
  assert.equal(validCoordinatePair(91,106.8), false);
  assert.equal(validCoordinatePair(-6.2,181), false);
  assert.equal(validCoordinatePair('',106.8), false);
  const db = await read('src/lib/db.js');
  assert.match(db, /hasCheckInLat !== hasCheckInLng/);
  assert.match(db, /validCoordinatePair\(data\.checkInLat,data\.checkInLng\)/);
  assert.match(db, /checkInAccuracyM/);
  assert.match(db, /checkInCapturedAt/);
  assert.match(db, /locationSource/);
});

test('self visit check-in captures device GPS evidence while admin record is not GPS', async () => {
  const app = await read('src/app.js');
  assert.match(app, /async function checkInVisitWithGps/);
  assert.match(app, /captureDevicePosition/);
  assert.match(app, /checkInLat:gps\.lat/);
  assert.match(app, /checkInLng:gps\.lng/);
  assert.match(app, /checkInAccuracyM:gps\.accuracyM/);
  assert.match(app, /checkInCapturedAt:gps\.capturedAt/);
  assert.match(app, /locationSource:'device_gps'/);
  assert.match(app, /payload\.locationSource = 'admin_record'/);
  assert.match(app, /window\.FT\.checkInVisit = async function/);
  assert.match(app, /window\.FT\.mobileCheckIn = async function/);
});

test('Last Location separates device GPS from outlet reference and never claims still at location', async () => {
  const [app, field] = await Promise.all([
    read('src/app.js'),
    read('src/field-sales.js'),
  ]);
  assert.match(app, /source:'outlet_reference'/);
  assert.match(app, /Referensi outlet — bukan posisi perangkat/);
  assert.match(app, /Belum check-out/);
  assert.doesNotMatch(app, /masih di lokasi/);
  assert.match(field, /Referensi outlet — bukan posisi perangkat/);
  assert.match(field, /belum check-out/);
  assert.doesNotMatch(field, /masih di lokasi/);
});

test('Last Location refreshes from cloud without overwriting pending local changes', async () => {
  const [app, cloud] = await Promise.all([
    read('src/app.js'),
    read('src/lib/cloud-data.js'),
  ]);
  assert.match(app, /setInterval\(\(\) => \{/);
  assert.match(app, /}, 30000\)/);
  assert.match(app, /refreshTrackingData/);
  assert.match(app, /configureTrackingRefresh/);
  assert.match(app, /window\.FT\.refreshTracking/);
  assert.match(app, /visibilityState === 'visible'/);
  assert.match(cloud, /syncing \|\| queuedSnapshot/);
  assert.match(cloud, /diffSnapshots\(baseline,currentSnapshot\)\.length/);
});

test('Last Location freshness is evidence based', async () => {
  const app = await read('src/app.js');
  assert.match(app, /function locationFreshness/);
  assert.match(app, /GPS .* mnt lalu/);
  assert.match(app, /GPS hari ini · stale/);
  assert.match(app, /Referensi outlet/);
  assert.match(app, /Lokasi lama/);
});
