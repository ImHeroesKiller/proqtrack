import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserShim, setSession, device } from './helpers/memory-storage.mjs';
import { hashPassword, esc, formatEvidenceStamp } from '../src/lib/utils.js';

installBrowserShim();

const {
  getDB, resetDB, __resetForTests, authenticate, saveDB,
  getEmployees, getVisits, getProductSales, createProductSale,
  detectAreaAttendance, getAttendanceEvents,
  createSurveyTemplate, updateSurveyTemplate, assignSurvey,
  surveysForField, saveSurveyDraft, submitSurveyResponse,
  getSurveyResponses, surveyMonitoring,
  startRackEvidence, attachRackPhoto, createFieldPhoto, rackPairStatus,
  getOutlets, createVisit,
} = await import('../src/lib/db.js');
const { buildActivityEvents, exportCsv, PAGE_SIZE, activityPage } = await import('../src/reports/m3.js');

const TEST_PASSWORD = 'test-pass-12';

function prepare() {
  __resetForTests();
  resetDB();
  for (const acc of getDB().accounts) acc.password = hashPassword(TEST_PASSWORD);
}

function login(email, dev = device('DEV-AGENT-1')) {
  const acc = authenticate(email, TEST_PASSWORD, dev);
  assert.ok(acc, `login failed ${email}`);
  setSession(acc);
  return acc;
}

test('isolation matrix: sales / supervisor / manager / head', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const mine = getVisits();
  assert.ok(mine.every(v => v.employeeId === 'EMP001'));
  const myIds = new Set(getEmployees().map(e => e.id));
  assert.equal(myIds.has('EMP001'), true);
  assert.equal(myIds.has('EMP002'), false);

  login('rizki.pratama@proqtrack.id', device('DEV-AGENT-SPV'));
  const team = new Set(getEmployees().map(e => e.id));
  assert.equal(team.has('EMP001'), true);
  assert.equal(team.has('EMP005'), true);

  login('pm@proqtrack.id', device('DEV-AGENT-PM'));
  const leaked = getVisits().filter(v => v.projectId && v.projectId !== 'PRJ001');
  assert.equal(leaked.length, 0);

  login('manager@proqtrack.id', device('DEV-AGENT-HEAD'));
  getDB().employees.push({
    id: 'EMP-XORG', name: 'Other Org', email: 'x@other.id', role: 'Field Sales',
    organizationId: 'ORG-OTHER', status: 'active',
  });
  saveDB();
  assert.equal(getEmployees().some(e => e.id === 'EMP-XORG'), false);
});

test('simulated geofence: outside, enter, still inside, exit, re-enter', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = getOutlets().find(x => Number.isFinite(Number(x.lat)));
  const far = detectAreaAttendance({ lat: Number(o.lat) + 1, lng: o.lng, accuracy: 8 });
  assert.equal(far.reason, 'outside');
  const enter = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
  assert.equal(enter.event.source, 'auto_geofence');
  const stay = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
  assert.equal(stay.reason, 'still_inside');
  const exit = detectAreaAttendance({ lat: Number(o.lat) + 1, lng: o.lng, accuracy: 8 });
  assert.equal(exit.reason, 'outside');
  const again = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
  assert.equal(again.event?.source, 'auto_geofence');
  const events = getAttendanceEvents().filter(e => e.outletId === o.id && e.employeeId === 'EMP001');
  assert.equal(events.length, 2);
});

