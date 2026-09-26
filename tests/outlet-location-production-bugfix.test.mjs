import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('outlet GPS locks coordinates before optional reverse geocoding', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field, /function lockOutletCoordinates/);
  assert.match(field, /validCoordinatePair\(latValue, lngValue\)/);
  const start = field.indexOf('window.FS.captureOutletLocation = async function');
  const end = field.indexOf('export { locationTypeLabel };', start);
  const capture = field.slice(start, end);
  const lock = capture.indexOf('lockOutletCoordinates(lat, lng');
  const enrich = capture.indexOf('enrichLockedOutletLocation');
  assert.ok(lock >= 0 && enrich > lock, 'coordinates must lock before reverse geocoding starts');
  assert.match(capture, /void enrichLockedOutletLocation/);
});

test('outlet GPS retries with lower accuracy on laptop/mobile positioning timeout', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field, /enableHighAccuracy:true, timeout:10000, maximumAge:30000/);
  assert.match(field, /enableHighAccuracy:false, timeout:12000, maximumAge:120000/);
  assert.match(field, /Number\(error\?\.code\) === 1/);
  assert.match(field, /Izin lokasi diblokir/);
});

test('new outlet map never treats empty hidden coordinates as zero-zero', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field, /const currentPair = validCoordinatePair\(/);
  assert.match(field, /const hasCurrent = Boolean\(currentPair\)/);
  assert.doesNotMatch(field, /const currentLat = Number\(document\.getElementById\('outletLat'\)\?\.value\)/);
});

test('mobile map confirmation uses safe HTTPS URL and never auto-opens a custom geo scheme', async () => {
  const field = await read('src/field-sales.js');
  assert.doesNotMatch(field, /return `geo:/);
  assert.match(field, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  const start = field.indexOf('window.FS.captureOutletLocation = async function');
  const capture = field.slice(start);
  assert.doesNotMatch(capture, /open\.click\(\)/);
});

test('manager outlet forms expose the same resilient device-location action', async () => {
  const app = await read('src/app.js');
  const matches = app.match(/id="outletLocBtn" data-pqt-onclick="FS\.captureOutletLocation\(\)"/g) || [];
  assert.ok(matches.length >= 2, 'new/edit manager outlet forms should expose Lokasi Saya');
  assert.match(app, /Buka Maps untuk konfirmasi/);
});
