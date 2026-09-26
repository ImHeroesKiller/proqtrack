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


test('outlet async location work cannot write into a replaced or closed modal', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field, /function outletFormContext\(\)/);
  assert.match(field, /function outletFormContextActive\(context\)/);
  assert.match(field, /document\.getElementById\('outletLat'\) === context\.latEl/);
  const captureStart = field.indexOf('window.FS.captureOutletLocation = async function');
  const capture = field.slice(captureStart);
  assert.match(capture, /if \(!outletFormContextActive\(context\)\) return;/);
  assert.match(capture, /enrichLockedOutletLocation\(Number\(lat\), Number\(lng\), accuracyM, context\)/);
});

test('map click locks coordinates immediately and reverse geocoding has a bounded timeout', async () => {
  const field = await read('src/field-sales.js');
  assert.match(field, /const OUTLET_GEOCODE_TIMEOUT_MS = 8000/);
  const mapStart = field.indexOf("_outletMap.on('click'");
  const searchStart = field.indexOf('window.FS.searchOutletMap', mapStart);
  const click = field.slice(mapStart, searchStart);
  const lockIndex = click.indexOf("lockOutletCoordinates(lat, lng, { source:'map' })");
  const geocodeIndex = click.indexOf('await reverseGeocode');
  assert.ok(lockIndex >= 0 && geocodeIndex > lockIndex, 'map coordinate lock must precede reverse geocoding');
  assert.match(click, /timedOut = true/);
  assert.match(click, /controller\.abort\(\)/);
});

test('map search is single-flight, timeout bounded, and exposes progress state', async () => {
  const [field, app] = await Promise.all([read('src/field-sales.js'), read('src/app.js')]);
  assert.match(field, /const OUTLET_SEARCH_TIMEOUT_MS = 10000/);
  assert.match(field, /_outletSearchController\?\.abort\(\)/);
  assert.match(field, /button\.textContent = 'Mencari…'/);
  assert.match(field, /Pencarian lokasi terlalu lama/);
  assert.match(field, /validCoordinatePair\(hit\.lat, hit\.lon\)/);
  const matches = app.match(/id="outletMapSearchBtn"/g) || [];
  assert.ok(matches.length >= 2, 'manager new/edit outlet forms should expose deterministic search button state');
});


test('GPS map click and address search cancel stale competing location work', async () => {
  const field = await read('src/field-sales.js');
  const mapStart = field.indexOf("_outletMap.on('click'");
  const searchStart = field.indexOf('window.FS.searchOutletMap', mapStart);
  const gpsStart = field.indexOf('window.FS.captureOutletLocation = async function', searchStart);
  const mapBlock = field.slice(mapStart, searchStart);
  const searchBlock = field.slice(searchStart, gpsStart);
  const gpsBlock = field.slice(gpsStart);
  assert.match(mapBlock, /_outletSearchController\?\.abort\(\)/);
  assert.match(searchBlock, /_outletGeocodeController\?\.abort\(\)/);
  assert.match(gpsBlock, /_outletSearchController\?\.abort\(\)/);
  assert.match(gpsBlock, /_outletGeocodeController\?\.abort\(\)/);
  assert.match(searchBlock, /if \(_outletSearchController === controller\)/);
});
