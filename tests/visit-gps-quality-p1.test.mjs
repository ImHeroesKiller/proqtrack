import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessVisitGpsQuality, VISIT_GPS_MAX_ACCURACY_M, VISIT_GPS_MAX_FIX_AGE_MS,
} from '../src/lib/visit-gps-quality.js';
import { captureDevicePosition, visitGeofenceEvidence } from '../src/lib/location-evidence.js';

const now=Date.parse('2026-11-09T12:00:00.000Z');
const when=ms=>new Date(now-ms).toISOString();

test('GPS quality accepts precise fresh positions and rejects accuracy/missing timestamp', () => {
  assert.equal(VISIT_GPS_MAX_ACCURACY_M,50);
  assert.equal(assessVisitGpsQuality({accuracyM:42,capturedAt:when(1000)},{nowMs:now}).ok,true);
  assert.equal(assessVisitGpsQuality({accuracyM:51,capturedAt:when(1000)},{nowMs:now}).code,'GPS_ACCURACY_LOW');
  assert.equal(assessVisitGpsQuality({accuracyM:null,capturedAt:when(1000)},{nowMs:now}).code,'GPS_ACCURACY_REQUIRED');
  assert.equal(assessVisitGpsQuality({accuracyM:0,capturedAt:when(1000)},{nowMs:now}).code,'GPS_ACCURACY_REQUIRED');
  assert.equal(assessVisitGpsQuality({accuracyM:1,capturedAt:null},{nowMs:now}).code,'GPS_TIMESTAMP_INVALID');
  assert.equal(assessVisitGpsQuality({accuracyM:1,capturedAt:when(VISIT_GPS_MAX_FIX_AGE_MS+1)},{nowMs:now}).code,'GPS_STALE');
});

test('historic offline fixes remain valid to the server but not newly captured ones', () => {
  const old={accuracyM:17,capturedAt:when(86400000)};
  assert.equal(assessVisitGpsQuality(old,{nowMs:now}).code,'GPS_STALE');
  assert.equal(assessVisitGpsQuality(old,{nowMs:now,allowHistoric:true}).ok,true);
  assert.equal(assessVisitGpsQuality({accuracyM:30,capturedAt:new Date(now+121000).toISOString()},{nowMs:now,allowHistoric:true}).code,'GPS_TIMESTAMP_INVALID');
});

test('device retries poor accuracy automatically, accepts second precise fix', async () => {
  let calls=0;
  const geolocation={
    getCurrentPosition(success, failure, options) {
      calls+=1;
      success({coords:{latitude:-6.2,longitude:106.8,accuracy:calls===1?250:12},timestamp:Date.now()});
    },
  };
  const result=await captureDevicePosition(geolocation);
  assert.equal(calls,2);
  assert.equal(result.accuracyM,12);
});

test('device rejects repeated coarse fixes and does not record fake GPS', async () => {
  let calls=0;
  const geolocation={
    getCurrentPosition(success) {
      calls+=1;
      success({coords:{latitude:-6.2,longitude:106.8,accuracy:350},timestamp:Date.now()});
    },
  };
  await assert.rejects(captureDevicePosition(geolocation),
    err=>err?.code==='GPS_ACCURACY_LOW' && err.accuracyM===350);
  assert.equal(calls,2);
});

test('geofence never treats missing outlet GPS as zero-zero coordinates', () => {
  assert.throws(()=>visitGeofenceEvidence({lat:null,lng:null},{lat:-6.2,lng:106.8}),
    err=>err.code==='VISIT_GEOFENCE_UNAVAILABLE');
});

test('server enforces the same GPS quality policy when starting or completing a visit', async () => {
  const { readFile } = await import('node:fs/promises');
  const worker=await readFile(new URL('../worker/operations.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const start=worker.indexOf('async function applyVisitGeofenceAuthority');
  const end=worker.indexOf('const finalLeaveStatuses',start);
  const block=worker.slice(start,end);
  assert.match(block,/assessVisitGpsQuality\(\{ accuracyM, capturedAt \}, \{ allowHistoric:true \}\)/);
  assert.match(block,/checkInAccuracyM/);
  assert.match(block,/checkOutAccuracyM/);
  assert.match(block,/error:'VISIT_' \+ quality.code/);
  assert.match(app,/GPS_ACCURACY_LOW/);
  assert.match(app,/VISIT_GPS_ACCURACY_LOW/);
});

test('visit duration handles midnight and canonical full timestamps', async () => {
  const { formatDuration }=await import('../src/lib/utils.js');
  assert.equal(formatDuration('23:50','00:15'), '25m');
  assert.equal(formatDuration('22:30','01:15'), '2j 45m');
  assert.equal(formatDuration('23:50','00:10',
    '2026-11-09T16:50:00Z','2026-11-09T17:10:00Z'), '20m');
  assert.equal(formatDuration(null,null,
    '2026-11-09T12:00:00Z','2026-11-09T13:30:00Z'), '1j 30m');
  assert.equal(formatDuration('12:00','14:00',
    '2026-11-09T13:00:00Z','2026-11-09T12:00:00Z'), '-');
  assert.equal(formatDuration('25:00','00:00'), '-');
});

test('visit UI uses persisted timestamps for duration in list and detail', async () => {
  const { readFile }=await import('node:fs/promises');
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const field=await readFile(new URL('../src/field-sales.js',import.meta.url),'utf8');
  assert.match(app,/formatDuration\(visit\.checkInTime, visit\.checkOutTime, visit\.startedAt, visit\.completedAt\)/);
  assert.match(field,/formatDuration\(v\.checkInTime, v\.checkOutTime, v\.startedAt, v\.completedAt\)/);
});