test('survey lifecycle, assignment, draft, submit, duplicate, expired, monitoring math', () => {
  prepare();
  login('manager@proqtrack.id');
  const survey = createSurveyTemplate({
    name: 'Shelf',
    questions: [
      { id: 'Q1', label: 'In stock?', type: 'yes_no', required: true, order: 0 },
      { id: 'Q2', label: 'Note', type: 'short_text', required: false, order: 1 },
    ],
  });
  updateSurveyTemplate(survey.id, { status: 'active' });
  assignSurvey({ surveyId: survey.id, employeeId: 'EMP001' });
  const mon0 = surveyMonitoring(survey.id);
  assert.equal(mon0.assigned, 1);
  assert.equal(mon0.completed, 0);
  assert.equal(mon0.pct, 0);

  login('budi.santoso@proqtrack.id', device('DEV-AGENT-SV'));
  assert.ok(surveysForField().some(s => s.id === survey.id));
  assert.throws(() => submitSurveyResponse({ surveyId: survey.id, answers: {} }), /required/i);
  saveSurveyDraft({ surveyId: survey.id, answers: { Q1: '' } });
  submitSurveyResponse({ surveyId: survey.id, answers: { Q1: 'yes' } });
  assert.throws(() => submitSurveyResponse({ surveyId: survey.id, answers: { Q1: 'yes' } }), /Already submitted/);
  const mon = surveyMonitoring(survey.id);
  assert.equal(mon.completed, 1);
  assert.equal(mon.pct, 100);

  login('manager@proqtrack.id', device('DEV-AGENT-HEAD2'));
  const expired = createSurveyTemplate({
    name: 'Old',
    questions: [{ id: 'Q1', label: 'X', type: 'short_text', required: true, order: 0 }],
  });
  updateSurveyTemplate(expired.id, { status: 'active', endDate: '2020-01-01' });
  login('budi.santoso@proqtrack.id', device('DEV-AGENT-SV'));
  assert.throws(() => submitSurveyResponse({ surveyId: expired.id, answers: { Q1: 'x' } }), /expired/);
});

test('product sales amount, sku, double create is two records unless UI guards, analytics from actuals', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const product = getDB().products.find(p => p.status === 'active');
  const a = createProductSale({ employeeId: 'EMP001', productId: product.id, qty: 2, unitPrice: 1500 });
  assert.equal(a.amount, 3000);
  assert.equal(a.sku, product.sku);
  createProductSale({ employeeId: 'EMP001', productId: product.id, qty: 1, unitPrice: 1500 });
  const mine = getProductSales().filter(s => s.employeeId === 'EMP001');
  assert.equal(mine.length >= 2, true);
  const total = mine.reduce((n, s) => n + Number(s.amount), 0);
  assert.equal(total >= 4500, true);
});

test('rack before/after states and activity report with incomplete pair', () => {
  prepare();
  login('budi.santoso@proqtrack.id');
  const o = getOutlets()[0];
  const visit = createVisit({ employeeId: 'EMP001', outletId: o.id, date: '2026-08-20', status: 'checked-in' });
  const before = createFieldPhoto({ employeeId: 'EMP001', visitId: visit.id, outletId: o.id, type: 'rack_before', dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' });
  const pair = attachRackPhoto(visit.id, 'before', before.id);
  assert.equal(rackPairStatus(pair), 'waiting_after');
  const other = createVisit({ employeeId: 'EMP001', outletId: o.id, date: '2026-08-21', status: 'checked-in' });
  startRackEvidence(other.id);
  assert.throws(() => attachRackPhoto(other.id, 'after', before.id), /before|visit|Outlet/i);
  const events = buildActivityEvents({
    attendance: [], pairs: [pair], photos: [before], stocks: [], prices: [], intel: [],
    responses: [], sales: [], employees: [], outlets: [o],
  }, visit);
  assert.ok(events.some(e => e.kind === 'Rack Before'));
  const html = activityPage({
    visits: [visit], employees: getEmployees(), outlets: getOutlets(), projects: getDB().projects || [],
    db: getDB(), photos: [before], pairs: [pair], attendance: [], stocks: [], prices: [], intel: [],
    responses: [], sales: [],
  });
  assert.match(html, /Waiting for After Photo|BEFORE/);
  assert.doesNotMatch(html, /undefined is not/);
});

test('report helpers escape XSS and paginate at 100', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(PAGE_SIZE, 100);
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: `R${i}`, notes: i === 0 ? '<script>' : null }));
  const csv = exportCsv('visits', ['id', 'notes'], rows);
  assert.equal(csv.rows.length, 120);
  assert.equal(formatEvidenceStamp('not-a-date'), '—');
});
